import { tasks } from "@trigger.dev/sdk";

import type { syncCalendarItemTask } from "@/src/trigger/sync-calendar-item";
import type { SyncedEventSourceType } from "@/app/generated/prisma/enums";

/**
 * Enqueues the Google Calendar sync background job for a Task or
 * CalendarEvent — call this after any create/update/delete that changes
 * what should appear on Google Calendar (see 10-calendar.md and
 * 08-task-assignment.md). Never awaited by the caller in a way that blocks
 * the response, and a failure to enqueue (e.g. the Trigger.dev dev worker
 * isn't running locally) never fails the request itself — this is a
 * background enhancement, not a correctness requirement of the mutation.
 */
export async function enqueueGoogleCalendarSync(
  sourceType: SyncedEventSourceType,
  sourceId: string,
): Promise<void> {
  try {
    await tasks.trigger<typeof syncCalendarItemTask>("sync-calendar-item-to-google", {
      sourceType,
      sourceId,
    });
  } catch (error) {
    console.error("Failed to enqueue Google Calendar sync", error);
  }
}
