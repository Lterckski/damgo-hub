import { taskVisibilityWhere } from "@/lib/hub/context";
import {
  getClerkOrgMembers,
  getClerkPendingInvitations,
} from "@/lib/clerk-roster";
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

type MemberCountKey = Exclude<keyof MemberContentCounts, "total">;

/**
 * Counts content for a whole set of members with a fixed number of grouped
 * queries. Reconciliation used to issue thirteen counts for every orphan.
 */
export async function getMembersContentCounts(
  memberIds: readonly string[],
): Promise<Map<string, MemberContentCounts>> {
  const uniqueIds = [...new Set(memberIds)];
  const empty = (): MemberContentCounts => ({
    tasksCreated: 0,
    taskAssignments: 0,
    docs: 0,
    transactions: 0,
    penaltiesReceived: 0,
    penaltiesIssued: 0,
    projectsOwned: 0,
    projectMemberships: 0,
    meetingsOrganized: 0,
    meetingParticipations: 0,
    agendaProposals: 0,
    agendaItems: 0,
    calendarEvents: 0,
    total: 0,
  });
  const counts = new Map(uniqueIds.map((memberId) => [memberId, empty()]));
  if (uniqueIds.length === 0) return counts;

  const taskVisibility = await taskVisibilityWhere();
  const groups = await Promise.all([
    prisma.task.groupBy({
      by: ["createdById"],
      where: { AND: [taskVisibility, { createdById: { in: uniqueIds } }] },
      _count: { _all: true },
    }),
    prisma.taskAssignee.groupBy({
      by: ["memberId"],
      where: { memberId: { in: uniqueIds }, task: taskVisibility },
      _count: { _all: true },
    }),
    prisma.doc.groupBy({
      by: ["authorId"],
      where: { authorId: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["memberId"],
      where: { memberId: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.penalty.groupBy({
      by: ["memberId"],
      where: { memberId: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.penalty.groupBy({
      by: ["issuedById"],
      where: { issuedById: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.project.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.projectMember.groupBy({
      by: ["memberId"],
      where: { memberId: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.meeting.groupBy({
      by: ["organizerId"],
      where: { organizerId: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.meetingParticipant.groupBy({
      by: ["memberId"],
      where: { memberId: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.agendaProposal.groupBy({
      by: ["proposedById"],
      where: { proposedById: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.agendaItem.groupBy({
      by: ["addedById"],
      where: { addedById: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.calendarEvent.groupBy({
      by: ["createdById"],
      where: { createdById: { in: uniqueIds } },
      _count: { _all: true },
    }),
  ]);

  const apply = <R extends { _count: { _all: number } }>(
    key: MemberCountKey,
    rows: readonly R[],
    memberId: (row: R) => string,
  ) => {
    for (const row of rows) {
      const result = counts.get(memberId(row));
      if (result) result[key] = row._count._all;
    }
  };
  apply("tasksCreated", groups[0], (row) => row.createdById);
  apply("taskAssignments", groups[1], (row) => row.memberId);
  apply("docs", groups[2], (row) => row.authorId);
  apply("transactions", groups[3], (row) => row.memberId);
  apply("penaltiesReceived", groups[4], (row) => row.memberId);
  apply("penaltiesIssued", groups[5], (row) => row.issuedById);
  apply("projectsOwned", groups[6], (row) => row.ownerId);
  apply("projectMemberships", groups[7], (row) => row.memberId);
  apply("meetingsOrganized", groups[8], (row) => row.organizerId);
  apply("meetingParticipations", groups[9], (row) => row.memberId);
  apply("agendaProposals", groups[10], (row) => row.proposedById);
  apply("agendaItems", groups[11], (row) => row.addedById);
  apply("calendarEvents", groups[12], (row) => row.createdById);

  for (const result of counts.values()) {
    result.total = Object.entries(result).reduce(
      (sum, [key, count]) => (key === "total" ? sum : sum + count),
      0,
    );
  }
  return counts;
}

/** Counts everything one Member row owns, for merge/delete decisions. */
export async function getMemberContentCounts(
  memberId: string,
): Promise<MemberContentCounts> {
  const counts = await getMembersContentCounts([memberId]);
  return counts.get(memberId)!;
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

export async function reconcileMembers(
  orgId: string,
): Promise<MemberReconciliation> {
  const [clerkMembers, pendingInvitations, localMembers] = await Promise.all([
    getClerkOrgMembers(orgId),
    getClerkPendingInvitations(orgId),
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
  const orphanContent = await getMembersContentCounts(
    inLocalNotClerk.map((row) => row.id),
  );
  for (const row of inLocalNotClerk) row.content = orphanContent.get(row.id);

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
export async function applyReconciliation(
  orgId: string,
): Promise<ReconciliationRepair> {
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

  const removedMembershipIds = report.inLocalNotClerk.map((row) => row.id);
  const orphanIds = report.inLocalNotClerk
    .filter((row) => row.status !== "REMOVED")
    .map((row) => row.id);

  const markedRemoved = removedMembershipIds.length
    ? await prisma.$transaction(async (tx) => {
        const updated = orphanIds.length
          ? await tx.member.updateMany({
              where: { id: { in: orphanIds } },
              data: { status: "REMOVED" },
            })
          : { count: 0 };
        await tx.hubMembership.deleteMany({
          where: { orgId, memberId: { in: removedMembershipIds } },
        });
        return updated;
      })
    : { count: 0 };

  return { created: created.count, markedRemoved: markedRemoved.count };
}
