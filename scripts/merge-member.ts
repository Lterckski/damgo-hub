import "dotenv/config";
import { clerkClient } from "@clerk/nextjs/server";

import { mergeMember } from "@/lib/admin/merge-members";
import { getMemberContentCounts, reconcileMembers } from "@/lib/member-reconciliation";
import { prisma } from "@/lib/prisma";

/**
 * Folds a duplicate Member row into the person's real record, from the
 * command line — for fixing the data before the admin console that does
 * this in the UI has been deployed.
 *
 * Dry run by default. Nothing is written without --apply.
 *
 *   npx tsx scripts/merge-member.ts --source <id> --target <id> --reason "..."
 *   npx tsx scripts/merge-member.ts --source <id> --target <id> --reason "..." --apply
 *
 * Use this rather than DELETE /api/members/[memberId] whenever the two
 * rows are the same person: that route reassigns the deleted member's
 * content to whoever ran it, which is right for someone who left the team
 * and wrong for a duplicate account.
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function resolveActor(): Promise<{ id: string; displayName: string; clerkUserId: string }> {
  const explicit = arg("actor");
  if (explicit) {
    const member = await prisma.member.findUniqueOrThrow({ where: { id: explicit } });
    return { id: member.id, displayName: member.displayName, clerkUserId: member.clerkUserId };
  }

  // Default to the Leader — this is their call to make, and the audit entry
  // has to name a real person rather than "script".
  const leader = await prisma.member.findFirst({ where: { isLeader: true } });
  if (!leader) {
    throw new Error("No Leader found; pass --actor <memberId> to attribute this merge explicitly");
  }
  return { id: leader.id, displayName: leader.displayName, clerkUserId: leader.clerkUserId };
}

async function main() {
  const sourceId = arg("source");
  const targetId = arg("target");
  const reason = arg("reason");
  const apply = process.argv.includes("--apply");

  if (!sourceId || !targetId || !reason) {
    console.error(
      "Usage: npx tsx scripts/merge-member.ts --source <id> --target <id> --reason \"why\" [--actor <id>] [--apply]",
    );
    process.exit(1);
  }

  const [source, target] = await Promise.all([
    prisma.member.findUnique({ where: { id: sourceId } }),
    prisma.member.findUnique({ where: { id: targetId } }),
  ]);
  if (!source) throw new Error(`Source member ${sourceId} not found`);
  if (!target) throw new Error(`Target member ${targetId} not found`);

  const content = await getMemberContentCounts(sourceId);
  const actor = await resolveActor();

  console.log(`\nMerge  ${source.displayName} <${source.email}>`);
  console.log(`  into ${target.displayName} <${target.email}>`);
  console.log(`  as   ${actor.displayName}`);
  console.log(`  why  ${reason}\n`);

  console.log(`Records that will move (${content.total}):`);
  const owned = Object.entries(content).filter(
    ([key, value]) => key !== "total" && typeof value === "number" && value > 0,
  );
  if (owned.length === 0) console.log("  (none — a plain status change)");
  for (const [key, value] of owned) console.log(`  ${String(value).padStart(4)}  ${key}`);

  // Sanity check the direction: merging away a row that IS a current Clerk
  // org member almost certainly means source and target were swapped.
  try {
    const client = await clerkClient();
    const { data } = await client.organizations.getOrganizationList({ limit: 10 });
    if (data.length === 1) {
      const report = await reconcileMembers(data[0].id);
      const sourceIsLive = report.matched.some((row) => row.id === sourceId);
      const targetIsOrphan = report.inLocalNotClerk.some((row) => row.id === targetId);
      if (sourceIsLive) {
        console.log(
          "\n  WARNING: the source is a current Clerk org member. You are merging away a live\n" +
            "  account. Check that --source and --target aren't reversed.",
        );
      }
      if (targetIsOrphan) {
        console.log(
          "\n  WARNING: the target is NOT in the Clerk org. You would be merging into a dead\n" +
            "  account. Check that --source and --target aren't reversed.",
        );
      }
    }
  } catch {
    console.log("\n  (Couldn't reach Clerk to sanity-check the merge direction.)");
  }

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to perform the merge.");
    return;
  }

  const outcome = await mergeMember(actor, sourceId, targetId, reason);
  if (!outcome.ok) {
    console.error(`\nRefused: ${outcome.error}`);
    process.exit(1);
  }

  console.log(
    `\nDone. ${outcome.result.moved} record(s) moved, ` +
      `${outcome.result.deduplicated} duplicate link(s) dropped. ` +
      `${outcome.sourceName} is now marked REMOVED.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nmerge-member failed:", error);
    process.exit(1);
  });
