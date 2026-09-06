import { task } from "@trigger.dev/sdk";

import { logDeferredNotification } from "@/lib/admin-notifications";
import { prisma } from "@/lib/prisma";

// Scheduled reminder ahead of a CalendarEvent's startAt — see
// 21-scheduled-reminders.md step 3. Notifies the event's creator (and,
// once this app supports invitees, those too — it doesn't yet, see
// 10-calendar.md). Delivery is deferred (logged, not emailed), per this
// spec's explicit scope note for every non-meeting reminder task; the
// scheduling/cancellation contract is fully real, only the send step is a
// stand-in.
export interface CalendarReminderPayload {
  eventId: string;
}

export const calendarReminderTask = task({
  id: "calendar-reminder",
  run: async (payload: CalendarReminderPayload, { ctx }) => {
    const event = await prisma.calendarEvent.findUnique({
      where: { id: payload.eventId },
      include: { createdBy: { select: { email: true, displayName: true } } },
    });

    // Deleted since this run was scheduled, or rescheduled and this is
    // the now-superseded run — either way, cancellation didn't land for
    // some reason, and there's nothing (or nothing current) to remind
    // anyone about.
    if (!event || event.reminderRunId !== ctx.run.id) return;

    await logDeferredNotification(`Upcoming event: ${event.title}`, [event.createdBy.email], {
      eventId: event.id,
      startAt: event.startAt.toISOString(),
    });
  },
});
