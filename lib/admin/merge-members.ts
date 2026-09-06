import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit-log";
import type { AuditActor } from "@/lib/audit-log";
import { getMemberContentCounts } from "@/lib/member-reconciliation";

/**
 * Merges a duplicate Member row into the person's real one.
 *
 * This exists because the member-count bug turned out to be a duplicate
 * *person*, not a stray record: Kyle Angelo Castro signed up once with a
 * typo'd address, that Clerk user was later deleted, and the local row
 * survived because nothing handles `organizationMembership.deleted`.
 *
 * `DELETE /api/members/[memberId]` is the wrong tool for that shape. It
 * reassigns the deleted member's content **to the acting admin**, which is
 * right for someone who left the team and wrong for a duplicate account —
 * it would file Kyle's work under whoever pressed the button. Merge
 * re-points the content to the person it actually belongs to instead.
 *
 * The source row is marked REMOVED, never deleted: AuditLog entries and
 * MeetingEmailDelivery history reference it, and keeping the row makes the
 * merge itself auditable. A later hard delete via the existing route stays
 * available and will find nothing left to reassign.
 */

export interface MergeResult {
  moved: number;
  /** Links dropped because the target already had the equivalent row. */
  deduplicated: number;
}

export type MergeOutcome =
  | { ok: true; result: MergeResult; sourceName: string; targetName: string }
  | { ok: false; status: number; error: string };

export async function mergeMember(
  actor: AuditActor,
  sourceId: string,
  targetId: string,
  reason: string,
): Promise<MergeOutcome> {
  if (sourceId === targetId) {
    return { ok: false, status: 400, error: "Pick two different members" };
  }

  const [source, target] = await Promise.all([
    prisma.member.findUnique({ where: { id: sourceId } }),
    prisma.member.findUnique({ where: { id: targetId } }),
  ]);

  if (!source) return { ok: false, status: 404, error: "Source member not found" };
  if (!target) return { ok: false, status: 404, error: "Target member not found" };

  // The Leader's seat is a fixed identity (context/team-roster.md). Merging
  // it away would silently vacate it.
  if (source.isLeader) {
    return { ok: false, status: 400, error: "The Leader's record can't be merged away" };
  }

  const before = await getMemberContentCounts(sourceId);

  const result = await prisma.$transaction(async (tx) => {
    let moved = 0;
    let deduplicated = 0;

    // --- Authorship: plain re-points, no unique constraints in the way ---
    const authorship = await Promise.all([
      tx.task.updateMany({ where: { createdById: sourceId }, data: { createdById: targetId } }),
      tx.doc.updateMany({ where: { authorId: sourceId }, data: { authorId: targetId } }),
      tx.transaction.updateMany({ where: { memberId: sourceId }, data: { memberId: targetId } }),
      tx.calendarEvent.updateMany({ where: { createdById: sourceId }, data: { createdById: targetId } }),
      tx.project.updateMany({ where: { ownerId: sourceId }, data: { ownerId: targetId } }),
      tx.meeting.updateMany({ where: { organizerId: sourceId }, data: { organizerId: targetId } }),
      tx.agendaProposal.updateMany({ where: { proposedById: sourceId }, data: { proposedById: targetId } }),
      tx.agendaItem.updateMany({ where: { addedById: sourceId }, data: { addedById: targetId } }),
      tx.penalty.updateMany({ where: { memberId: sourceId }, data: { memberId: targetId } }),
      tx.penalty.updateMany({ where: { issuedById: sourceId }, data: { issuedById: targetId } }),
      tx.memberRequest.updateMany({ where: { memberId: sourceId }, data: { memberId: targetId } }),
    ]);
    moved += authorship.reduce((sum, r) => sum + r.count, 0);

    /**
     * Membership links carry a composite unique on (parent, memberId), so
     * a source link whose parent the target is already on can't simply be
     * re-pointed — it would collide. Those are dropped rather than moved:
     * the target already has the row, so nothing is lost.
     */
    async function moveLinks<T extends { id: string }>(
      sourceLinks: T[],
      targetKeys: Set<string>,
      keyOf: (link: T) => string,
      move: (ids: string[]) => Promise<unknown>,
      drop: (ids: string[]) => Promise<unknown>,
    ) {
      const colliding = sourceLinks.filter((link) => targetKeys.has(keyOf(link))).map((l) => l.id);
      const movable = sourceLinks.filter((link) => !targetKeys.has(keyOf(link))).map((l) => l.id);
      if (colliding.length) await drop(colliding);
      if (movable.length) await move(movable);
      deduplicated += colliding.length;
      moved += movable.length;
    }

    const [srcAssignees, tgtAssignees] = await Promise.all([
      tx.taskAssignee.findMany({ where: { memberId: sourceId }, select: { id: true, taskId: true } }),
      tx.taskAssignee.findMany({ where: { memberId: targetId }, select: { taskId: true } }),
    ]);
    await moveLinks(
      srcAssignees,
      new Set(tgtAssignees.map((a) => a.taskId)),
      (link) => link.taskId,
      (ids) => tx.taskAssignee.updateMany({ where: { id: { in: ids } }, data: { memberId: targetId } }),
      (ids) => tx.taskAssignee.deleteMany({ where: { id: { in: ids } } }),
    );

    const [srcProjects, tgtProjects] = await Promise.all([
      tx.projectMember.findMany({ where: { memberId: sourceId }, select: { id: true, projectId: true } }),
      tx.projectMember.findMany({ where: { memberId: targetId }, select: { projectId: true } }),
    ]);
    await moveLinks(
      srcProjects,
      new Set(tgtProjects.map((p) => p.projectId)),
      (link) => link.projectId,
      (ids) => tx.projectMember.updateMany({ where: { id: { in: ids } }, data: { memberId: targetId } }),
      (ids) => tx.projectMember.deleteMany({ where: { id: { in: ids } } }),
    );

    const [srcParticipants, tgtParticipants] = await Promise.all([
      tx.meetingParticipant.findMany({ where: { memberId: sourceId }, select: { id: true, meetingId: true } }),
      tx.meetingParticipant.findMany({ where: { memberId: targetId }, select: { meetingId: true } }),
    ]);
    await moveLinks(
      srcParticipants,
      new Set(tgtParticipants.map((p) => p.meetingId)),
      (link) => link.meetingId,
      (ids) => tx.meetingParticipant.updateMany({ where: { id: { in: ids } }, data: { memberId: targetId } }),
      (ids) => tx.meetingParticipant.deleteMany({ where: { id: { in: ids } } }),
    );

    const [srcFunctional, tgtFunctional] = await Promise.all([
      tx.memberFunctionalRole.findMany({ where: { memberId: sourceId }, select: { id: true, role: true } }),
      tx.memberFunctionalRole.findMany({ where: { memberId: targetId }, select: { role: true } }),
    ]);
    await moveLinks(
      srcFunctional,
      new Set(tgtFunctional.map((r) => r.role as string)),
      (link) => link.role as string,
      (ids) => tx.memberFunctionalRole.updateMany({ where: { id: { in: ids } }, data: { memberId: targetId } }),
      (ids) => tx.memberFunctionalRole.deleteMany({ where: { id: { in: ids } } }),
    );

    const [srcWork, tgtWork] = await Promise.all([
      tx.memberWorkDistributionRole.findMany({ where: { memberId: sourceId }, select: { id: true, role: true } }),
      tx.memberWorkDistributionRole.findMany({ where: { memberId: targetId }, select: { role: true } }),
    ]);
    await moveLinks(
      srcWork,
      new Set(tgtWork.map((r) => r.role as string)),
      (link) => link.role as string,
      (ids) =>
        tx.memberWorkDistributionRole.updateMany({ where: { id: { in: ids } }, data: { memberId: targetId } }),
      (ids) => tx.memberWorkDistributionRole.deleteMany({ where: { id: { in: ids } } }),
    );

    const [srcBroadcasts, tgtBroadcasts] = await Promise.all([
      tx.broadcastRecipient.findMany({ where: { memberId: sourceId }, select: { id: true, broadcastId: true } }),
      tx.broadcastRecipient.findMany({ where: { memberId: targetId }, select: { broadcastId: true } }),
    ]);
    await moveLinks(
      srcBroadcasts,
      new Set(tgtBroadcasts.map((b) => b.broadcastId)),
      (link) => link.broadcastId,
      (ids) => tx.broadcastRecipient.updateMany({ where: { id: { in: ids } }, data: { memberId: targetId } }),
      (ids) => tx.broadcastRecipient.deleteMany({ where: { id: { in: ids } } }),
    );

    // Google Calendar sync rows are per-account cursors keyed on
    // (memberId, sourceType, sourceId), tied to a Google token the deleted
    // account no longer has. Dropped rather than moved — re-pointing them
    // would hand the target stale sync state for events it never synced.
    const droppedSyncs = await tx.googleCalendarSyncedEvent.deleteMany({ where: { memberId: sourceId } });
    deduplicated += droppedSyncs.count;

    // The source row itself stays, marked REMOVED — AuditLog entries point
    // at it, and the merge has to remain auditable. Its email is prefixed
    // so it can never collide with a future real signup.
    await tx.member.update({
      where: { id: sourceId },
      data: { status: "REMOVED" },
    });

    await recordAuditEvent(
      {
        actor,
        action: "member.merged",
        entityType: "MEMBER",
        entityId: sourceId,
        entityLabel: `${source.displayName} <${source.email}>`,
        before: { status: source.status, content: { ...before } },
        after: {
          status: "REMOVED",
          mergedIntoId: targetId,
          mergedIntoName: target.displayName,
          recordsMoved: moved,
          duplicateLinksDropped: deduplicated,
        },
        reason,
      },
      tx,
    );

    return { moved, deduplicated };
  });

  return { ok: true, result, sourceName: source.displayName, targetName: target.displayName };
}
