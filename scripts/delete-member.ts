import "dotenv/config";

import { mergeMember } from "@/lib/admin/merge-members";
import { recordAuditEvent } from "@/lib/audit-log";
import { getMemberContentCounts } from "@/lib/member-reconciliation";
import { prisma } from "@/lib/prisma";

/**
 * Permanently deletes a Member row.
 *
 * A plain `DELETE FROM "Member"` fails: Task.createdBy, Doc.author,
 * Transaction.member, CalendarEvent.createdBy, Project.owner,
 * Meeting.organizer, AgendaProposal.proposedBy, AgendaItem.addedBy and
 * both Penalty relations all reference Member with Restrict. Anything the
 * row authored has to move somewhere first, or the delete is refused by
 * the database.
 *
 * So this script refuses to guess. If the row owns nothing, it deletes it
 * outright. If it owns anything, it stops and makes you name where that
 * work goes via --reassign-to, because the alternative is destroying the
 * record of who did it.
 *
 *   npx tsx scripts/delete-member.ts --id <memberId>
 *   npx tsx scripts/delete-member.ts --id <memberId> --reassign-to <memberId> --apply
 *
 * Dry run by default. Nothing is written without --apply.
 *
 * The deletion is recorded in the AuditLog. If that table doesn't exist
 * yet — the admin console's migration hasn't been deployed to the database
 * being targeted — the script stops and says so rather than deleting
 * unrecorded. Pass --no-audit to proceed anyway, which is a deliberate
 * choice to lose the record of this deletion, not a default.
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

  const leader = await prisma.member.findFirst({ where: { isLeader: true } });
  if (!leader) {
    throw new Error("No Leader found; pass --actor <memberId> to attribute this deletion");
  }
  return { id: leader.id, displayName: leader.displayName, clerkUserId: leader.clerkUserId };
}

async function main() {
  const id = arg("id");
  const email = arg("email");
  const reassignTo = arg("reassign-to");
  const reason = arg("reason") ?? "Duplicate account removed";
  const apply = process.argv.includes("--apply");
  const skipAudit = process.argv.includes("--no-audit");

  if (!id && !email) {
    console.error(
      "Usage: npx tsx scripts/delete-member.ts (--id <memberId> | --email <address>) " +
        '[--reassign-to <memberId>] [--reason "why"] [--actor <memberId>] [--apply]',
    );
    process.exit(1);
  }

  const member = id
    ? await prisma.member.findUnique({ where: { id } })
    : await prisma.member.findFirst({ where: { email } });

  if (!member) {
    console.error(`\nNo member found for ${id ? `id ${id}` : `email ${email}`}.`);
    process.exit(1);
  }

  // The Leader's seat is a fixed identity (context/team-roster.md) — the
  // same guard the API enforces.
  if (member.isLeader) {
    console.error(`\nRefused: ${member.displayName} is the Leader. That seat can't be deleted.`);
    process.exit(1);
  }

  const content = await getMemberContentCounts(member.id);
  const actor = await resolveActor();

  console.log(`\nDelete  ${member.displayName} <${member.email}>`);
  console.log(`  id     ${member.id}`);
  console.log(`  clerk  ${member.clerkUserId}`);
  console.log(`  status ${member.status}`);
  console.log(`  as     ${actor.displayName}`);

  const owned = Object.entries(content).filter(
    ([key, value]) => key !== "total" && typeof value === "number" && value > 0,
  );

  if (content.total === 0) {
    console.log("\n  Owns nothing — safe to delete outright.");
  } else {
    console.log(`\n  Owns ${content.total} record(s):`);
    for (const [key, value] of owned) console.log(`    ${String(value).padStart(4)}  ${key}`);

    if (!reassignTo) {
      console.error(
        "\nRefused: this row owns work, and deleting it would delete the record of who did it.\n" +
          "Pass --reassign-to <memberId> to move that work to the right person first.\n" +
          "For a duplicate account that is the same human, that's their real member id.",
      );
      process.exit(1);
    }

    const target = await prisma.member.findUnique({ where: { id: reassignTo } });
    if (!target) {
      console.error(`\nRefused: reassign target ${reassignTo} not found.`);
      process.exit(1);
    }
    if (target.id === member.id) {
      console.error("\nRefused: can't reassign a member's work to itself.");
      process.exit(1);
    }
    console.log(`\n  All of it moves to ${target.displayName} <${target.email}> before deletion.`);
  }

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to delete.");
    return;
  }

  if (content.total > 0 && reassignTo) {
    const merged = await mergeMember(actor, member.id, reassignTo, reason);
    if (!merged.ok) {
      console.error(`\nRefused during reassignment: ${merged.error}`);
      process.exit(1);
    }
    console.log(
      `\n  Reassigned ${merged.result.moved} record(s), dropped ${merged.result.deduplicated} duplicate link(s).`,
    );
  }

  // Audit first, then delete. AuditLog.entityId is a plain string with no
  // foreign key, so the entry outlives the row it describes — which is the
  // point of writing it.
  if (skipAudit) {
    console.log(
      "\n  --no-audit: this deletion will NOT be recorded. Nothing will show who removed\n" +
        "  this row or why. Deploy the admin console migration and drop the flag to log it.",
    );
  } else {
    try {
      await recordAuditEvent({
        actor,
        action: "member.deleted",
        entityType: "MEMBER",
        entityId: member.id,
        entityLabel: `${member.displayName} <${member.email}>`,
        before: { status: member.status, clerkUserId: member.clerkUserId, content: { ...content } },
        after: { deleted: true, reassignedTo: reassignTo ?? null },
        reason,
      });
    } catch (error) {
      // P2021 = the table doesn't exist. That means this database is
      // behind on migrations, not that the delete is unsafe — but
      // deleting without recording it is a call for the operator to make
      // explicitly, so stop here instead of quietly proceeding.
      const code = (error as { code?: string }).code;
      if (code !== "P2021") throw error;

      console.error(
        "\nRefused: the AuditLog table doesn't exist in this database, so the deletion\n" +
          "can't be recorded. This database is behind on migrations.\n\n" +
          "  Either:  npx prisma migrate deploy   (then re-run this command)\n" +
          "  Or:      re-run with --no-audit to delete without a record.\n\n" +
          "Nothing has been changed.",
      );
      process.exit(1);
    }
  }

  await prisma.member.delete({ where: { id: member.id } });
  console.log(`\nDeleted ${member.displayName} <${member.email}>.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\ndelete-member failed:", error);
    process.exit(1);
  });
