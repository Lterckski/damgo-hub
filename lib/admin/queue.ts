import { entityVisibilityWheres } from "@/lib/hub/context";
import { prisma } from "@/lib/prisma";
import { getOrgSettings } from "@/lib/org-settings";
import type { AdminDrawerTarget } from "@/lib/admin/types";

/**
 * Zone 2 — the Action Queue. One merged inbox of everything awaiting an
 * admin decision, drawn from six sources that previously lived on six
 * different pages.
 *
 * Every item resolves to the same row shape so the queue renders as one
 * list rather than six stacked sections, and so multi-select can span
 * kinds. `actionId` values are the contract the POST
 * /api/admin/queue/action handler dispatches on — that route re-derives
 * the admin role itself and never trusts the client's claim about which
 * actions a row offered.
 */

export type QueueItemKind =
  | "TRANSACTION_PENDING"
  | "JOIN_REQUEST"
  | "ROLE_CHANGE_REQUEST"
  | "AGENDA_PROPOSAL"
  | "PROJECT_PROPOSAL"
  | "PENALTY_PAST_DUE"
  | "TASK_OVERDUE";

export type QueueSeverity = "info" | "warning" | "critical";

export interface QueueAction {
  /** Dispatch key for POST /api/admin/queue/action. */
  actionId: string;
  label: string;
  variant: "primary" | "secondary" | "destructive";
  /** When true the UI collects a reason before sending — overrides always do. */
  requiresReason?: boolean;
}

export interface QueueItem {
  /** Stable across kinds: two sources can share an entity id. */
  id: string;
  kind: QueueItemKind;
  entityId: string;
  /** One-line description, already assembled — the row renders it as-is. */
  title: string;
  /** Secondary detail line: category, meeting name, project, reason. */
  detail: string | null;
  subjectName: string | null;
  subjectAvatarUrl: string | null;
  /** Money in centavos, when the item is financial. */
  amountCents: number | null;
  severity: QueueSeverity;
  /** ISO — the UI renders relative age from this. */
  occurredAt: string;
  actions: QueueAction[];
  /** Row click target. Null when the kind has no drawer of its own. */
  drawer: AdminDrawerTarget | null;
}

const TRANSACTION_ACTIONS: QueueAction[] = [
  { actionId: "transaction.approve", label: "Approve", variant: "primary" },
  { actionId: "transaction.reject", label: "Reject", variant: "destructive" },
  {
    actionId: "transaction.request_receipt",
    label: "Request receipt",
    variant: "secondary",
  },
];

const REQUEST_ACTIONS: QueueAction[] = [
  { actionId: "request.approve", label: "Approve", variant: "primary" },
  { actionId: "request.deny", label: "Deny", variant: "destructive" },
];

const PROPOSAL_ACTIONS: QueueAction[] = [
  { actionId: "agenda_proposal.accept", label: "Accept", variant: "primary" },
  {
    actionId: "agenda_proposal.decline",
    label: "Decline",
    variant: "destructive",
  },
];

const PROJECT_ACTIONS: QueueAction[] = [
  { actionId: "project.approve", label: "Approve", variant: "primary" },
  { actionId: "project.archive", label: "Archive", variant: "destructive" },
];

const PENALTY_ACTIONS: QueueAction[] = [
  { actionId: "penalty.resolve", label: "Mark paid", variant: "primary" },
  {
    actionId: "penalty.waive",
    label: "Waive",
    variant: "destructive",
    requiresReason: true,
  },
];

const TASK_ACTIONS: QueueAction[] = [
  { actionId: "task.complete", label: "Mark done", variant: "primary" },
  {
    actionId: "task.extend",
    label: "Extend 7 days",
    variant: "secondary",
    requiresReason: true,
  },
];

/** Every action id the queue can legitimately offer — the route's allowlist. */
export const QUEUE_ACTION_IDS = [
  ...TRANSACTION_ACTIONS,
  ...REQUEST_ACTIONS,
  ...PROPOSAL_ACTIONS,
  ...PROJECT_ACTIONS,
  ...PENALTY_ACTIONS,
  ...TASK_ACTIONS,
].map((action) => action.actionId);

export function isQueueActionId(value: unknown): value is string {
  return typeof value === "string" && QUEUE_ACTION_IDS.includes(value);
}

/** The reason-required actions, so the route can enforce it server-side too. */
export const REASON_REQUIRED_ACTION_IDS = new Set(
  [...PENALTY_ACTIONS, ...TASK_ACTIONS]
    .filter((a) => a.requiresReason)
    .map((a) => a.actionId),
);

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * The effective due date of a penalty: its own `dueAt` when set, otherwise
 * `createdAt + penaltyDueDays`. The fallback exists so every penalty issued
 * before `dueAt` was added still participates in "past due" without a
 * backfill migration.
 */
export function penaltyDueAt(
  penalty: { dueAt: Date | null; createdAt: Date },
  penaltyDueDays: number,
): Date {
  if (penalty.dueAt) return penalty.dueAt;
  return new Date(
    penalty.createdAt.getTime() + penaltyDueDays * 24 * 60 * 60 * 1000,
  );
}

export async function getActionQueue(): Promise<QueueItem[]> {
  const [settings, visibility] = await Promise.all([
    getOrgSettings(),
    entityVisibilityWheres(["transaction", "project", "penalty", "task"]),
  ]);
  const now = new Date();

  const [
    pendingTransactions,
    memberRequests,
    agendaProposals,
    proposedProjects,
    openPenalties,
    overdueTasks,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        ...{ status: "PENDING" },
        AND: [visibility.transaction],
      },
      include: { member: { select: { displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.memberRequest.findMany({
      where: { status: "PENDING" },
      include: { member: { select: { displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.agendaProposal.findMany({
      where: { status: "PENDING" },
      include: {
        proposedBy: { select: { displayName: true, avatarUrl: true } },
        meeting: { select: { title: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.findMany({
      where: {
        ...{ status: "PROPOSED" },
        AND: [visibility.project],
      },
      include: { owner: { select: { displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.penalty.findMany({
      where: {
        ...{ status: "OPEN" },
        AND: [visibility.penalty],
      },
      include: { member: { select: { displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    // "Escalated" overdue tasks: past due AND not already done. The
    // 3-day grace matches src/trigger/penalty-escalation-check.ts's own
    // notion of escalation rather than inventing a second threshold —
    // a task one hour late is not an admin decision.
    prisma.task.findMany({
      where: {
        AND: [
          visibility.task,
          { status: { not: "DONE" }, dueDate: { lt: daysAgo(3) } },
        ],
      },
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
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const items: QueueItem[] = [];

  for (const transaction of pendingTransactions) {
    items.push({
      id: `TRANSACTION_PENDING:${transaction.id}`,
      kind: "TRANSACTION_PENDING",
      entityId: transaction.id,
      title: `${transaction.type === "INCOME" ? "Income" : "Expense"} awaiting approval — ${transaction.category}`,
      detail: transaction.receiptPath
        ? transaction.description
        : "No receipt attached",
      subjectName: transaction.member.displayName,
      subjectAvatarUrl: transaction.member.avatarUrl,
      amountCents: transaction.amount,
      severity: transaction.receiptPath ? "info" : "warning",
      occurredAt: transaction.createdAt.toISOString(),
      actions: TRANSACTION_ACTIONS,
      drawer: { kind: "finance", recordId: transaction.id },
    });
  }

  for (const request of memberRequests) {
    const isJoin = request.type === "JOIN";
    items.push({
      id: `${isJoin ? "JOIN_REQUEST" : "ROLE_CHANGE_REQUEST"}:${request.id}`,
      kind: isJoin ? "JOIN_REQUEST" : "ROLE_CHANGE_REQUEST",
      entityId: request.id,
      title: isJoin
        ? `Join request — ${request.displayName}`
        : `Role change to ${request.requestedRole === "org:admin" ? "Admin" : "Member"} — ${request.member?.displayName ?? request.displayName}`,
      detail: request.message ?? request.email,
      subjectName: request.member?.displayName ?? request.displayName,
      subjectAvatarUrl: request.member?.avatarUrl ?? request.avatarUrl,
      amountCents: null,
      severity: "info",
      occurredAt: request.createdAt.toISOString(),
      actions: REQUEST_ACTIONS,
      drawer: request.memberId
        ? { kind: "members", recordId: request.memberId }
        : null,
    });
  }

  for (const proposal of agendaProposals) {
    items.push({
      id: `AGENDA_PROPOSAL:${proposal.id}`,
      kind: "AGENDA_PROPOSAL",
      entityId: proposal.id,
      title: `Agenda proposal — ${proposal.text}`,
      detail: `for “${proposal.meeting.title}”`,
      subjectName: proposal.proposedBy.displayName,
      subjectAvatarUrl: proposal.proposedBy.avatarUrl,
      amountCents: null,
      severity: "info",
      occurredAt: proposal.createdAt.toISOString(),
      actions: PROPOSAL_ACTIONS,
      drawer: null,
    });
  }

  for (const project of proposedProjects) {
    items.push({
      id: `PROJECT_PROPOSAL:${project.id}`,
      kind: "PROJECT_PROPOSAL",
      entityId: project.id,
      title: `Project proposal — ${project.name}`,
      detail: project.objectives ?? project.description,
      subjectName: project.owner.displayName,
      subjectAvatarUrl: project.owner.avatarUrl,
      amountCents: project.estimatedBudgetCentavos,
      severity: "info",
      occurredAt: project.createdAt.toISOString(),
      actions: PROJECT_ACTIONS,
      drawer: { kind: "projects", recordId: project.id },
    });
  }

  for (const penalty of openPenalties) {
    const dueAt = penaltyDueAt(penalty, settings.penaltyDueDays);
    if (dueAt > now) continue;

    const daysLate = Math.floor(
      (now.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    items.push({
      id: `PENALTY_PAST_DUE:${penalty.id}`,
      kind: "PENALTY_PAST_DUE",
      entityId: penalty.id,
      title: `Penalty past due — ${penalty.reason}`,
      detail: `${daysLate} day${daysLate === 1 ? "" : "s"} overdue`,
      subjectName: penalty.member.displayName,
      subjectAvatarUrl: penalty.member.avatarUrl,
      amountCents: penalty.amountCents,
      severity: daysLate >= 14 ? "critical" : "warning",
      occurredAt: dueAt.toISOString(),
      actions: PENALTY_ACTIONS,
      drawer: { kind: "penalties", recordId: penalty.id },
    });
  }

  for (const task of overdueTasks) {
    const daysLate = Math.floor(
      (now.getTime() - task.dueDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    const firstAssignee = task.assignees[0]?.member ?? null;
    const extraAssignees = task.assignees.length - 1;

    items.push({
      id: `TASK_OVERDUE:${task.id}`,
      kind: "TASK_OVERDUE",
      entityId: task.id,
      title: `Overdue task — ${task.title}`,
      detail: [
        `${daysLate} day${daysLate === 1 ? "" : "s"} overdue`,
        task.project ? task.project.name : null,
        extraAssignees > 0 ? `+${extraAssignees} more assigned` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      subjectName: firstAssignee?.displayName ?? "Unassigned",
      subjectAvatarUrl: firstAssignee?.avatarUrl ?? null,
      amountCents: null,
      severity: daysLate >= 14 ? "critical" : "warning",
      occurredAt: task.dueDate.toISOString(),
      actions: TASK_ACTIONS,
      drawer: { kind: "activity", recordId: task.id },
    });
  }

  // Oldest first — the queue is a backlog, and the thing that has waited
  // longest is the thing most likely to need a decision.
  return items.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
