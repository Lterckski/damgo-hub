/** Shared serialization for Calendar API responses — see 10-calendar.md. */
export interface SerializedCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

export function serializeCalendarEvent(event: {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  createdById: string;
  createdBy: { displayName: string };
  createdAt: Date;
}): SerializedCalendarEvent {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt ? event.endAt.toISOString() : null,
    createdById: event.createdById,
    createdByName: event.createdBy.displayName,
    createdAt: event.createdAt.toISOString(),
  };
}

/**
 * The unified shape `GET /api/calendar/events` returns — `CalendarEvent`
 * rows merged with task start/due dates and meeting schedules (as of
 * 16-meeting-scheduling.md). `creatorId` is only meaningful for "event"
 * items (who can edit/delete it); tasks are managed on `/tasks`, meetings
 * on `/meetings/[id]` — not here.
 *
 * `endAt` makes a multi-day span explicit — a task's `startDate` through
 * `dueDate`, a meeting's `scheduledAt` through `endsAt`, or an event's own
 * `endAt` — so the calendar grid can render it as one continuous bar
 * across every day it covers (Google Calendar-style), not just a chip on
 * its start day. `null`/equal-to-`startAt` means a single-point item.
 */
export interface UnifiedCalendarItem {
  id: string;
  title: string;
  type: "event" | "task" | "meeting";
  startAt: string;
  endAt: string | null;
  creatorId: string | null;
}
