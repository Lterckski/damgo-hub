import { runs, tasks } from "@trigger.dev/sdk";

import { sendEmail } from "@/lib/email";
import { meetingEmailHtml, meetingEmailSubject, type MeetingEmailKind } from "@/lib/meeting-email-template";
import { prisma } from "@/lib/prisma";
import type { meetingNotificationTask, MeetingNotificationPayload } from "@/src/trigger/meeting-notification";
import type { meetingReminderTask } from "@/src/trigger/meeting-reminder";

const REMINDER_24H_MS = 24 * 60 * 60 * 1000;
const REMINDER_1H_MS = 60 * 60 * 1000;

export interface MeetingSnapshot {
  title: string;
  description: string | null;
  scheduledAt: string;
  endsAt: string | null;
  location: string | null;
  meetingUrl: string | null;
  organizerName: string;
}

/**
 * Enqueues one immediate meeting-notification run (invitation / update /
 * participant-removed / cancellation) — see 16-meeting-scheduling.md's
 * Email Notifications section. Never awaited by the caller in a way that
 * blocks its response, and a failure to enqueue never fails the meeting
 * mutation itself — same convention as lib/sync-calendar.ts's
 * enqueueGoogleCalendarSync.
 */
export async function enqueueMeetingNotification(
  notificationType: MeetingNotificationPayload["notificationType"],
  meetingId: string,
  meetingRevision: number,
  recipientMemberIds: string[],
  snapshot: MeetingSnapshot,
): Promise<void> {
  const uniqueRecipients = [...new Set(recipientMemberIds)];
  if (uniqueRecipients.length === 0) return;

  try {
    await tasks.trigger<typeof meetingNotificationTask>("meeting-notification", {
      meetingId,
      notificationType,
      meetingRevision,
      recipientMemberIds: uniqueRecipients,
      snapshot,
    });
  } catch (error) {
    console.error("Failed to enqueue meeting notification", error);
  }
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
}): Promise<{ reminder24hRunId: string | null; reminder1hRunId: string | null }> {
  const now = Date.now();
  const reminder24hAt = new Date(meeting.scheduledAt.getTime() - REMINDER_24H_MS);
  const reminder1hAt = new Date(meeting.scheduledAt.getTime() - REMINDER_1H_MS);

  const [reminder24hRunId, reminder1hRunId] = await Promise.all([
    reminder24hAt.getTime() > now ? triggerReminder(meeting.id, "REMINDER_24H", reminder24hAt) : null,
    reminder1hAt.getTime() > now ? triggerReminder(meeting.id, "REMINDER_1H", reminder1hAt) : null,
  ]);

  return { reminder24hRunId, reminder1hRunId };
}

async function triggerReminder(
  meetingId: string,
  reminderType: "REMINDER_24H" | "REMINDER_1H",
  fireAt: Date,
): Promise<string | null> {
  try {
    const handle = await tasks.trigger<typeof meetingReminderTask>(
      "meeting-reminder",
      { meetingId, reminderType },
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
export async function sendOneMeetingEmail(params: {
  meetingId: string;
  notificationType: MeetingEmailKind;
  meetingRevision: number;
  recipientMemberId: string;
  snapshot: MeetingSnapshot;
}): Promise<boolean> {
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

  if (existing?.status === "SENT" || existing?.status === "SENDING") return true;

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
      data: { status: "FAILED", lastError: "Recipient has no valid email address on file" },
    });
    console.error("Skipping meeting email — missing/invalid address", {
      meetingId,
      recipientMemberId,
      notificationType,
    });
    return false;
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
    return true;
  }

  // Sanitized: the SDK's own error.message, never a full provider
  // response body or API key, per this spec's explicit instruction —
  // truncated defensively in case a provider ever returns something huge.
  await prisma.meetingEmailDelivery.update({
    where: { id: delivery.id },
    data: { status: "FAILED", lastError: result.error.slice(0, 500) },
  });
  console.error("Meeting email failed", { meetingId, recipientMemberId, notificationType, error: result.error });
  return false;
}

function isLikelyValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
