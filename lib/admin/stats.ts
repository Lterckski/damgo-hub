import { clerkClient } from "@clerk/nextjs/server";

import { formatPHP } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getOrgSettings } from "@/lib/org-settings";
import { penaltyDueAt } from "@/lib/admin/queue";
import type { AdminTableFilterTarget } from "@/lib/admin/types";

/**
 * Zone 3 — the stat cards, which are filters rather than links.
 *
 * The member count is the reason this module exists. `/admin` used to
 * render `prisma.member.count()`, the only member query in the app not
 * scoped to the Clerk org roster, so a local row for someone no longer in
 * the org inflated the number with nothing on screen to say so. Every
 * count here states what it includes in a `breakdown` line, and the member
 * card reads "5 active · 1 pending" rather than a bare 6, so this class of
 * drift is visible instead of silent.
 */

export interface AdminStatCard {
  key: string;
  label: string;
  /** Already formatted for display — currency through formatPHP, counts as-is. */
  value: string;
  /** What the number includes. Never null on a card whose scope is ambiguous. */
  breakdown: string | null;
  /** Week-over-week movement, e.g. "+1 this week". Null when not meaningful. */
  delta: string | null;
  /** Clicking the card applies this filter to the table below, in place. */
  filter: AdminTableFilterTarget | null;
  /** Shown in place of the value when the count is zero — Part 3's empty states. */
  emptyHint: string | null;
  tone: "neutral" | "positive" | "warning" | "critical";
}

function weekAgo(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Clerk org membership counts, split into what a member actually is.
 * Returns null when Clerk can't be reached — the card then says so rather
 * than silently falling back to the unfiltered local count, which is the
 * bug this whole module is correcting.
 */
async function getClerkMembershipCounts(
  orgId: string,
): Promise<{ clerkUserIds: string[]; pendingInvitations: number } | null> {
  try {
    const client = await clerkClient();
    const clerkUserIds: string[] = [];
    const limit = 100;
    let offset = 0;

    while (true) {
      const { data } = await client.organizations.getOrganizationMembershipList({
        organizationId: orgId,
        limit,
        offset,
      });
      for (const membership of data) {
        if (membership.publicUserData) clerkUserIds.push(membership.publicUserData.userId);
      }
      if (data.length < limit) break;
      offset += limit;
    }

    const { data: invitations } = await client.organizations.getOrganizationInvitationList({
      organizationId: orgId,
      limit: 100,
    });

    return {
      clerkUserIds,
      pendingInvitations: invitations.filter((invitation) => invitation.status === "pending").length,
    };
  } catch (error) {
    console.error("Clerk membership count failed", error);
    return null;
  }
}

export interface AdminStats {
  cards: AdminStatCard[];
  /** Part 3's exception cards — the things that are wrong, not the things that are. */
  exceptions: AdminStatCard[];
  /** True when the member card fell back to unscoped local data. */
  memberCountDegraded: boolean;
}

export async function getAdminStats(orgId: string): Promise<AdminStats> {
  const settings = await getOrgSettings();
  const since = weekAgo();
  const staleBefore = new Date(Date.now() - settings.projectStaleDays * 24 * 60 * 60 * 1000);

  const [
    clerkCounts,
    localMembers,
    openPenalties,
    pendingTransactions,
    activeProjects,
    approvedTransactions,
    newProjectsThisWeek,
    penaltiesThisWeek,
    transactionsMissingReceipts,
    staleProjects,
    overdueTasks,
    membersWithUnpaidPenalties,
  ] = await Promise.all([
    getClerkMembershipCounts(orgId),
    prisma.member.findMany({ select: { clerkUserId: true, status: true, createdAt: true } }),
    prisma.penalty.findMany({
      where: { status: "OPEN" },
      select: { dueAt: true, createdAt: true, amountCents: true },
    }),
    prisma.transaction.count({ where: { status: "PENDING" } }),
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.transaction.findMany({ where: { status: "APPROVED" }, select: { type: true, amount: true } }),
    prisma.project.count({ where: { status: "ACTIVE", createdAt: { gte: since } } }),
    prisma.penalty.count({ where: { status: "OPEN", createdAt: { gte: since } } }),
    prisma.transaction.count({ where: { receiptPath: null, type: "EXPENSE", status: { not: "REJECTED" } } }),
    prisma.project.count({ where: { status: "ACTIVE", updatedAt: { lt: staleBefore } } }),
    prisma.task.count({
      where: { status: { not: "DONE" }, dueDate: { lt: new Date() } },
    }),
    prisma.penalty.groupBy({ by: ["memberId"], where: { status: "OPEN" } }),
  ]);

  // --- Members: the count that was wrong -----------------------------------
  const clerkUserIdSet = clerkCounts ? new Set(clerkCounts.clerkUserIds) : null;
  const inOrg = clerkUserIdSet
    ? localMembers.filter((member) => clerkUserIdSet.has(member.clerkUserId))
    : localMembers;

  const activeCount = inOrg.filter((member) => member.status === "ACTIVE").length;
  const inactiveCount = inOrg.filter((member) => member.status === "INACTIVE").length;
  const pendingInvites = clerkCounts?.pendingInvitations ?? 0;
  // Local rows whose Clerk user is not an org member — exactly what used to
  // be counted as a member with nothing on screen to say so. REMOVED rows
  // are excluded: those are orphans an admin has already dealt with, and
  // leaving them in the warning would make the card nag forever about
  // something that's been handled.
  const notInClerk = clerkUserIdSet
    ? localMembers.filter(
        (member) => !clerkUserIdSet.has(member.clerkUserId) && member.status !== "REMOVED",
      ).length
    : 0;
  const newMembersThisWeek = inOrg.filter((member) => member.createdAt >= since).length;

  const memberBreakdown = [
    `${activeCount} active`,
    inactiveCount > 0 ? `${inactiveCount} inactive` : null,
    `${pendingInvites} pending`,
    notInClerk > 0 ? `${notInClerk} not in Clerk` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const balanceCents = approvedTransactions.reduce(
    (sum, t) => sum + (t.type === "INCOME" ? t.amount : -t.amount),
    0,
  );

  const now = new Date();
  const pastDuePenalties = openPenalties.filter(
    (penalty) => penaltyDueAt(penalty, settings.penaltyDueDays) <= now,
  );
  const openPenaltyValue = openPenalties.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);

  const cards: AdminStatCard[] = [
    {
      key: "members",
      label: "Total Members",
      value: String(activeCount),
      breakdown: clerkCounts
        ? memberBreakdown
        : "Clerk unreachable — showing unscoped local rows",
      delta: newMembersThisWeek > 0 ? `${signed(newMembersThisWeek)} this week` : "No change this week",
      filter: { tab: "members", filterId: "all" },
      emptyHint: "No one is in the organization yet. Invite your team to get started.",
      tone: notInClerk > 0 ? "warning" : "neutral",
    },
    {
      key: "penalties",
      label: "Open Penalties",
      value: String(openPenalties.length),
      breakdown:
        openPenalties.length > 0
          ? `${pastDuePenalties.length} past due · ${formatPHP(openPenaltyValue)} outstanding`
          : null,
      delta: penaltiesThisWeek > 0 ? `${signed(penaltiesThisWeek)} this week` : "None issued this week",
      filter: { tab: "penalties", filterId: "open" },
      emptyHint: "No open penalties. Issued penalties and their amounts would show here.",
      tone: pastDuePenalties.length > 0 ? "critical" : "neutral",
    },
    {
      key: "transactions",
      label: "Pending Transactions",
      value: String(pendingTransactions),
      breakdown: pendingTransactions > 0 ? "Awaiting your approval" : null,
      delta: null,
      filter: { tab: "finance", filterId: "pending" },
      emptyHint: "Nothing awaiting approval. Submitted income and expenses land here first.",
      tone: pendingTransactions > 0 ? "warning" : "positive",
    },
    {
      key: "projects",
      label: "Active Projects",
      value: String(activeProjects),
      breakdown: staleProjects > 0 ? `${staleProjects} with no recent activity` : null,
      delta: newProjectsThisWeek > 0 ? `${signed(newProjectsThisWeek)} this week` : "No change this week",
      filter: { tab: "projects", filterId: "active" },
      emptyHint: "No active projects. Approve a proposal from the queue to start one.",
      tone: "neutral",
    },
    {
      key: "balance",
      label: "Net Balance",
      value: formatPHP(balanceCents),
      breakdown: "Approved transactions only",
      delta: null,
      filter: { tab: "finance", filterId: "approved" },
      emptyHint: "No approved transactions yet. The running balance appears once one is approved.",
      tone: balanceCents < 0 ? "critical" : "positive",
    },
    {
      key: "overdue",
      label: "Overdue Items",
      value: String(overdueTasks + pastDuePenalties.length),
      breakdown: `${overdueTasks} task${overdueTasks === 1 ? "" : "s"} · ${pastDuePenalties.length} penalt${pastDuePenalties.length === 1 ? "y" : "ies"}`,
      delta: null,
      filter: { tab: "activity", filterId: "overdue" },
      emptyHint: "Nothing overdue. Late tasks and past-due penalties surface here.",
      tone: overdueTasks + pastDuePenalties.length > 0 ? "critical" : "positive",
    },
  ];

  const exceptions: AdminStatCard[] = [
    {
      key: "members-owing",
      label: "Members With Unpaid Penalties",
      value: String(membersWithUnpaidPenalties.length),
      breakdown: membersWithUnpaidPenalties.length > 0 ? "Open, not yet settled or waived" : null,
      delta: null,
      filter: { tab: "penalties", filterId: "open" },
      emptyHint: "Everyone is settled up.",
      tone: membersWithUnpaidPenalties.length > 0 ? "warning" : "positive",
    },
    {
      key: "missing-receipts",
      label: "Expenses Missing Receipts",
      value: String(transactionsMissingReceipts),
      breakdown: transactionsMissingReceipts > 0 ? "Approved or pending, no receipt attached" : null,
      delta: null,
      filter: { tab: "finance", filterId: "missing_receipt" },
      emptyHint: "Every expense has a receipt attached.",
      tone: transactionsMissingReceipts > 0 ? "warning" : "positive",
    },
    {
      key: "stale-projects",
      label: `Projects Idle ${settings.projectStaleDays}+ Days`,
      value: String(staleProjects),
      breakdown: staleProjects > 0 ? "Active, but untouched" : null,
      delta: null,
      filter: { tab: "projects", filterId: "stale" },
      emptyHint: "Every active project has moved recently.",
      tone: staleProjects > 0 ? "warning" : "positive",
    },
  ];

  return { cards, exceptions, memberCountDegraded: clerkCounts === null };
}
