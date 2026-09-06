import { prisma } from "@/lib/prisma";
import { listOrgRoles } from "@/lib/organization-roles";
import { getOrgSettings } from "@/lib/org-settings";
import { penaltyDueAt } from "@/lib/admin/queue";
import type { AdminRecordKind } from "@/lib/admin/types";

/**
 * Detail payloads for the right-side drawers. Fetched on open rather than
 * shipped with the table: the Member 360 view alone joins tasks,
 * penalties, transactions, meetings and audit history, and loading that
 * for every row up front would be paying for 30 drawers to open one.
 */

export interface RelatedItem {
  id: string;
  label: string;
  meta: string | null;
  tone?: "default" | "warning" | "critical" | "success";
}

export interface MemberDetail {
  id: string;
  clerkUserId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  isLeader: boolean;
  orgRole: string;
  inClerkOrg: boolean;
  functionalRoles: string[];
  workDistributionRoles: string[];
  createdAt: string;
  stats: {
    openTasks: number;
    completedTasks: number;
    openPenalties: number;
    penaltyOwedCents: number;
    contributionsCents: number;
    /** Past meetings this member was a participant on. */
    meetingsAttended: number;
    /** Total past meetings, so the number above has a denominator. */
    meetingsHeld: number;
  };
  tasks: RelatedItem[];
  penalties: RelatedItem[];
  contributions: RelatedItem[];
  recentActivity: RelatedItem[];
}

export interface TransactionDetail {
  id: string;
  memberName: string;
  type: string;
  category: string;
  amountCents: number;
  description: string | null;
  status: string;
  hasReceipt: boolean;
  receiptPath: string | null;
  penaltyReason: string | null;
  createdAt: string;
  history: RelatedItem[];
}

export interface PenaltyDetail {
  id: string;
  memberId: string;
  memberName: string;
  issuedByName: string;
  reason: string;
  amountCents: number | null;
  status: string;
  dueAt: string;
  dueAtIsInferred: boolean;
  isPastDue: boolean;
  resolvedAt: string | null;
  linkedTransactionId: string | null;
  createdAt: string;
  history: RelatedItem[];
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  objectives: string | null;
  ownerName: string;
  status: string;
  priority: string;
  category: string | null;
  estimatedBudgetCents: number | null;
  startDate: string | null;
  targetEndDate: string | null;
  updatedAt: string;
  createdAt: string;
  members: RelatedItem[];
  tasks: RelatedItem[];
  history: RelatedItem[];
}

export interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  projectName: string | null;
  createdByName: string;
  startDate: string;
  dueDate: string;
  isOverdue: boolean;
  assignees: { id: string; displayName: string; avatarUrl: string | null }[];
  history: RelatedItem[];
}

export interface DocDetail {
  id: string;
  title: string;
  authorName: string;
  projectName: string | null;
  updatedAt: string;
  createdAt: string;
  excerpt: string | null;
}

export type RecordDetail =
  | { kind: "members"; member: MemberDetail }
  | { kind: "finance"; transaction: TransactionDetail }
  | { kind: "penalties"; penalty: PenaltyDetail }
  | { kind: "projects"; project: ProjectDetail }
  | { kind: "activity"; task: TaskDetail }
  | { kind: "docs"; doc: DocDetail };

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Audit entries touching one entity — the drawer's "what happened to this" list. */
async function entityHistory(entityId: string): Promise<RelatedItem[]> {
  const entries = await prisma.auditLog.findMany({
    where: { entityId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return entries.map((entry) => ({
    id: entry.id,
    label: `${entry.actorName} · ${entry.action}`,
    meta: [formatDate(entry.createdAt), entry.reason].filter(Boolean).join(" — "),
  }));
}

export async function getRecordDetail(
  kind: AdminRecordKind,
  recordId: string,
): Promise<RecordDetail | null> {
  switch (kind) {
    case "members":
      return getMemberDetail(recordId);
    case "finance":
      return getTransactionDetail(recordId);
    case "penalties":
      return getPenaltyDetail(recordId);
    case "projects":
      return getProjectDetail(recordId);
    case "activity":
      return getTaskDetail(recordId);
    case "docs":
      return getDocDetail(recordId);
    default:
      return null;
  }
}

async function getMemberDetail(memberId: string): Promise<RecordDetail | null> {
  const now = new Date();
  const settings = await getOrgSettings();

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { functionalRoles: true, workDistributionRoles: true },
  });
  if (!member) return null;

  const [orgRoles, taskLinks, penalties, contributions, participations, meetingsHeld, history] =
    await Promise.all([
      listOrgRoles(),
      prisma.taskAssignee.findMany({
        where: { memberId },
        include: { task: { select: { id: true, title: true, status: true, dueDate: true } } },
        take: 100,
      }),
      prisma.penalty.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.transaction.findMany({
        where: { memberId, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.meetingParticipant.count({ where: { memberId, meeting: { scheduledAt: { lt: now } } } }),
      prisma.meeting.count({ where: { scheduledAt: { lt: now } } }),
      entityHistory(memberId),
    ]);

  const openTasks = taskLinks.filter((link) => link.task.status !== "DONE");
  const openPenalties = penalties.filter((penalty) => penalty.status === "OPEN");

  return {
    kind: "members",
    member: {
      id: member.id,
      clerkUserId: member.clerkUserId,
      displayName: member.displayName,
      email: member.email,
      avatarUrl: member.avatarUrl,
      status: member.status,
      isLeader: member.isLeader,
      orgRole: orgRoles.get(member.clerkUserId) ?? "org:member",
      inClerkOrg: orgRoles.has(member.clerkUserId),
      functionalRoles: member.functionalRoles.map((r) => r.role),
      workDistributionRoles: member.workDistributionRoles.map((r) => r.role),
      createdAt: member.createdAt.toISOString(),
      stats: {
        openTasks: openTasks.length,
        completedTasks: taskLinks.length - openTasks.length,
        openPenalties: openPenalties.length,
        penaltyOwedCents: openPenalties.reduce((sum, p) => sum + (p.amountCents ?? 0), 0),
        contributionsCents: contributions
          .filter((t) => t.type === "INCOME")
          .reduce((sum, t) => sum + t.amount, 0),
        // Participation on a past meeting, which is the closest thing the
        // schema records. MeetingParticipant is an invite list with no
        // attended/absent flag, so this is "was on the list", not "showed
        // up" — labelled that way in the drawer rather than overclaiming.
        meetingsAttended: participations,
        meetingsHeld,
      },
      tasks: taskLinks.slice(0, 20).map((link) => ({
        id: link.task.id,
        label: link.task.title,
        meta: `${link.task.status.replace("_", " ").toLowerCase()} · due ${formatDate(link.task.dueDate)}`,
        tone:
          link.task.status !== "DONE" && link.task.dueDate < now
            ? "critical"
            : link.task.status === "DONE"
              ? "success"
              : "default",
      })),
      penalties: penalties.slice(0, 20).map((penalty) => ({
        id: penalty.id,
        label: penalty.reason,
        meta: `${penalty.status.toLowerCase()} · due ${formatDate(penaltyDueAt(penalty, settings.penaltyDueDays))}`,
        tone:
          penalty.status === "OPEN" && penaltyDueAt(penalty, settings.penaltyDueDays) <= now
            ? "critical"
            : penalty.status === "OPEN"
              ? "warning"
              : "default",
      })),
      contributions: contributions.slice(0, 20).map((transaction) => ({
        id: transaction.id,
        label: `${transaction.category} · ${transaction.type === "INCOME" ? "in" : "out"}`,
        meta: formatDate(transaction.createdAt),
      })),
      recentActivity: history,
    },
  };
}

async function getTransactionDetail(transactionId: string): Promise<RecordDetail | null> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      member: { select: { displayName: true } },
      penalty: { select: { reason: true } },
    },
  });
  if (!transaction) return null;

  return {
    kind: "finance",
    transaction: {
      id: transaction.id,
      memberName: transaction.member.displayName,
      type: transaction.type,
      category: transaction.category,
      amountCents: transaction.amount,
      description: transaction.description,
      status: transaction.status,
      hasReceipt: transaction.receiptPath !== null,
      receiptPath: transaction.receiptPath,
      penaltyReason: transaction.penalty?.reason ?? null,
      createdAt: transaction.createdAt.toISOString(),
      history: await entityHistory(transactionId),
    },
  };
}

async function getPenaltyDetail(penaltyId: string): Promise<RecordDetail | null> {
  const settings = await getOrgSettings();
  const penalty = await prisma.penalty.findUnique({
    where: { id: penaltyId },
    include: {
      member: { select: { displayName: true } },
      issuedBy: { select: { displayName: true } },
      transaction: { select: { id: true } },
    },
  });
  if (!penalty) return null;

  const due = penaltyDueAt(penalty, settings.penaltyDueDays);

  return {
    kind: "penalties",
    penalty: {
      id: penalty.id,
      memberId: penalty.memberId,
      memberName: penalty.member.displayName,
      issuedByName: penalty.issuedBy.displayName,
      reason: penalty.reason,
      amountCents: penalty.amountCents,
      status: penalty.status,
      dueAt: due.toISOString(),
      dueAtIsInferred: penalty.dueAt === null,
      isPastDue: penalty.status === "OPEN" && due <= new Date(),
      resolvedAt: penalty.resolvedAt?.toISOString() ?? null,
      linkedTransactionId: penalty.transaction?.id ?? null,
      createdAt: penalty.createdAt.toISOString(),
      history: await entityHistory(penaltyId),
    },
  };
}

async function getProjectDetail(projectId: string): Promise<RecordDetail | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      owner: { select: { displayName: true } },
      members: { include: { member: { select: { displayName: true } } } },
      tasks: { select: { id: true, title: true, status: true, dueDate: true }, take: 25 },
    },
  });
  if (!project) return null;

  const now = new Date();

  return {
    kind: "projects",
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      objectives: project.objectives,
      ownerName: project.owner.displayName,
      status: project.status,
      priority: project.priority,
      category: project.category,
      estimatedBudgetCents: project.estimatedBudgetCentavos,
      startDate: project.startDate?.toISOString() ?? null,
      targetEndDate: project.targetEndDate?.toISOString() ?? null,
      updatedAt: project.updatedAt.toISOString(),
      createdAt: project.createdAt.toISOString(),
      members: project.members.map((link) => ({
        id: link.id,
        label: link.member.displayName,
        meta: null,
      })),
      tasks: project.tasks.map((task) => ({
        id: task.id,
        label: task.title,
        meta: `${task.status.replace("_", " ").toLowerCase()} · due ${formatDate(task.dueDate)}`,
        tone: task.status !== "DONE" && task.dueDate < now ? "critical" : "default",
      })),
      history: await entityHistory(projectId),
    },
  };
}

async function getTaskDetail(taskId: string): Promise<RecordDetail | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignees: { include: { member: { select: { id: true, displayName: true, avatarUrl: true } } } },
      project: { select: { name: true } },
      createdBy: { select: { displayName: true } },
    },
  });
  if (!task) return null;

  return {
    kind: "activity",
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      type: task.type,
      projectName: task.project?.name ?? null,
      createdByName: task.createdBy.displayName,
      startDate: task.startDate.toISOString(),
      dueDate: task.dueDate.toISOString(),
      isOverdue: task.status !== "DONE" && task.dueDate < new Date(),
      assignees: task.assignees.map((link) => ({
        id: link.member.id,
        displayName: link.member.displayName,
        avatarUrl: link.member.avatarUrl,
      })),
      history: await entityHistory(taskId),
    },
  };
}

async function getDocDetail(docId: string): Promise<RecordDetail | null> {
  const doc = await prisma.doc.findUnique({
    where: { id: docId },
    include: {
      author: { select: { displayName: true } },
      project: { select: { name: true } },
    },
  });
  if (!doc) return null;

  return {
    kind: "docs",
    doc: {
      id: doc.id,
      title: doc.title,
      authorName: doc.author.displayName,
      projectName: doc.project?.name ?? null,
      updatedAt: doc.updatedAt.toISOString(),
      createdAt: doc.createdAt.toISOString(),
      excerpt: doc.content ? doc.content.slice(0, 400) : null,
    },
  };
}
