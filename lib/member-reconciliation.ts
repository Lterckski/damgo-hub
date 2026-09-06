import { clerkClient } from "@clerk/nextjs/server";

import { organizationMemberProfile } from "@/lib/member-profile";
import { prisma } from "@/lib/prisma";

/**
 * Diffs the Clerk organization roster against the local `Member` table.
 *
 * This exists because `/admin`'s member count was a bare
 * `prisma.member.count()` — the only member query in the app that did NOT
 * scope to the Clerk org roster (every other one filters
 * `clerkUserId: { in: [...orgRoles.keys()] }`), so a local row whose Clerk
 * user is no longer an org member inflated the number silently while
 * `/admin/members` kept showing the correct, filtered list.
 *
 * Read-only by design: it reports drift, it never repairs it. Repair is a
 * separate, explicit, audited admin action — see 20-admin-dashboard.md.
 */

export interface ClerkOnlyRow {
  clerkUserId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
}

export interface LocalOnlyRow {
  id: string;
  clerkUserId: string;
  email: string;
  displayName: string;
  status: string;
  isLeader: boolean;
  createdAt: string;
  /**
   * What this row still owns. Only populated for orphans (in the local
   * table, not in the Clerk org) — it's the difference between "delete it"
   * and "merge it", and without it an admin is deciding blind. An orphan
   * holding real work must not be hard-deleted, because
   * DELETE /api/members/[memberId] reassigns that work to whoever clicked
   * the button, which misattributes it.
   */
  content?: MemberContentCounts;
}

export interface MemberContentCounts {
  tasksCreated: number;
  taskAssignments: number;
  docs: number;
  transactions: number;
  penaltiesReceived: number;
  penaltiesIssued: number;
  projectsOwned: number;
  projectMemberships: number;
  meetingsOrganized: number;
  meetingParticipations: number;
  agendaProposals: number;
  agendaItems: number;
  calendarEvents: number;
  total: number;
}

export interface MatchedRow extends LocalOnlyRow {
  clerkRole: string;
}

/** Counts everything a Member row still owns, for the merge/delete decision. */
export async function getMemberContentCounts(memberId: string): Promise<MemberContentCounts> {
  const [
    tasksCreated,
    taskAssignments,
    docs,
    transactions,
    penaltiesReceived,
    penaltiesIssued,
    projectsOwned,
    projectMemberships,
    meetingsOrganized,
    meetingParticipations,
    agendaProposals,
    agendaItems,
    calendarEvents,
  ] = await Promise.all([
    prisma.task.count({ where: { createdById: memberId } }),
    prisma.taskAssignee.count({ where: { memberId } }),
    prisma.doc.count({ where: { authorId: memberId } }),
    prisma.transaction.count({ where: { memberId } }),
    prisma.penalty.count({ where: { memberId } }),
    prisma.penalty.count({ where: { issuedById: memberId } }),
    prisma.project.count({ where: { ownerId: memberId } }),
    prisma.projectMember.count({ where: { memberId } }),
    prisma.meeting.count({ where: { organizerId: memberId } }),
    prisma.meetingParticipant.count({ where: { memberId } }),
    prisma.agendaProposal.count({ where: { proposedById: memberId } }),
    prisma.agendaItem.count({ where: { addedById: memberId } }),
    prisma.calendarEvent.count({ where: { createdById: memberId } }),
  ]);

  const counts = {
    tasksCreated,
    taskAssignments,
    docs,
    transactions,
    penaltiesReceived,
    penaltiesIssued,
    projectsOwned,
    projectMemberships,
    meetingsOrganized,
    meetingParticipations,
    agendaProposals,
    agendaItems,
    calendarEvents,
  };

  return { ...counts, total: Object.values(counts).reduce((sum, n) => sum + n, 0) };
}

export interface RoleDriftRow {
  id: string;
  clerkUserId: string;
  displayName: string;
  /** What the local row implies (isLeader) vs. what Clerk actually grants. */
  isLeader: boolean;
  clerkRole: string;
}

export interface PendingInvitationRow {
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface DuplicateEmailGroup {
  email: string;
  memberIds: string[];
}

export interface MemberReconciliation {
  orgId: string;
  /** Members present in Clerk AND local — the real roster. */
  matched: MatchedRow[];
  /** In Clerk, no local row yet. Harmless: created on their next page load. */
  inClerkNotLocal: ClerkOnlyRow[];
  /** Local row whose Clerk user is not an org member. The count-inflating case. */
  inLocalNotClerk: LocalOnlyRow[];
  /** `isLeader` set on someone Clerk doesn't grant org:admin (or the reverse). */
  roleDrift: RoleDriftRow[];
  /** Same email on 2+ local rows — `Member.email` has no unique constraint. */
  duplicateEmails: DuplicateEmailGroup[];
  /** Clerk invitations that have not been accepted. Never counted as members. */
  pendingInvitations: PendingInvitationRow[];
  counts: {
    /** Local rows that ARE in the Clerk org and MemberStatus=ACTIVE. */
    active: number;
    /** Local rows in the Clerk org but MemberStatus=INACTIVE. */
    inactive: number;
    /** Outstanding Clerk invitations. Not members. */
    pending: number;
    /** Every row in the local table, filtered by nothing — the old, wrong number. */
    localTotal: number;
    /** Clerk org memberships. */
    clerkTotal: number;
  };
}

/** Every Clerk org membership, paginated. Exported for the sync action's own use. */
async function fetchOrgMemberships(orgId: string) {
  const client = await clerkClient();
  const rows: ClerkOnlyRow[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const { data } = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit,
      offset,
    });

    for (const membership of data) {
      const publicUserData = membership.publicUserData;
      if (!publicUserData) continue;
      const profile = organizationMemberProfile(publicUserData);
      rows.push({ ...profile, role: membership.role });
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return rows;
}

async function fetchPendingInvitations(orgId: string): Promise<PendingInvitationRow[]> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationInvitationList({
    organizationId: orgId,
    limit: 100,
  });

  // Clerk returns accepted/revoked invitations here too — only the ones
  // still outstanding are what "pending" means to an admin.
  return data
    .filter((invitation) => invitation.status === "pending")
    .map((invitation) => ({
      email: invitation.emailAddress,
      role: invitation.role,
      status: invitation.status ?? "pending",
      createdAt: new Date(invitation.createdAt).toISOString(),
    }));
}

export async function reconcileMembers(orgId: string): Promise<MemberReconciliation> {
  const [clerkMembers, pendingInvitations, localMembers] = await Promise.all([
    fetchOrgMemberships(orgId),
    fetchPendingInvitations(orgId),
    prisma.member.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const clerkByUserId = new Map(clerkMembers.map((m) => [m.clerkUserId, m]));
  const localByClerkId = new Map(localMembers.map((m) => [m.clerkUserId, m]));

  const toLocalRow = (m: (typeof localMembers)[number]): LocalOnlyRow => ({
    id: m.id,
    clerkUserId: m.clerkUserId,
    email: m.email,
    displayName: m.displayName,
    status: m.status,
    isLeader: m.isLeader,
    createdAt: m.createdAt.toISOString(),
  });

  const matched: MatchedRow[] = [];
  const inLocalNotClerk: LocalOnlyRow[] = [];
  const roleDrift: RoleDriftRow[] = [];

  for (const local of localMembers) {
    const clerk = clerkByUserId.get(local.clerkUserId);
    if (!clerk) {
      inLocalNotClerk.push(toLocalRow(local));
      continue;
    }
    matched.push({ ...toLocalRow(local), clerkRole: clerk.role });

    // The Leader is by definition an org:admin (context/team-roster.md).
    // isLeader without org:admin means someone's Clerk role was changed
    // out from under the local flag.
    if (local.isLeader && clerk.role !== "org:admin") {
      roleDrift.push({
        id: local.id,
        clerkUserId: local.clerkUserId,
        displayName: local.displayName,
        isLeader: local.isLeader,
        clerkRole: clerk.role,
      });
    }
  }

  const inClerkNotLocal: ClerkOnlyRow[] = clerkMembers.filter(
    (m) => !localByClerkId.has(m.clerkUserId),
  );

  // Only orphans get content counts — that's the one decision that needs
  // them, and it's a dozen counts per row.
  const orphanContent = await Promise.all(
    inLocalNotClerk.map((row) => getMemberContentCounts(row.id)),
  );
  inLocalNotClerk.forEach((row, index) => {
    row.content = orphanContent[index];
  });

  // Member.email has no @unique — only clerkUserId does. Two Clerk users
  // for one person (a personal sign-up plus the invited address) land here.
  const byEmail = new Map<string, string[]>();
  for (const local of localMembers) {
    const key = local.email.trim().toLowerCase();
    if (!key) continue;
    byEmail.set(key, [...(byEmail.get(key) ?? []), local.id]);
  }
  const duplicateEmails: DuplicateEmailGroup[] = [...byEmail]
    .filter(([, ids]) => ids.length > 1)
    .map(([email, memberIds]) => ({ email, memberIds }));

  return {
    orgId,
    matched,
    inClerkNotLocal,
    inLocalNotClerk,
    roleDrift,
    duplicateEmails,
    pendingInvitations,
    counts: {
      active: matched.filter((m) => m.status === "ACTIVE").length,
      inactive: matched.filter((m) => m.status === "INACTIVE").length,
      pending: pendingInvitations.length,
      localTotal: localMembers.length,
      clerkTotal: clerkMembers.length,
    },
  };
}

export interface ReconciliationRepair {
  /** Local rows created for Clerk members who had none. */
  created: number;
  /** Local rows marked REMOVED because their Clerk membership is gone. */
  markedRemoved: number;
}

/**
 * Applies the safe half of the diff: creates the missing local rows, and
 * marks the orphans REMOVED.
 *
 * Deliberately does NOT hard-delete. `Member` is referenced with `Restrict`
 * by Task, Doc, Transaction, Penalty, Meeting and Project — deleting a row
 * either fails outright or takes authorship with it, which is why
 * `DELETE /api/members/[memberId]` reassigns everything first and asks for
 * confirmation. A background reconciliation is not the place for that
 * decision, so it downgrades status and leaves the row for an admin to
 * delete deliberately from the Danger Zone.
 */
export async function applyReconciliation(orgId: string): Promise<ReconciliationRepair> {
  const report = await reconcileMembers(orgId);

  const created = report.inClerkNotLocal.length
    ? await prisma.member.createMany({
        data: report.inClerkNotLocal.map((row) => ({
          clerkUserId: row.clerkUserId,
          email: row.email,
          displayName: row.displayName,
          avatarUrl: row.avatarUrl,
          status: "ACTIVE" as const,
        })),
        skipDuplicates: true,
      })
    : { count: 0 };

  const orphanIds = report.inLocalNotClerk
    .filter((row) => row.status !== "REMOVED")
    .map((row) => row.id);

  const markedRemoved = orphanIds.length
    ? await prisma.member.updateMany({
        where: { id: { in: orphanIds } },
        data: { status: "REMOVED" },
      })
    : { count: 0 };

  return { created: created.count, markedRemoved: markedRemoved.count };
}
