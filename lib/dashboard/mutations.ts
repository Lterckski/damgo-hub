import { NextResponse } from "next/server";

import { getCurrentMember } from "@/lib/current-member";
import { prisma } from "@/lib/prisma";
import type { Member } from "@/app/generated/prisma/client";

/**
 * The handful of things a member may change from their own dashboard.
 *
 * Part 4's boundary, made concrete: My Dashboard is built as though the
 * signed-in user has no elevated permissions, and Team Overview is
 * read-mostly. So the entire mutation surface here is:
 *
 *   - complete a task assigned to you
 *   - claim you've paid your own penalty (an admin still confirms it)
 *   - dispute your own penalty
 *   - upvote an idea
 *   - dismiss an announcement for yourself
 *
 * Every one of these is scoped to the caller server-side. None of them
 * settle money, change anyone else's record, or touch shared state that
 * isn't explicitly shared (a vote, a dismissal). Anything beyond this list
 * belongs in /admin.
 */

export type DashboardGuard =
  | { ok: true; member: Member }
  | { ok: false; response: NextResponse };

export async function requireMember(): Promise<DashboardGuard> {
  try {
    return { ok: true, member: await getCurrentMember() };
  } catch {
    // getCurrentMember() throws without an authenticated Clerk session.
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}

export type DashboardOutcome =
  | { ok: true; message: string }
  | { ok: false; status: number; error: string };

/**
 * Marks a task done and stamps `completedAt`.
 *
 * Authorization is assignee-based, not role-based: you may complete a task
 * assigned to you. Note this is stricter than the existing
 * PATCH /api/tasks/[taskId], which lets any authenticated member edit any
 * task — that route's looseness is pre-existing and out of scope here, but
 * the dashboard's own endpoint should not inherit it.
 */
export async function completeMyTask(
  member: Member,
  taskId: string,
  done: boolean,
): Promise<DashboardOutcome> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true, assignees: { where: { memberId: member.id }, select: { id: true } } },
  });

  if (!task) return { ok: false, status: 404, error: "Task not found" };
  if (task.assignees.length === 0) {
    return { ok: false, status: 403, error: "This task isn't assigned to you" };
  }

  const nextStatus = done ? "DONE" : "TODO";
  if (task.status === nextStatus) return { ok: true, message: "No change" };

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      // Cleared on reopen, so a task finished, reopened and finished again
      // is dated by its latest completion rather than its first.
      data: { status: nextStatus, completedAt: done ? new Date() : null },
    });

    if (done) {
      await tx.activityEvent.create({
        data: {
          type: "TASK_COMPLETED",
          actorId: member.id,
          actorName: member.displayName,
          entityType: "TASK",
          entityId: taskId,
          entityLabel: task.title,
          summary: `${member.displayName} completed “${task.title}”`,
        },
      });
    }
  });

  return { ok: true, message: done ? "Task completed" : "Task reopened" };
}

/** Records that the member says they've paid. An admin still has to confirm. */
export async function claimPenaltyPaid(member: Member, penaltyId: string): Promise<DashboardOutcome> {
  const penalty = await prisma.penalty.findUnique({
    where: { id: penaltyId },
    select: { id: true, memberId: true, status: true, reason: true, paymentClaimedAt: true },
  });

  if (!penalty) return { ok: false, status: 404, error: "Penalty not found" };
  if (penalty.memberId !== member.id) {
    return { ok: false, status: 403, error: "That penalty isn't yours" };
  }
  if (penalty.status !== "OPEN") {
    return { ok: false, status: 409, error: "This penalty has already been settled" };
  }
  if (penalty.paymentClaimedAt) {
    return { ok: false, status: 409, error: "You've already marked this as paid — an admin is confirming it" };
  }

  await prisma.penalty.update({
    where: { id: penaltyId },
    data: { paymentClaimedAt: new Date() },
  });

  return { ok: true, message: "Marked as paid — an admin will confirm it" };
}

export async function disputePenalty(
  member: Member,
  penaltyId: string,
  reason: unknown,
): Promise<DashboardOutcome> {
  if (typeof reason !== "string" || reason.trim().length < 3) {
    return { ok: false, status: 400, error: "Tell us why you're disputing this" };
  }

  const penalty = await prisma.penalty.findUnique({
    where: { id: penaltyId },
    select: { id: true, memberId: true, status: true, reason: true, dispute: { select: { status: true } } },
  });

  if (!penalty) return { ok: false, status: 404, error: "Penalty not found" };
  if (penalty.memberId !== member.id) {
    return { ok: false, status: 403, error: "That penalty isn't yours" };
  }
  if (penalty.status !== "OPEN") {
    return { ok: false, status: 409, error: "This penalty has already been settled" };
  }
  if (penalty.dispute?.status === "OPEN") {
    return { ok: false, status: 409, error: "You already have an open dispute on this" };
  }

  await prisma.penaltyDispute.upsert({
    where: { penaltyId },
    // Re-disputing a previously rejected penalty reuses the row rather
    // than accumulating history the member can't see anyway.
    update: { reason: reason.trim(), status: "OPEN", resolvedAt: null, resolutionNote: null },
    create: { penaltyId, raisedById: member.id, reason: reason.trim() },
  });

  return { ok: true, message: "Dispute submitted" };
}

/** Toggles this member's vote. Idempotent per member by the composite unique. */
export async function toggleIdeaVote(member: Member, ideaNodeId: unknown): Promise<DashboardOutcome> {
  if (typeof ideaNodeId !== "string" || ideaNodeId.trim() === "") {
    return { ok: false, status: 400, error: "ideaNodeId is required" };
  }

  const existing = await prisma.ideaVote.findUnique({
    where: { ideaNodeId_memberId: { ideaNodeId, memberId: member.id } },
    select: { id: true },
  });

  if (existing) {
    await prisma.ideaVote.delete({ where: { id: existing.id } });
    return { ok: true, message: "Vote removed" };
  }

  await prisma.ideaVote.create({ data: { ideaNodeId, memberId: member.id } });
  return { ok: true, message: "Voted" };
}

/** Dismisses an announcement for this member only. */
export async function dismissAnnouncement(
  member: Member,
  announcementId: string,
): Promise<DashboardOutcome> {
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    select: { id: true },
  });
  if (!announcement) return { ok: false, status: 404, error: "Announcement not found" };

  await prisma.announcementDismissal.upsert({
    where: { announcementId_memberId: { announcementId, memberId: member.id } },
    update: {},
    create: { announcementId, memberId: member.id },
  });

  return { ok: true, message: "Dismissed" };
}
