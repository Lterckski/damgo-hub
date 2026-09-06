/**
 * Shared shapes for the rebuilt /dashboard.
 *
 * Every personal query takes a `memberId` resolved server-side from the
 * Clerk session (see lib/current-member.ts). No personal list is ever
 * fetched whole and narrowed in the browser — Part 4's rule, and the
 * reason these types carry no "all members" variant.
 */

export type UrgencyTone = "neutral" | "warning" | "critical";

/** One row in the Needs You Today strip. */
export interface UrgentItem {
  id: string;
  kind: "OVERDUE_TASK" | "UNPAID_PENALTY" | "MEETING_SOON" | "AWAITING_YOU";
  title: string;
  detail: string | null;
  /** Money in centavos, when the row is financial. */
  amountCents: number | null;
  tone: UrgencyTone;
  /** ISO — what the row's time pressure is measured against. */
  at: string;
  action: { label: string; kind: "COMPLETE_TASK" | "PAY_PENALTY" | "JOIN_MEETING" | "OPEN" ; href?: string } | null;
}

export type TaskBucket = "OVERDUE" | "TODAY" | "THIS_WEEK" | "LATER";

export interface MyTaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string;
  bucket: TaskBucket;
  projectName: string | null;
  assignedByName: string;
}

export interface TimelineItem {
  id: string;
  kind: "MEETING" | "TASK_DUE" | "EVENT" | "HACKATHON" | "DUES";
  title: string;
  detail: string | null;
  at: string;
  /** Meetings only — the external join link, when one is set. */
  joinUrl: string | null;
  isMine: boolean;
}

export interface MyPenaltyRow {
  id: string;
  reason: string;
  amountCents: number | null;
  status: string;
  incurredAt: string;
  dueAt: string;
  dueAtIsInferred: boolean;
  isPastDue: boolean;
  resolvedAt: string | null;
  disputeStatus: string | null;
}

export interface MyMoney {
  /** Unpaid penalties + unpaid dues. */
  owedCents: number;
  owedBreakdown: { penaltiesCents: number; duesCents: number };
  /** Own EXPENSE transactions still pending approval — reimbursements. */
  owedToYouCents: number;
  owedToYouCount: number;
  /** Approved INCOME from this member, this calendar month (team time). */
  contributedCents: number;
  monthLabel: string;
  asOf: string;
}

export interface MyProjectRow {
  id: string;
  name: string;
  status: string;
  /** "Owner" or "Collaborator" — this member's relationship to the project. */
  role: string;
  openTaskCount: number;
  totalTaskCount: number;
  completedTaskCount: number;
  nextMilestone: { title: string; dueAt: string; isOverdue: boolean } | null;
  blockedReason: string | null;
}

export interface ActivityRow {
  id: string;
  type: string;
  actorName: string;
  summary: string;
  entityLabel: string;
  createdAt: string;
  /** True when this row was addressed to the reader specifically. */
  isForYou: boolean;
}
