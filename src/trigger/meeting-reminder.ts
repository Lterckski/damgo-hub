import { task } from "@trigger.dev/sdk";

import { prisma } from "@/lib/prisma";
import { sendOneMeetingEmail } from "@/lib/meeting-notifications";

// Scheduled 24h/1h-before reminder — see 16-meeting-scheduling.md's
// Reminders section. Triggered with a `delay` set to the exact fire time
// (lib/meeting-notifications.ts's scheduleMeetingReminders), so by
// definition this only actually runs at (or very near) that moment.
//
// Unlike meeting-notification.ts, this re-reads the Meeting row fresh
// instead of using a payload snapshot: any edit reschedules this exact run
// (cancels the old one, schedules a new one — see
// scheduleMeetingReminders's caller), so whichever run actually survives
// to fire time should reflect the meeting's current details already. A
// missing meeting here means it was deleted after this run was scheduled
// but the cancellation didn't land for some reason — a no-op, not an
// error, since there's nothing left to remind anyone about.
export interface MeetingReminderPayload {
  meetingId: string;
  reminderType: "REMINDER_24H" | "REMINDER_1H";
}

export const meetingReminderTask = task({
  id: "meeting-reminder",
  run: async (payload: MeetingReminderPayload) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: payload.meetingId },
      include: {
        organizer: { select: { displayName: true } },
        participants: { select: { memberId: true } },
      },
    });

    if (!meeting) return;

    const recipientMemberIds = meeting.participants.map((p) => p.memberId);
    if (recipientMemberIds.length === 0) return;

    let anyFailed = false;
    for (const recipientMemberId of recipientMemberIds) {
      const ok = await sendOneMeetingEmail({
        meetingId: meeting.id,
        notificationType: payload.reminderType,
        meetingRevision: meeting.notificationRevision,
        recipientMemberId,
        snapshot: {
          title: meeting.title,
          description: meeting.description,
          scheduledAt: meeting.scheduledAt.toISOString(),
          endsAt: meeting.endsAt ? meeting.endsAt.toISOString() : null,
          location: meeting.location,
          meetingUrl: meeting.meetingUrl,
          organizerName: meeting.organizer.displayName,
        },
      });
      if (!ok) anyFailed = true;
    }

    if (anyFailed) {
      throw new Error("One or more meeting reminder emails failed to send");
    }
  },
});
