import { schedules, task, tasks } from "@trigger.dev/sdk";

import {
  pendingMeetingNotificationOutboxIds,
  processMeetingNotificationOutbox,
} from "@/lib/meeting-notifications";

// Immediate meeting email — invitation, update, participant-removed, or
// full cancellation. See 16-meeting-scheduling.md's Email Notifications
// section. The task receives only a durable outbox ID; the outbox retains
// the immutable snapshot because a cancelled meeting row no longer exists
// by the time this task runs.
export interface MeetingNotificationPayload {
  outboxId: string;
}

export const meetingNotificationTask = task({
  id: "meeting-notification",
  run: async (payload: MeetingNotificationPayload) => {
    await processMeetingNotificationOutbox(payload.outboxId);
  },
});

// Recovery path for an API-to-Trigger outage. The meeting mutation commits
// its outbox row first; this sweep finds any intent whose fast-path enqueue
// never arrived and dispatches it after Trigger.dev recovers.
export const meetingNotificationOutboxSweepTask = schedules.task({
  id: "meeting-notification-outbox-sweep",
  cron: "*/5 * * * *",
  run: async () => {
    const outboxIds = await pendingMeetingNotificationOutboxIds();
    if (outboxIds.length === 0) return;
    await tasks.batchTrigger<typeof meetingNotificationTask>(
      "meeting-notification",
      outboxIds.map((outboxId) => ({ payload: { outboxId } })),
    );
  },
});
