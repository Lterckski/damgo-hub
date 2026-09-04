import { runs, tasks } from "@trigger.dev/sdk";

import type { Prisma } from "@/app/generated/prisma/client";
import type { MeetingNotificationType } from "@/app/generated/prisma/enums";
import { sendEmail } from "@/lib/email";
import { meetingEmailHtml, meetingEmailSubject, type MeetingEmailKind } from "@/lib/meeting-email-template";
import { prisma } from "@/lib/prisma";
import type { meetingNotificationTask } from "@/src/trigger/meeting-notification";
import type { meetingReminderTask } from "@/src/trigger/meeting-reminder";

const REMINDER_24H_MS = 24 * 60 * 60 * 1000;
const REMINDER_1H_MS = 60 * 60 * 1000;
const MAX_OUTBOX_ATTEMPTS = 8;

export interface MeetingSnapshot {
  title: string;
  description: string | null;
  scheduledAt: string;
  endsAt: string | null;
  location: string | null;
  meetingUrl: string | null;
  organizerName: string;
}

export type ImmediateMeetingNotificationType = Exclude<
  MeetingNotificationType,
  "REMINDER_24H" | "REMINDER_1H"
>;

export interface MeetingNotificationPayload {
  meetingId: string;
  notificationType: ImmediateMeetingNotificationType;
  meetingRevision: number;
  recipientMemberIds: string[];
  snapshot: MeetingSnapshot;
}

/**
 * Persists one immediate meeting-notification intent in the same transaction
 * as the source mutation, before any call to Trigger.dev.
 */
export async function createMeetingNotificationOutbox(
  tx: Prisma.TransactionClient,
  notificationType: ImmediateMeetingNotificationType,
  meetingId: string,
  meetingRevision: number,
  recipientMemberIds: string[],
  snapshot: MeetingSnapshot,
): Promise<string | null> {
  const uniqueRecipients = [...new Set(recipientMemberIds)];
  if (uniqueRecipients.length === 0) return null;

  const outbox = await tx.meetingNotificationOutbox.create({
    data: {
      meetingId,
      notificationType,
      meetingRevision,
      recipientMemberIds: uniqueRecipients,
      snapshot: { ...snapshot },
    },
    select: { id: true },
  });
  return outbox.id;
}

/** Best-effort fast path; the scheduled sweep recovers records if Trigger.dev is unavailable. */
export async function enqueueMeetingNotificationOutbox(outboxId: string): Promise<void> {
  try {
    await tasks.trigger<typeof meetingNotificationTask>("meeting-notification", {
      outboxId,
    });
  } catch (error) {
    console.error("Failed to enqueue durable meeting notification", { outboxId, error });
  }
}

export async function enqueueMeetingNotificationOutboxes(outboxIds: Array<string | null>): Promise<void> {
  await Promise.all(outboxIds.filter((id): id is string => id !== null).map(enqueueMeetingNotificationOutbox));
}

/**
 * Schedules the 24h/1h-before reminder runs for a meeting. Skips (returns
 * null for) any occurrence whose fire time has already passed, per this
 * spec's explicit "skip that occurrence instead of sending it late."
 * Returns the run IDs to store on the Meeting row so a later
 * reschedule/cancellation can find and cancel them.
 */
export async function scheduleMeetingReminders(meeting: {
  id: string;
  scheduledAt: Date;
  notificationRevision: number;
}): Promise<{ reminder24hRunId: string | null; reminder1hRunId: string | null }> {
  const now = Date.now();
  const reminder24hAt = new Date(meeting.scheduledAt.getTime() - REMINDER_24H_MS);
  const reminder1hAt = new Date(meeting.scheduledAt.getTime() - REMINDER_1H_MS);

  const [reminder24hRunId, reminder1hRunId] = await Promise.all([
    reminder24hAt.getTime() > now
      ? triggerReminder(meeting.id, meeting.notificationRevision, "REMINDER_24H", reminder24hAt)
      : null,
    reminder1hAt.getTime() > now
      ? triggerReminder(meeting.id, meeting.notificationRevision, "REMINDER_1H", reminder1hAt)
      : null,
  ]);

  return { reminder24hRunId, reminder1hRunId };
}

async function triggerReminder(
  meetingId: string,
  expectedNotificationRevision: number,
  reminderType: "REMINDER_24H" | "REMINDER_1H",
  fireAt: Date,
): Promise<string | null> {
  try {
    const handle = await tasks.trigger<typeof meetingReminderTask>(
      "meeting-reminder",
      { meetingId, expectedNotificationRevision, reminderType },
      { delay: fireAt },
    );
    return handle.id;
  } catch (error) {
    console.error("Failed to schedule meeting reminder", error);
    return null;
  }
}

/**
 * Cancels any still-pending reminder runs for a meeting — called before
 * scheduling new ones on an update, and on deletion. Tolerates a run
 * that's already completed/been cancelled (Trigger.dev errors on a
 * second cancel) rather than letting that fail the caller's mutation.
 */
export async function cancelMeetingReminders(meeting: {
  reminder24hRunId: string | null;
  reminder1hRunId: string | null;
}): Promise<void> {
  const runIds = [meeting.reminder24hRunId, meeting.reminder1hRunId].filter(
    (id): id is string => id !== null,
  );

  await Promise.all(
    runIds.map((id) =>
      runs.cancel(id).catch((error) => {
        console.error("Failed to cancel meeting reminder run", id, error);
      }),
    ),
  );
}

function parseMeetingNotificationPayload(value: {
  meetingId: string;
  notificationType: MeetingNotificationType;
  meetingRevision: number;
  recipientMemberIds: Prisma.JsonValue;
  snapshot: Prisma.JsonValue;
}): MeetingNotificationPayload | null {
  if (value.notificationType === "REMINDER_24H" || value.notificationType === "REMINDER_1H") return null;
  if (!Array.isArray(value.recipientMemberIds) || !value.recipientMemberIds.every((id) => typeof id === "string")) {
    return null;
  }
  const snapshot = value.snapshot;
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return null;
  const record = snapshot as Record<string, Prisma.JsonValue>;
  if (
    typeof record.title !== "string" ||
    typeof record.scheduledAt !== "string" ||
    typeof record.organizerName !== "string"
  ) {
    return null;
  }

  return {
    meetingId: value.meetingId,
    notificationType: value.notificationType,
    meetingRevision: value.meetingRevision,
    recipientMemberIds: value.recipientMemberIds,
    snapshot: {
      title: record.title,
      description: typeof record.description === "string" ? record.description : null,
      scheduledAt: record.scheduledAt,
      endsAt: typeof record.endsAt === "string" ? record.endsAt : null,
      location: typeof record.location === "string" ? record.location : null,
      meetingUrl: typeof record.meetingUrl === "string" ? record.meetingUrl : null,
      organizerName: record.organizerName,
    },
  };
}

/** Claims and delivers one durable notification intent. Safe for duplicate worker runs. */
export async function processMeetingNotificationOutbox(outboxId: string): Promise<void> {
  const staleClaimBefore = new Date(Date.now() - 10 * 60 * 1000);
  const claim = await prisma.meetingNotificationOutbox.updateMany({
    where: {
      id: outboxId,
      attemptCount: { lt: MAX_OUTBOX_ATTEMPTS },
      OR: [
        { status: { in: ["PENDING", "FAILED"] } },
        { status: "PROCESSING", updatedAt: { lt: staleClaimBefore } },
      ],
    },
    data: { status: "PROCESSING", attemptCount: { increment: 1 }, lastError: null },
  });
  if (claim.count === 0) return;

  try {
    const outbox = await prisma.meetingNotificationOutbox.findUniqueOrThrow({ where: { id: outboxId } });
    const payload = parseMeetingNotificationPayload(outbox);
    if (!payload) throw new Error("Meeting notification outbox payload is invalid");

    let hasTransientFailure = false;
    for (const recipientMemberId of payload.recipientMemberIds) {
      const result = await sendOneMeetingEmail({
        meetingId: payload.meetingId,
        notificationType: payload.notificationType,
        meetingRevision: payload.meetingRevision,
        recipientMemberId,
        snapshot: payload.snapshot,
      });
      if (result === "transient-failure") hasTransientFailure = true;
    }
    if (hasTransientFailure) throw new Error("One or more meeting emails failed transiently");

    await prisma.meetingNotificationOutbox.update({
      where: { id: outboxId },
      data: { status: "COMPLETED", processedAt: new Date(), lastError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const current = await prisma.meetingNotificationOutbox.findUnique({
      where: { id: outboxId },
      select: { attemptCount: true },
    });
    const exhausted = (current?.attemptCount ?? MAX_OUTBOX_ATTEMPTS) >= MAX_OUTBOX_ATTEMPTS;
    await prisma.meetingNotificationOutbox.updateMany({
      where: { id: outboxId, status: "PROCESSING" },
      data: { status: exhausted ? "DEAD_LETTER" : "FAILED", lastError: message.slice(0, 500) },
    });
    throw error;
  }
}

/** IDs eligible for recovery by the periodic Trigger.dev outbox sweep. */
export async function pendingMeetingNotificationOutboxIds(): Promise<string[]> {
  const retryBefore = new Date(Date.now() - 5 * 60 * 1000);
  const records = await prisma.meetingNotificationOutbox.findMany({
    where: {
      attemptCount: { lt: MAX_OUTBOX_ATTEMPTS },
      OR: [
        { status: "PENDING", createdAt: { lt: retryBefore } },
        { status: "FAILED", updatedAt: { lt: retryBefore } },
        { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return records.map((record) => record.id);
}

/**
 * Claims a MeetingEmailDelivery row and sends one meeting email — shared
 * by both src/trigger/meeting-notification.ts and meeting-reminder.ts.
 * See 16-meeting-scheduling.md's Email behavior section:
 *
 * - a row already SENT is skipped (already done)
 * - a row stuck at SENDING is an ambiguous interrupted attempt — left
 *   alone for manual reconciliation rather than risking a duplicate send
 * - a FAILED row is retried (claimed back to SENDING)
 *
 * Returns whether the recipient is considered handled (already sent,
 * ambiguous-skip, or a fresh send that succeeded) vs. a real, actionable
 * failure the caller should treat as this task run failing.
 */
export type MeetingEmailAttemptResult = "handled" | "permanent-failure" | "transient-failure";

export async function sendOneMeetingEmail(params: {
  meetingId: string;
  notificationType: MeetingEmailKind;
  meetingRevision: number;
  recipientMemberId: string;
  snapshot: MeetingSnapshot;
}): Promise<MeetingEmailAttemptResult> {
  const { meetingId, notificationType, meetingRevision, recipientMemberId, snapshot } = params;

  const existing = await prisma.meetingEmailDelivery.findUnique({
    where: {
      meetingId_recipientMemberId_notificationType_meetingRevision: {
        meetingId,
        recipientMemberId,
        notificationType,
        meetingRevision,
      },
    },
  });

  if (existing?.status === "SENT" || existing?.status === "SENDING" || existing?.status === "SKIPPED") {
    return "handled";
  }

  const delivery = existing
    ? await prisma.meetingEmailDelivery.update({
        where: { id: existing.id },
        data: { status: "SENDING", attemptCount: { increment: 1 } },
      })
    : await prisma.meetingEmailDelivery.create({
        data: { meetingId, recipientMemberId, notificationType, meetingRevision, status: "SENDING", attemptCount: 1 },
      });

  const member = await prisma.member.findUnique({ where: { id: recipientMemberId }, select: { email: true } });
  const email = member?.email?.trim();
  if (!email || !isLikelyValidEmail(email)) {
    await prisma.meetingEmailDelivery.update({
      where: { id: delivery.id },
      data: { status: "SKIPPED", lastError: "Recipient has no valid email address on file" },
    });
    console.error("Skipping meeting email — missing/invalid address", {
      meetingId,
      recipientMemberId,
      notificationType,
    });
    return "permanent-failure";
  }

  const html = meetingEmailHtml(notificationType, {
    meetingId,
    title: snapshot.title,
    description: snapshot.description,
    scheduledAt: new Date(snapshot.scheduledAt),
    endsAt: snapshot.endsAt ? new Date(snapshot.endsAt) : null,
    organizerName: snapshot.organizerName,
    location: snapshot.location,
    meetingUrl: snapshot.meetingUrl,
  });
  const subject = meetingEmailSubject(notificationType, snapshot.title);
  const idempotencyKey = `${meetingId}:${recipientMemberId}:${notificationType}:${meetingRevision}`;

  const result = await sendEmail({ to: email, subject, html, idempotencyKey });

  if (result.ok) {
    await prisma.meetingEmailDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", providerMessageId: result.providerMessageId, sentAt: new Date() },
    });
    return "handled";
  }

  // Sanitized: the SDK's own error.message, never a full provider
  // response body or API key, per this spec's explicit instruction —
  // truncated defensively in case a provider ever returns something huge.
  await prisma.meetingEmailDelivery.update({
    where: { id: delivery.id },
    data: { status: "FAILED", lastError: result.error.slice(0, 500) },
  });
  console.error("Meeting email failed", { meetingId, recipientMemberId, notificationType, error: result.error });
  return "transient-failure";
}

function isLikelyValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
