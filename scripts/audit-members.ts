import "dotenv/config";
import { clerkClient } from "@clerk/nextjs/server";

import { reconcileMembers } from "@/lib/member-reconciliation";

/**
 * Read-only member-count audit. Run against whichever database
 * DATABASE_URL points at:
 *
 *   npx tsx scripts/audit-members.ts
 *   DATABASE_URL="<production url>" npx tsx scripts/audit-members.ts
 *
 * Prints the full local roster plus the Clerk diff, so an inflated
 * "Total Members" can be traced to a specific row instead of guessed at.
 * It never writes anything.
 */

async function resolveOrgId(): Promise<string> {
  if (process.env.CLERK_ORGANIZATION_ID) return process.env.CLERK_ORGANIZATION_ID;

  // No request context in a script, so there's no auth().orgId to read.
  // Damgo Hub is a single-organization app, so the sole org is unambiguous.
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationList({ limit: 10 });

  if (data.length === 0) throw new Error("No Clerk organization found for this instance");
  if (data.length > 1) {
    throw new Error(
      `Clerk instance has ${data.length} organizations — set CLERK_ORGANIZATION_ID to pick one: ` +
        data.map((org) => `${org.name}=${org.id}`).join(", "),
    );
  }

  return data[0].id;
}

async function main() {
  const orgId = await resolveOrgId();
  const report = await reconcileMembers(orgId);

  console.log(`\nClerk org: ${orgId}`);
  console.log(
    `counts  →  ${report.counts.active} active · ${report.counts.inactive} inactive · ` +
      `${report.counts.pending} pending invite(s)  |  local table rows: ${report.counts.localTotal}  |  ` +
      `Clerk memberships: ${report.counts.clerkTotal}`,
  );

  console.log("\n── Local Member table (every row, unfiltered — what /admin used to count) ──");
  console.table(
    [...report.matched, ...report.inLocalNotClerk].map((row) => ({
      id: row.id,
      clerkUserId: row.clerkUserId,
      email: row.email,
      displayName: row.displayName,
      clerkRole: "clerkRole" in row ? row.clerkRole : "— NOT IN CLERK ORG —",
      status: row.status,
      isLeader: row.isLeader,
      createdAt: row.createdAt,
    })),
  );

  const section = (title: string, rows: unknown[]) => {
    console.log(`\n── ${title} (${rows.length}) ──`);
    if (rows.length === 0) console.log("  none");
    else console.table(rows);
  };

  // Printed by hand rather than through console.table: each orphan carries
  // a nested content breakdown, and the merge-vs-remove decision is made
  // from those numbers, so they can't be collapsed to "[object Object]".
  console.log(`\n── In local table, NOT in Clerk org (${report.inLocalNotClerk.length}) ──`);
  if (report.inLocalNotClerk.length === 0) {
    console.log("  none");
  }
  for (const orphan of report.inLocalNotClerk) {
    console.log(`\n  ${orphan.displayName}  <${orphan.email}>`);
    console.log(`    id           ${orphan.id}`);
    console.log(`    clerkUserId  ${orphan.clerkUserId}`);
    console.log(`    status       ${orphan.status}`);
    console.log(`    createdAt    ${orphan.createdAt}`);

    const content = orphan.content;
    if (!content) continue;

    if (orphan.status === "REMOVED") {
      console.log("    owns         " + (content.total === 0 ? "nothing" : `${content.total} record(s)`));
      console.log("    → ALREADY HANDLED: marked REMOVED, and excluded from the member count.");
      continue;
    }

    if (content.total === 0) {
      console.log("    owns         nothing");
      console.log('    → REMOVE: nothing to preserve. Use the console\'s "Sync with Clerk" action,');
      console.log("      which marks orphans REMOVED without deleting the row.");
      continue;
    }

    const owned = Object.entries(content)
      .filter(([key, value]) => key !== "total" && typeof value === "number" && value > 0)
      .map(([key, value]) => `${key}=${value}`)
      .join("  ");
    console.log(`    owns         ${content.total} record(s):  ${owned}`);
    console.log("    → MERGE: this row owns real work. Removing it would reassign that work to");
    console.log("      whoever ran the removal. Use scripts/merge-member.ts instead.");
  }
  section("In Clerk org, no local row yet — created on their next page load", report.inClerkNotLocal);
  section("Role drift (isLeader vs. Clerk org:admin)", report.roleDrift);
  section("Duplicate emails across local rows", report.duplicateEmails);
  section("Pending Clerk invitations — never counted as members", report.pendingInvitations);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\naudit-members failed:", error);
    process.exit(1);
  });
