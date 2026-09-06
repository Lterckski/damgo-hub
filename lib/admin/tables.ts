import { entityVisibilityWheres } from "@/lib/hub/context";
import { prisma } from "@/lib/prisma";
import { listOrgRoles } from "@/lib/organization-roles";
import { getOrgSettings } from "@/lib/org-settings";
import { penaltyDueAt } from "@/lib/admin/queue";
import type { AdminTab } from "@/lib/admin/types";

/**
 * Zone 4 — the segmented data table's server side. One row shape per tab,
 * all five loaded together for the console's single render, because the
 * console never navigates: switching tabs, filtering, and opening a drawer
 * are all client-side over data that is already here.
 *
 * Five tabs is a bounded, small amount of data for a five-person team. If
 * this ever grows past a few hundred rows per tab, the fix is per-tab
 * fetching on demand, not pagination bolted onto a payload this size.
 */

export interface MemberTableRow {
  id: string;
  clerkUserId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  isLeader: boolean;
  orgRole: string;
  functionalRoles: string[];
  workDistributionRoles: string[];
  /** False when the local row has no matching Clerk org membership. */
  inClerkOrg: boolean;
  openPenaltyCount: number;
  openTaskCount: number;
  createdAt: string;
}

export interface FinanceTableRow {
  id: string;
  memberId: string;
  memberName: string;
  memberAvatarUrl: string | null;
  type: string;
  category: string;
  amountCents: number;
  description: string | null;
  status: string;
  hasReceipt: boolean;
  penaltyId: string | null;
  createdAt: string;
}

export interface PenaltyTableRow {
  id: string;
  memberId: string;
  memberName: string;
  memberAvatarUrl: string | null;
  issuedByName: string;
  reason: string;
  amountCents: number | null;
  status: string;
  /** Effective due date — explicit `dueAt`, or createdAt + penaltyDueDays. */
  dueAt: string;
  /** True when dueAt came from the fallback rather than the column. */
  dueAtIsInferred: boolean;
  isPastDue: boolean;
  resolvedAt: string | null;
  transactionId: string | null;
  createdAt: string;
}

export interface ProjectTableRow {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  status: string;
  priority: string;
  category: string | null;
  memberCount: number;
  taskCount: number;
  openTaskCount: number;
  estimatedBudgetCents: number | null;
  isStale: boolean;
  targetEndDate: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface ActivityTableRow {
  id: string;
  /** "task" | "meeting" — the two things with a live schedule an admin chases. */
  kind: string;
  title: string;
  subjectName: string;
  subjectAvatarUrl: string | null;
  status: string;
  projectName: string | null;
  dueAt: string | null;
  isOverdue: boolean;
  updatedAt: string;
}

export interface AdminTableData {
  members: MemberTableRow[];
  finance: FinanceTableRow[];
  penalties: PenaltyTableRow[];
  projects: ProjectTableRow[];
  activity: ActivityTableRow[];
}

export async function getAdminTableData(): Promise<AdminTableData> {
  const [settings, orgRoles, visibility] = await Promise.all([
    getOrgSettings(),
    listOrgRoles(),
    entityVisibilityWheres([
      "task",
      "transaction",
      "penalty",
      "project",
      "meeting",
    ]),
  ]);
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - settings.projectStaleDays * 24 * 60 * 60 * 1000,
  );

  const [members, transactions, penalties, projects, tasks, meetings] =
    await Promise.all([
      // Unfiltered on purpose, unlike getMemberTrackerRows(): the console has
      // to be able to SHOW a local row that Clerk doesn't know about, since
      // finding those is the point of the Sync with Clerk action. It's flagged
      // per row via inClerkOrg rather than hidden.
      prisma.member.findMany({
        include: {
          functionalRoles: true,
          workDistributionRoles: true,
          _count: {
            select: { penaltiesReceived: { where: { status: "OPEN" } } },
          },
          taskAssignments: {
            where: {
              task: {
                AND: [visibility.task, { status: { not: "DONE" } }],
              },
            },
            select: { id: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.transaction.findMany({
        where: visibility.transaction,
        include: { member: { select: { displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.penalty.findMany({
        where: visibility.penalty,
        include: {
          member: { select: { displayName: true, avatarUrl: true } },
          issuedBy: { select: { displayName: true } },
          transaction: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.project.findMany({
        where: visibility.project,
        include: {
          owner: { select: { displayName: true, avatarUrl: true } },
          _count: {
            select: {
              members: true,
              tasks: { where: visibility.task },
            },
          },
          tasks: {
            where: {
              AND: [visibility.task, { status: { not: "DONE" } }],
            },
            select: { id: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.task.findMany({
        where: visibility.task,
        include: {
          assignees: {
            include: {
              member: { select: { displayName: true, avatarUrl: true } },
            },
          },
          project: {
            where: visibility.project,
            select: { name: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.meeting.findMany({
        where: visibility.meeting,
        include: {
          organizer: { select: { displayName: true, avatarUrl: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
    ]);

  const memberRows: MemberTableRow[] = members.map((member) => ({
    id: member.id,
    clerkUserId: member.clerkUserId,
    displayName: member.displayName,
    email: member.email,
    avatarUrl: member.avatarUrl,
    status: member.status,
    isLeader: member.isLeader,
    orgRole: orgRoles.get(member.clerkUserId) ?? "org:member",
    functionalRoles: member.functionalRoles.map((r) => r.role),
    workDistributionRoles: member.workDistributionRoles.map((r) => r.role),
    inClerkOrg: orgRoles.has(member.clerkUserId),
    openPenaltyCount: member._count.penaltiesReceived,
    openTaskCount: member.taskAssignments.length,
    createdAt: member.createdAt.toISOString(),
  }));

  const financeRows: FinanceTableRow[] = transactions.map((transaction) => ({
    id: transaction.id,
    memberId: transaction.memberId,
    memberName: transaction.member.displayName,
    memberAvatarUrl: transaction.member.avatarUrl,
    type: transaction.type,
    category: transaction.category,
    amountCents: transaction.amount,
    description: transaction.description,
    status: transaction.status,
    hasReceipt: transaction.receiptPath !== null,
    penaltyId: transaction.penaltyId,
    createdAt: transaction.createdAt.toISOString(),
  }));

  const penaltyRows: PenaltyTableRow[] = penalties.map((penalty) => {
    const due = penaltyDueAt(penalty, settings.penaltyDueDays);
    return {
      id: penalty.id,
      memberId: penalty.memberId,
      memberName: penalty.member.displayName,
      memberAvatarUrl: penalty.member.avatarUrl,
      issuedByName: penalty.issuedBy.displayName,
      reason: penalty.reason,
      amountCents: penalty.amountCents,
      status: penalty.status,
      dueAt: due.toISOString(),
      dueAtIsInferred: penalty.dueAt === null,
      isPastDue: penalty.status === "OPEN" && due <= now,
      resolvedAt: penalty.resolvedAt?.toISOString() ?? null,
      transactionId: penalty.transaction?.id ?? null,
      createdAt: penalty.createdAt.toISOString(),
    };
  });

  const projectRows: ProjectTableRow[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    ownerId: project.ownerId,
    ownerName: project.owner.displayName,
    ownerAvatarUrl: project.owner.avatarUrl,
    status: project.status,
    priority: project.priority,
    category: project.category,
    memberCount: project._count.members,
    taskCount: project._count.tasks,
    openTaskCount: project.tasks.length,
    estimatedBudgetCents: project.estimatedBudgetCentavos,
    isStale: project.status === "ACTIVE" && project.updatedAt < staleBefore,
    targetEndDate: project.targetEndDate?.toISOString() ?? null,
    updatedAt: project.updatedAt.toISOString(),
    createdAt: project.createdAt.toISOString(),
  }));

  const activityRows: ActivityTableRow[] = [
    ...tasks.map((task) => {
      const assignee = task.assignees[0]?.member ?? null;
      return {
        id: task.id,
        kind: "task",
        title: task.title,
        subjectName: assignee?.displayName ?? "Unassigned",
        subjectAvatarUrl: assignee?.avatarUrl ?? null,
        status: task.status,
        projectName: task.project?.name ?? null,
        dueAt: task.dueDate.toISOString(),
        isOverdue: task.status !== "DONE" && task.dueDate < now,
        updatedAt: task.updatedAt.toISOString(),
      };
    }),
    ...meetings.map((meeting) => ({
      id: meeting.id,
      kind: "meeting",
      title: meeting.title,
      subjectName: meeting.organizer.displayName,
      subjectAvatarUrl: meeting.organizer.avatarUrl,
      status: meeting.scheduledAt < now ? "PAST" : "UPCOMING",
      projectName: null,
      dueAt: meeting.scheduledAt.toISOString(),
      isOverdue: false,
      updatedAt: meeting.updatedAt.toISOString(),
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return {
    members: memberRows,
    finance: financeRows,
    penalties: penaltyRows,
    projects: projectRows,
    activity: activityRows,
  };
}

/** Row counts per tab, for the tab strip's badges. */
export function tabCounts(data: AdminTableData): Record<AdminTab, number> {
  return {
    members: data.members.length,
    finance: data.finance.length,
    penalties: data.penalties.length,
    projects: data.projects.length,
    activity: data.activity.length,
  };
}
