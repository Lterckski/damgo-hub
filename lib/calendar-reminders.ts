import { runs, tasks } from "@trigger.dev/sdk";

import type { calendarReminderTask } from "@/src/trigger/calendar-reminder";

const REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;

/**
 * Schedules the single reminder ahead of a CalendarEvent's startAt — see
 * 21-scheduled-reminders.md step 3. Skips (returns null for) an occurrence
 * whose fire time has already passed, same "don't send it late" rule
 * 16-meeting-scheduling.md's reminders already follow. Returns the run ID
 * to store on the event so a later edit/delete can cancel it.
 */
export async function scheduleCalendarReminder(event: { id: string; startAt: Date }): Promise<string | null> {
  const fireAt = new Date(event.startAt.getTime() - REMINDER_BEFORE_MS);
  if (fireAt.getTime() <= Date.now()) return null;

  try {
    const handle = await tasks.trigger<typeof calendarReminderTask>(
      "calendar-reminder",
      { eventId: event.id },
      { delay: fireAt },
    );
    return handle.id;
  } catch (error) {
    console.error("Failed to schedule calendar reminder", error);
    return null;
  }
}

/** Cancels a still-pending reminder run — called before rescheduling, and on delete. Tolerates an already-settled run. */
export async function cancelCalendarReminder(reminderRunId: string | null): Promise<void> {
  if (!reminderRunId) return;
  try {
    await runs.cancel(reminderRunId);
  } catch (error) {
    console.error("Failed to cancel calendar reminder run", reminderRunId, error);
  }
}
