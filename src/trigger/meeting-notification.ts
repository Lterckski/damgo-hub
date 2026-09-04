import { task } from "@trigger.dev/sdk";

import { sendOneMeetingEmail, type MeetingSnapshot } from "@/lib/meeting-notifications";
import type { MeetingNotificationType } from "@/app/generated/prisma/enums";

// Immediate meeting email — invitation, update, participant-removed, or
// full cancellation. See 16-meeting-scheduling.md's Email Notifications
// section. `snapshot` is captured at enqueue time (lib/meeting-notifications
// .ts's enqueueMeetingNotification), not re-read from the Meeting row here,
// because a MEETING_CANCELLED notification's meeting has already been
// deleted by the time this task actually runs.
export interface MeetingNotificationPayload {
  meetingId: string;
  notificationType: Exclude<MeetingNotificationType, "REMINDER_24H" | "REMINDER_1H">;
  meetingRevision: number;
  recipientMemberIds: string[];
  snapshot: MeetingSnapshot;
}

export const meetingNotificationTask = task({
  id: "meeting-notification",
  run: async (payload: MeetingNotificationPayload) => {
    let anyFailed = false;

    for (const recipientMemberId of payload.recipientMemberIds) {
      const ok = await sendOneMeetingEmail({
        meetingId: payload.meetingId,
        notificationType: payload.notificationType,
        meetingRevision: payload.meetingRevision,
        recipientMemberId,
        snapshot: payload.snapshot,
      });
      if (!ok) anyFailed = true;
    }

    // Throwing (rather than swallowing) is what lets Trigger.dev's own
    // configured retries (trigger.config.ts) actually re-run this task —
    // a retry safely skips every recipient already marked SENT via the
    // claim check in sendOneMeetingEmail.
    if (anyFailed) {
      throw new Error("One or more meeting notification emails failed to send");
    }
  },
});
