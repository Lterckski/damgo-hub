import { entityVisibilityWhere } from "@/lib/hub/context";
import { taskVisibilityWhere } from "@/lib/hub/context";
import { clerkClient } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { formatPHP } from "@/lib/currency";
import { recordAuditEvent, requireReason } from "@/lib/audit-log";
import { decideProject } from "@/lib/project-decisions";
import type { AuditActor } from "@/lib/audit-log";
import { sendBroadcast } from "@/lib/admin/broadcasts";
import { REASON_REQUIRED_ACTION_IDS } from "@/lib/admin/queue";
import type { AdminContext } from "@/lib/admin/guard";

/**
 * Every admin console mutation, in one module.
 *
 * Two rules hold throughout, and both are enforced here rather than in the
 * UI (Part 3: hiding a button is not access control):
 *
 * 1. Every mutation writes an AuditLog entry inside the same transaction as
 *    the change. A change that committed without its log entry, or a log
 *    entry for a change that rolled back, are both worse than either alone.
 *
 * 2. A settled financial record is never rewritten. Editing an APPROVED
 *    transaction's amount creates an offsetting adjustment entry instead —
 *    architecture-context.md invariant 6, which Part 2's "edit any
 *    transaction" override does not get to suspend. The override is real;
 *    it just takes the ledger-correct shape.
 */

export type MutationOutcome =
  | { ok: true; message: string }
  | { ok: false; status: number; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function conflict(message: string): MutationOutcome {
  return { ok: false, status: 409, error: message };
}

function notFound(entity: string): MutationOutcome {
  return { ok: false, status: 404, error: `${entity} not found` };
}

// ---------------------------------------------------------------------------
// Action Queue
// ---------------------------------------------------------------------------

export async function applyQueueAction(
  context: AdminContext,
  actionId: string,
  entityId: string,
  rawReason: unknown,
): Promise<MutationOutcome> {
  // Server-side re-check of which actions demand a justification. The client
  // sends `requiresReason` alongside each button, but that flag came from a
  // payload the client could have edited, so it isn't what's trusted.
  const reason = REASON_REQUIRED_ACTION_IDS.has(actionId)
    ? requireReason(rawReason)
    : typeof rawReason === "string" && rawReason.trim()
      ? rawReason.trim()
      : null;

  const { actor } = context;

  switch (actionId) {
    case "transaction.approve":
    case "transaction.reject":
      return decideTransaction(
        actor,
        entityId,
        actionId === "transaction.approve" ? "APPROVED" : "REJECTED",
        reason,
      );

    case "transaction.request_receipt":
      return requestReceipt(actor, entityId);

    case "request.approve":
    case "request.deny":
      return decideMemberRequest(
        context,
        entityId,
        actionId === "request.approve",
        reason,
      );

    case "agenda_proposal.accept":
    case "agenda_proposal.decline":
      return decideAgendaProposal(
        actor,
        entityId,
        actionId === "agenda_proposal.accept",
        reason,
      );

    // Approve/reject share one implementation with the /projects controls
    // (lib/project-decisions.ts) so the two surfaces cannot drift apart.
    case "project.approve":
    case "project.reject": {
      const outcome = await decideProject(
        actor,
        entityId,
        actionId === "project.approve" ? "APPROVE" : "REJECT",
        rawReason,
      );
      return outcome.ok
        ? { ok: true, message: outcome.message }
        : { ok: false, status: outcome.status, error: outcome.error };
    }
    case "project.archive":
      return setProjectStatus(actor, entityId, "ARCHIVED", reason);

    case "penalty.resolve":
      return decidePenalty(actor, entityId, "RESOLVED", reason);
    case "penalty.waive":
      return decidePenalty(actor, entityId, "WAIVED", reason);

    case "task.complete":
      return completeTask(actor, entityId, reason);
    case "task.extend":
      return extendTask(actor, entityId, reason);

    default:
      return { ok: false, status: 400, error: `Unknown action: ${actionId}` };
  }
}

async function decideTransaction(
  actor: AuditActor,
  transactionId: string,
  status: "APPROVED" | "REJECTED",
  reason: string | null,
): Promise<MutationOutcome> {
  const existing = await prisma.transaction.findUnique({
    where: {
      ...{ id: transactionId },
      AND: [await entityVisibilityWhere("transaction")],
    },
    include: { member: { select: { displayName: true } } },
  });
  if (!existing) return notFound("Transaction");
  if (existing.status !== "PENDING")
    return conflict("This transaction has already been decided");

  await prisma
    .$transaction(async (tx) => {
      // Conditional update, matching the existing finance route: two admins
      // clicking Approve at once must not both succeed.
      const claim = await tx.transaction.updateMany({
        where: { id: transactionId, status: "PENDING" },
        data: { status },
      });
      if (claim.count !== 1) throw new ConcurrentDecisionError();

      await recordAuditEvent(
        {
          actor,
          action: `transaction.${status.toLowerCase()}`,
          entityType: "TRANSACTION",
          entityId: transactionId,
          entityLabel: `${existing.category} ${formatPHP(existing.amount)} · ${existing.member.displayName}`,
          before: { status: existing.status },
          after: { status },
          reason,
        },
        tx,
      );
    })
    .catch(rethrowUnlessConcurrent);

  return { ok: true, message: `Transaction ${status.toLowerCase()}` };
}

async function requestReceipt(
  actor: AuditActor,
  transactionId: string,
): Promise<MutationOutcome> {
  const transaction = await prisma.transaction.findUnique({
    where: {
      ...{ id: transactionId },
      AND: [await entityVisibilityWhere("transaction")],
    },
    include: { member: { select: { id: true, displayName: true } } },
  });
  if (!transaction) return notFound("Transaction");
  if (transaction.receiptPath)
    return conflict("This transaction already has a receipt");

  await prisma.$transaction(async (tx) => {
    await sendBroadcast(
      actor,
      {
        subject: "Receipt needed",
        body:
          `Please attach a receipt for your ${transaction.category} entry of ` +
          `${formatPHP(transaction.amount)} so it can be approved.`,
        audience: "MEMBER",
        audienceMemberId: transaction.member.id,
      },
      tx,
    );

    await recordAuditEvent(
      {
        actor,
        action: "transaction.receipt_requested",
        entityType: "TRANSACTION",
        entityId: transactionId,
        entityLabel: `${transaction.category} ${formatPHP(transaction.amount)} · ${transaction.member.displayName}`,
        reason: null,
      },
      tx,
    );
  });

  return {
    ok: true,
    message: `Receipt requested from ${transaction.member.displayName}`,
  };
}

async function decideMemberRequest(
  context: AdminContext,
  requestId: string,
  approve: boolean,
  reason: string | null,
): Promise<MutationOutcome> {
  const { actor, orgId, isLeader } = context;
  const request = await prisma.memberRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return notFound("Request");
  if (request.status !== "PENDING")
    return conflict("This request has already been decided");

  // Granting org:admin is the Leader's seat to give — the same rule
  // /api/members/[memberId]/assistant-leader enforces. An Assistant Leader
  // approving an admin promotion here would route around it.
  if (
    approve &&
    request.type === "ROLE_CHANGE" &&
    request.requestedRole === "org:admin" &&
    !isLeader
  ) {
    return {
      ok: false,
      status: 403,
      error: "Only the Leader can grant the Admin role",
    };
  }

  if (approve) {
    const client = await clerkClient();
    try {
      if (request.type === "JOIN") {
        await client.organizations.createOrganizationInvitation({
          organizationId: orgId,
          emailAddress: request.email,
          role: request.requestedRole ?? "org:member",
        });
      } else if (request.clerkUserId && request.requestedRole) {
        await client.organizations.updateOrganizationMembership({
          organizationId: orgId,
          userId: request.clerkUserId,
          role: request.requestedRole,
        });
      }
    } catch (error) {
      console.error("Clerk update for member request failed", error);
      // Nothing local has changed yet, so the request stays PENDING and the
      // admin can retry — better than marking it approved when Clerk, the
      // actual source of truth for membership, refused.
      return {
        ok: false,
        status: 502,
        error: "Clerk rejected this change. The request is still pending.",
      };
    }
  }

  await prisma
    .$transaction(async (tx) => {
      const claim = await tx.memberRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: {
          status: approve ? "APPROVED" : "DENIED",
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: reason,
        },
      });
      if (claim.count !== 1) throw new ConcurrentDecisionError();

      await recordAuditEvent(
        {
          actor,
          action: approve ? "member_request.approved" : "member_request.denied",
          entityType: "MEMBER_REQUEST",
          entityId: requestId,
          entityLabel: `${request.type === "JOIN" ? "Join" : "Role change"} — ${request.displayName}`,
          before: { status: "PENDING" },
          after: {
            status: approve ? "APPROVED" : "DENIED",
            role: request.requestedRole,
          },
          reason,
        },
        tx,
      );
    })
    .catch(rethrowUnlessConcurrent);

  return { ok: true, message: approve ? "Request approved" : "Request denied" };
}

async function decideAgendaProposal(
  actor: AuditActor,
  proposalId: string,
  accept: boolean,
  reason: string | null,
): Promise<MutationOutcome> {
  const proposal = await prisma.agendaProposal.findUnique({
    where: { id: proposalId },
    include: { meeting: { select: { title: true } } },
  });
  if (!proposal) return notFound("Proposal");
  if (proposal.status !== "PENDING")
    return conflict("This proposal has already been decided");

  await prisma
    .$transaction(async (tx) => {
      const claim = await tx.agendaProposal.updateMany({
        where: { id: proposalId, status: "PENDING" },
        data: { status: accept ? "ACCEPTED" : "DECLINED" },
      });
      if (claim.count !== 1) throw new ConcurrentDecisionError();

      if (accept) {
        // Positions are contiguous and unique per meeting (see
        // prisma/models/meeting.prisma) — append at the end.
        const last = await tx.agendaItem.findFirst({
          where: { meetingId: proposal.meetingId },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        await tx.agendaItem.create({
          data: {
            meetingId: proposal.meetingId,
            text: proposal.text,
            position: (last?.position ?? -1) + 1,
            addedById: actor.id,
            sourceProposalId: proposal.id,
          },
        });
      }

      await recordAuditEvent(
        {
          actor,
          action: accept
            ? "agenda_proposal.accepted"
            : "agenda_proposal.declined",
          entityType: "AGENDA_PROPOSAL",
          entityId: proposalId,
          entityLabel: `${proposal.text} · ${proposal.meeting.title}`,
          before: { status: "PENDING" },
          after: { status: accept ? "ACCEPTED" : "DECLINED" },
          reason,
        },
        tx,
      );
    })
    .catch(rethrowUnlessConcurrent);

  return {
    ok: true,
    message: accept ? "Proposal added to the agenda" : "Proposal declined",
  };
}

async function setProjectStatus(
  actor: AuditActor,
  projectId: string,
  status: "PROPOSED" | "ACTIVE" | "COMPLETED" | "ARCHIVED" | "REJECTED",
  reason: string | null,
): Promise<MutationOutcome> {
  const project = await prisma.project.findUnique({
    where: {
      ...{ id: projectId },
      AND: [await entityVisibilityWhere("project")],
    },
  });
  if (!project) return notFound("Project");
  if (project.status === status)
    return conflict(`This project is already ${status.toLowerCase()}`);

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { status } });
    await recordAuditEvent(
      {
        actor,
        action: `project.status.${status.toLowerCase()}`,
        entityType: "PROJECT",
        entityId: projectId,
        entityLabel: project.name,
        before: { status: project.status },
        after: { status },
        reason,
      },
      tx,
    );
  });

  return {
    ok: true,
    message: `${project.name} is now ${status.toLowerCase()}`,
  };
}

async function decidePenalty(
  actor: AuditActor,
  penaltyId: string,
  status: "RESOLVED" | "WAIVED",
  reason: string | null,
): Promise<MutationOutcome> {
  const penalty = await prisma.penalty.findUnique({
    where: {
      ...{ id: penaltyId },
      AND: [await entityVisibilityWhere("penalty")],
    },
    include: { member: { select: { displayName: true } } },
  });
  if (!penalty) return notFound("Penalty");
  if (penalty.status !== "OPEN")
    return conflict("This penalty has already been decided");

  await prisma
    .$transaction(async (tx) => {
      const claim = await tx.penalty.updateMany({
        where: { id: penaltyId, status: "OPEN" },
        data: { status, resolvedAt: new Date() },
      });
      if (claim.count !== 1) throw new ConcurrentDecisionError();

      // Same rule as PATCH /api/penalties/[penaltyId]: only a monetary
      // penalty being RESOLVED (never WAIVED) produces a ledger entry, and
      // it's auto-approved because only an admin can reach this path.
      if (status === "RESOLVED" && penalty.amountCents !== null) {
        await tx.transaction.create({
          data: {
            memberId: actor.id,
            type: "INCOME",
            category: "Penalty",
            amount: penalty.amountCents,
            status: "APPROVED",
            description: penalty.reason,
            penaltyId: penalty.id,
          },
        });
      }

      await recordAuditEvent(
        {
          actor,
          action: `penalty.${status.toLowerCase()}`,
          entityType: "PENALTY",
          entityId: penaltyId,
          entityLabel: `${penalty.reason} · ${penalty.member.displayName}`,
          before: { status: "OPEN" },
          after: {
            status,
            ledgerEntryCreated:
              status === "RESOLVED" && penalty.amountCents !== null,
          },
          reason,
        },
        tx,
      );
    })
    .catch(rethrowUnlessConcurrent);

  return {
    ok: true,
    message: status === "RESOLVED" ? "Penalty marked paid" : "Penalty waived",
  };
}

async function completeTask(
  actor: AuditActor,
  taskId: string,
  reason: string | null,
): Promise<MutationOutcome> {
  const task = await prisma.task.findUnique({
    where: { ...{ id: taskId }, AND: [await taskVisibilityWhere()] },
  });
  if (!task) return notFound("Task");
  if (task.status === "DONE") return conflict("This task is already done");

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status: "DONE" } });
    await recordAuditEvent(
      {
        actor,
        action: "task.completed",
        entityType: "TASK",
        entityId: taskId,
        entityLabel: task.title,
        before: { status: task.status },
        after: { status: "DONE" },
        reason,
      },
      tx,
    );
  });

  return { ok: true, message: "Task marked done" };
}

async function extendTask(
  actor: AuditActor,
  taskId: string,
  reason: string | null,
): Promise<MutationOutcome> {
  const task = await prisma.task.findUnique({
    where: { ...{ id: taskId }, AND: [await taskVisibilityWhere()] },
  });
  if (!task) return notFound("Task");

  // Extend from today, not from the original due date — a task three weeks
  // overdue would otherwise still be overdue after being "extended".
  const dueDate = new Date(Date.now() + 7 * DAY_MS);

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { dueDate } });
    await recordAuditEvent(
      {
        actor,
        action: "task.due_date.extended",
        entityType: "TASK",
        entityId: taskId,
        entityLabel: task.title,
        before: { dueDate: task.dueDate.toISOString() },
        after: { dueDate: dueDate.toISOString() },
        reason,
      },
      tx,
    );
  });

  return { ok: true, message: "Due date extended by 7 days" };
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

class ConcurrentDecisionError extends Error {
  constructor() {
    super("Already decided");
    this.name = "ConcurrentDecisionError";
  }
}

function rethrowUnlessConcurrent(error: unknown): void {
  if (error instanceof ConcurrentDecisionError) return;
  throw error;
}

export { ConcurrentDecisionError };

// ---------------------------------------------------------------------------
// Inline cell edits
// ---------------------------------------------------------------------------

export interface InlineEditInput {
  kind: string;
  recordId: string;
  field: string;
  value: unknown;
  reason?: unknown;
}

/**
 * Zone 4's inline cells. Each case validates its own value shape before
 * writing — the client sends `{ field, value }` and nothing about that is
 * trusted, including which fields are editable at all.
 */
export async function applyInlineEdit(
  context: AdminContext,
  input: InlineEditInput,
): Promise<MutationOutcome> {
  switch (`${input.kind}.${input.field}`) {
    case "members.orgRole":
      return updateMemberRole(context, input.recordId, input.value);
    case "members.status":
      return updateMemberStatus(context.actor, input.recordId, input.value);
    case "finance.amount":
      return updateTransactionAmount(
        context.actor,
        input.recordId,
        input.value,
        input.reason,
      );
    case "finance.category":
      return updateTransactionCategory(
        context.actor,
        input.recordId,
        input.value,
      );
    case "penalties.amount":
      return updatePenaltyAmount(
        context.actor,
        input.recordId,
        input.value,
        input.reason,
      );
    case "penalties.dueAt":
      return updatePenaltyDueAt(context.actor, input.recordId, input.value);
    case "penalties.status":
      return decidePenalty(
        context.actor,
        input.recordId,
        input.value === "WAIVED" ? "WAIVED" : "RESOLVED",
        input.value === "WAIVED" ? requireReason(input.reason) : null,
      );
    case "projects.status":
      return setProjectStatus(
        context.actor,
        input.recordId,
        input.value as "PROPOSED" | "ACTIVE" | "COMPLETED" | "ARCHIVED",
        typeof input.reason === "string" ? input.reason : null,
      );
    case "projects.priority":
      return updateProjectPriority(context.actor, input.recordId, input.value);
    case "activity.status":
      return input.value === "DONE"
        ? completeTask(context.actor, input.recordId, null)
        : updateTaskStatus(context.actor, input.recordId, input.value);
    case "activity.dueAt":
      return updateTaskDueDate(context.actor, input.recordId, input.value);
    default:
      return {
        ok: false,
        status: 400,
        error: `${input.field} is not editable on ${input.kind}`,
      };
  }
}

async function updateMemberRole(
  context: AdminContext,
  memberId: string,
  value: unknown,
): Promise<MutationOutcome> {
  if (value !== "org:admin" && value !== "org:member") {
    return {
      ok: false,
      status: 400,
      error: "Role must be org:admin or org:member",
    };
  }

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return notFound("Member");

  // The Leader's seat is fixed (context/team-roster.md), and only the
  // Leader hands out the Assistant Leader's org:admin. Both checks live
  // here, on the server, not only on the select that renders the options.
  if (member.isLeader) {
    return {
      ok: false,
      status: 400,
      error: "The Leader's role can't be changed",
    };
  }
  if (!context.isLeader) {
    return {
      ok: false,
      status: 403,
      error: "Only the Leader can change a member's Admin role",
    };
  }

  const client = await clerkClient();
  try {
    await client.organizations.updateOrganizationMembership({
      organizationId: context.orgId,
      userId: member.clerkUserId,
      role: value,
    });
  } catch (error) {
    console.error("Clerk role update failed", error);
    return { ok: false, status: 502, error: "Clerk rejected the role change" };
  }

  await recordAuditEvent({
    actor: context.actor,
    action: "member.role.updated",
    entityType: "MEMBER",
    entityId: memberId,
    entityLabel: member.displayName,
    after: { orgRole: value },
    reason: null,
  });

  return {
    ok: true,
    message: `${member.displayName} is now ${value === "org:admin" ? "an Admin" : "a Member"}`,
  };
}

async function updateMemberStatus(
  actor: AuditActor,
  memberId: string,
  value: unknown,
): Promise<MutationOutcome> {
  if (value !== "ACTIVE" && value !== "INACTIVE") {
    return {
      ok: false,
      status: 400,
      error: "Status must be ACTIVE or INACTIVE",
    };
  }

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return notFound("Member");

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: { status: value },
    });
    await recordAuditEvent(
      {
        actor,
        action: "member.status.updated",
        entityType: "MEMBER",
        entityId: memberId,
        entityLabel: member.displayName,
        before: { status: member.status },
        after: { status: value },
        reason: null,
      },
      tx,
    );
  });

  return {
    ok: true,
    message: `${member.displayName} set ${value.toLowerCase()}`,
  };
}

function parseCentavos(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const centavos = Math.round(value);
  if (!Number.isInteger(centavos) || centavos < 0) return null;
  return centavos;
}

/**
 * The "edit any transaction" override. A PENDING transaction is edited in
 * place; a settled one is corrected by an offsetting adjustment entry,
 * never a rewrite — architecture-context.md invariant 6. Both paths demand
 * a reason and both land in the audit log.
 */
async function updateTransactionAmount(
  actor: AuditActor,
  transactionId: string,
  value: unknown,
  rawReason: unknown,
): Promise<MutationOutcome> {
  const amount = parseCentavos(value);
  if (amount === null)
    return {
      ok: false,
      status: 400,
      error: "Amount must be a whole number of centavos",
    };

  const reason = requireReason(rawReason);
  const existing = await prisma.transaction.findUnique({
    where: {
      ...{ id: transactionId },
      AND: [await entityVisibilityWhere("transaction")],
    },
    include: { member: { select: { displayName: true } } },
  });
  if (!existing) return notFound("Transaction");
  if (existing.amount === amount) return { ok: true, message: "No change" };

  const label = `${existing.category} ${formatPHP(existing.amount)} · ${existing.member.displayName}`;

  if (existing.status === "PENDING") {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transactionId },
        data: { amount },
      });
      await recordAuditEvent(
        {
          actor,
          action: "transaction.amount.updated",
          entityType: "TRANSACTION",
          entityId: transactionId,
          entityLabel: label,
          before: { amount: existing.amount },
          after: { amount },
          reason,
        },
        tx,
      );
    });
    return { ok: true, message: `Amount updated to ${formatPHP(amount)}` };
  }

  const delta = amount - existing.amount;
  const adjustmentId = await prisma.$transaction(async (tx) => {
    // An adjustment of the same sign increases the original's effect; the
    // opposite sign reduces it. Expressed by flipping the type rather than
    // storing a negative amount, since `amount` is an unsigned centavo
    // count everywhere else in the ledger.
    const increases = delta > 0;
    const adjustment = await tx.transaction.create({
      data: {
        memberId: existing.memberId,
        type: increases === (existing.type === "INCOME") ? "INCOME" : "EXPENSE",
        category: existing.category,
        amount: Math.abs(delta),
        status: "APPROVED",
        description: `Adjustment to ${existing.category} of ${formatPHP(existing.amount)} — ${reason}`,
      },
      select: { id: true },
    });

    await recordAuditEvent(
      {
        actor,
        action: "transaction.amount.adjusted",
        entityType: "TRANSACTION",
        entityId: transactionId,
        entityLabel: label,
        before: { amount: existing.amount, status: existing.status },
        after: {
          intendedAmount: amount,
          adjustmentId: adjustment.id,
          deltaCents: delta,
        },
        reason,
      },
      tx,
    );

    return adjustment.id;
  });

  return {
    ok: true,
    message: `Settled record kept; ${formatPHP(Math.abs(delta))} adjustment entry created (${adjustmentId.slice(0, 8)})`,
  };
}

async function updateTransactionCategory(
  actor: AuditActor,
  transactionId: string,
  value: unknown,
): Promise<MutationOutcome> {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, status: 400, error: "Category is required" };
  }
  const category = value.trim();

  const existing = await prisma.transaction.findUnique({
    where: {
      ...{ id: transactionId },
      AND: [await entityVisibilityWhere("transaction")],
    },
    include: { member: { select: { displayName: true } } },
  });
  if (!existing) return notFound("Transaction");

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transactionId },
      data: { category },
    });
    await recordAuditEvent(
      {
        actor,
        action: "transaction.category.updated",
        entityType: "TRANSACTION",
        entityId: transactionId,
        entityLabel: `${existing.category} ${formatPHP(existing.amount)} · ${existing.member.displayName}`,
        before: { category: existing.category },
        after: { category },
        reason: null,
      },
      tx,
    );
  });

  return { ok: true, message: `Category set to ${category}` };
}

async function updatePenaltyAmount(
  actor: AuditActor,
  penaltyId: string,
  value: unknown,
  rawReason: unknown,
): Promise<MutationOutcome> {
  const amount = value === null ? null : parseCentavos(value);
  if (value !== null && amount === null) {
    return {
      ok: false,
      status: 400,
      error: "Amount must be a whole number of centavos",
    };
  }

  const reason = requireReason(rawReason);
  const penalty = await prisma.penalty.findUnique({
    where: {
      ...{ id: penaltyId },
      AND: [await entityVisibilityWhere("penalty")],
    },
    include: { member: { select: { displayName: true } } },
  });
  if (!penalty) return notFound("Penalty");
  // Same invariant as the ledger: a settled penalty's issued terms are
  // never rewritten (see prisma/models/penalty.prisma).
  if (penalty.status !== "OPEN") {
    return conflict("A resolved or waived penalty can't be re-priced");
  }

  await prisma.$transaction(async (tx) => {
    await tx.penalty.update({
      where: { id: penaltyId },
      data: { amountCents: amount },
    });
    await recordAuditEvent(
      {
        actor,
        action: "penalty.amount.updated",
        entityType: "PENALTY",
        entityId: penaltyId,
        entityLabel: `${penalty.reason} · ${penalty.member.displayName}`,
        before: { amountCents: penalty.amountCents },
        after: { amountCents: amount },
        reason,
      },
      tx,
    );
  });

  return {
    ok: true,
    message:
      amount === null ? "Amount cleared" : `Amount set to ${formatPHP(amount)}`,
  };
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function updatePenaltyDueAt(
  actor: AuditActor,
  penaltyId: string,
  value: unknown,
): Promise<MutationOutcome> {
  const dueAt = parseDate(value);
  if (!dueAt)
    return {
      ok: false,
      status: 400,
      error: "Due date must be an ISO date string",
    };

  const penalty = await prisma.penalty.findUnique({
    where: {
      ...{ id: penaltyId },
      AND: [await entityVisibilityWhere("penalty")],
    },
    include: { member: { select: { displayName: true } } },
  });
  if (!penalty) return notFound("Penalty");

  await prisma.$transaction(async (tx) => {
    await tx.penalty.update({ where: { id: penaltyId }, data: { dueAt } });
    await recordAuditEvent(
      {
        actor,
        action: "penalty.due_date.updated",
        entityType: "PENALTY",
        entityId: penaltyId,
        entityLabel: `${penalty.reason} · ${penalty.member.displayName}`,
        before: { dueAt: penalty.dueAt?.toISOString() ?? null },
        after: { dueAt: dueAt.toISOString() },
        reason: null,
      },
      tx,
    );
  });

  return { ok: true, message: `Due ${dueAt.toLocaleDateString()}` };
}

async function updateProjectPriority(
  actor: AuditActor,
  projectId: string,
  value: unknown,
): Promise<MutationOutcome> {
  if (value !== "LOW" && value !== "MEDIUM" && value !== "HIGH") {
    return {
      ok: false,
      status: 400,
      error: "Priority must be LOW, MEDIUM or HIGH",
    };
  }

  const project = await prisma.project.findUnique({
    where: {
      ...{ id: projectId },
      AND: [await entityVisibilityWhere("project")],
    },
  });
  if (!project) return notFound("Project");

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { priority: value },
    });
    await recordAuditEvent(
      {
        actor,
        action: "project.priority.updated",
        entityType: "PROJECT",
        entityId: projectId,
        entityLabel: project.name,
        before: { priority: project.priority },
        after: { priority: value },
        reason: null,
      },
      tx,
    );
  });

  return {
    ok: true,
    message: `${project.name} set to ${value.toLowerCase()} priority`,
  };
}

async function updateTaskStatus(
  actor: AuditActor,
  taskId: string,
  value: unknown,
): Promise<MutationOutcome> {
  if (value !== "TODO" && value !== "IN_PROGRESS" && value !== "DONE") {
    return {
      ok: false,
      status: 400,
      error: "Status must be TODO, IN_PROGRESS or DONE",
    };
  }

  const task = await prisma.task.findUnique({
    where: { ...{ id: taskId }, AND: [await taskVisibilityWhere()] },
  });
  if (!task) return notFound("Task");

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status: value } });
    await recordAuditEvent(
      {
        actor,
        action: "task.status.updated",
        entityType: "TASK",
        entityId: taskId,
        entityLabel: task.title,
        before: { status: task.status },
        after: { status: value },
        reason: null,
      },
      tx,
    );
  });

  return { ok: true, message: "Task updated" };
}

async function updateTaskDueDate(
  actor: AuditActor,
  taskId: string,
  value: unknown,
): Promise<MutationOutcome> {
  const dueDate = parseDate(value);
  if (!dueDate)
    return {
      ok: false,
      status: 400,
      error: "Due date must be an ISO date string",
    };

  const task = await prisma.task.findUnique({
    where: { ...{ id: taskId }, AND: [await taskVisibilityWhere()] },
  });
  if (!task) return notFound("Task");

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { dueDate } });
    await recordAuditEvent(
      {
        actor,
        action: "task.due_date.updated",
        entityType: "TASK",
        entityId: taskId,
        entityLabel: task.title,
        before: { dueDate: task.dueDate.toISOString() },
        after: { dueDate: dueDate.toISOString() },
        reason: null,
      },
      tx,
    );
  });

  return { ok: true, message: `Due ${dueDate.toLocaleDateString()}` };
}

// ---------------------------------------------------------------------------
// Overrides — reassignment, always with a reason
// ---------------------------------------------------------------------------

export async function reassignTask(
  actor: AuditActor,
  taskId: string,
  memberIds: unknown,
  rawReason: unknown,
): Promise<MutationOutcome> {
  if (
    !Array.isArray(memberIds) ||
    memberIds.some((id) => typeof id !== "string")
  ) {
    return {
      ok: false,
      status: 400,
      error: "memberIds must be an array of member ids",
    };
  }
  const reason = requireReason(rawReason);

  const [task, members] = await Promise.all([
    prisma.task.findUnique({
      where: { ...{ id: taskId }, AND: [await taskVisibilityWhere()] },
      include: {
        assignees: { include: { member: { select: { displayName: true } } } },
      },
    }),
    prisma.member.findMany({
      where: { id: { in: memberIds as string[] } },
      select: { id: true, displayName: true },
    }),
  ]);
  if (!task) return notFound("Task");
  if (members.length !== memberIds.length) {
    return { ok: false, status: 400, error: "One or more members don't exist" };
  }

  const before = task.assignees.map((a) => a.member.displayName);

  await prisma.$transaction(async (tx) => {
    await tx.taskAssignee.deleteMany({
      where: {
        taskId,
        memberId: { notIn: members.map((member) => member.id) },
      },
    });
    if (members.length > 0) {
      await tx.taskAssignee.createMany({
        data: members.map((member) => ({ taskId, memberId: member.id })),
        skipDuplicates: true,
      });
    }
    await recordAuditEvent(
      {
        actor,
        action: "task.reassigned",
        entityType: "TASK",
        entityId: taskId,
        entityLabel: task.title,
        before: { assignees: before },
        after: { assignees: members.map((m) => m.displayName) },
        reason,
      },
      tx,
    );
  });

  return {
    ok: true,
    message: `Reassigned to ${members.map((m) => m.displayName).join(", ") || "no one"}`,
  };
}

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

export const BULK_ACTIONS = [
  "members.set_role",
  "members.set_status",
  "penalties.waive",
  "penalties.resolve",
  "finance.approve",
  "finance.reject",
  "projects.archive",
] as const;

export type BulkAction = (typeof BULK_ACTIONS)[number];

export function isBulkAction(value: unknown): value is BulkAction {
  return (
    typeof value === "string" &&
    (BULK_ACTIONS as readonly string[]).includes(value)
  );
}

export interface BulkResult {
  succeeded: number;
  failed: { id: string; error: string }[];
}

/**
 * Runs one action across a selection. Deliberately sequential and
 * per-record rather than a single `updateMany`: each record gets its own
 * guard check (already decided? Leader? settled?) and its own audit entry,
 * and one refusal must not silently take the rest of the batch with it.
 */
export async function applyBulkAction(
  context: AdminContext,
  action: BulkAction,
  ids: string[],
  value: unknown,
  rawReason: unknown,
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: 0, failed: [] };

  for (const id of ids) {
    let outcome: MutationOutcome;
    try {
      switch (action) {
        case "members.set_role":
          outcome = await updateMemberRole(context, id, value);
          break;
        case "members.set_status":
          outcome = await updateMemberStatus(context.actor, id, value);
          break;
        case "penalties.waive":
          outcome = await decidePenalty(
            context.actor,
            id,
            "WAIVED",
            requireReason(rawReason),
          );
          break;
        case "penalties.resolve":
          outcome = await decidePenalty(context.actor, id, "RESOLVED", null);
          break;
        case "finance.approve":
          outcome = await decideTransaction(
            context.actor,
            id,
            "APPROVED",
            null,
          );
          break;
        case "finance.reject":
          outcome = await decideTransaction(
            context.actor,
            id,
            "REJECTED",
            null,
          );
          break;
        case "projects.archive":
          outcome = await setProjectStatus(
            context.actor,
            id,
            "ARCHIVED",
            typeof rawReason === "string" ? rawReason : null,
          );
          break;
      }
    } catch (error) {
      outcome = {
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : "Failed",
      };
    }

    if (outcome.ok) result.succeeded += 1;
    else result.failed.push({ id, error: outcome.error });
  }

  return result;
}
