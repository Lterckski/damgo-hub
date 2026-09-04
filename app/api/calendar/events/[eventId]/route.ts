import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { cancelCalendarReminder, scheduleCalendarReminder } from "@/lib/calendar-reminders";
import { enqueueGoogleCalendarSync } from "@/lib/sync-calendar";
import { serializeCalendarEvent } from "@/lib/calendar";

// PATCH /api/calendar/events/[eventId] — creator or Admin only.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [member, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);
  const { eventId } = await params;

  const existing = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!existing) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (existing.createdById !== member.id && !isAdmin) {
    return NextResponse.json(
      { error: "Only the creator or an Admin can edit this event" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { title, description, startAt, endAt } = body;

  const event = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      ...(typeof title === "string" && title.trim() !== "" ? { title: title.trim() } : {}),
      ...(description !== undefined
        ? { description: typeof description === "string" && description.trim() !== "" ? description.trim() : null }
        : {}),
      ...(typeof startAt === "string" ? { startAt: new Date(startAt) } : {}),
      ...(endAt !== undefined
        ? { endAt: typeof endAt === "string" && endAt !== "" ? new Date(endAt) : null }
        : {}),
      // Cleared immediately, before the cancel/reschedule awaits below. If
      // the old run fires in that window (cancellation hasn't taken effect
      // yet), calendar-reminder.ts's `reminderRunId !== ctx.run.id` check
      // now fails against `null` right away instead of still matching the
      // stale id — closes the race a stale in-flight run could otherwise
      // slip through.
      reminderRunId: null,
    },
    include: { createdBy: { select: { displayName: true } } },
  });

  await enqueueGoogleCalendarSync("CALENDAR_EVENT", event.id);

  // Reschedule on every edit, same as 16-meeting-scheduling.md's meeting
  // reminders — not conditioned on startAt specifically having changed.
  await cancelCalendarReminder(existing.reminderRunId);
  const reminderRunId = await scheduleCalendarReminder(event);
  if (reminderRunId) {
    try {
      await prisma.calendarEvent.update({ where: { id: eventId }, data: { reminderRunId } });
    } catch (error) {
      // Persisting the new id failed after the run was already created —
      // cancel it rather than leave an orphaned scheduled run that will
      // fire later and silently no-op (its id will never match what's in
      // the database).
      console.error("Failed to persist reminderRunId, cancelling orphaned reminder run", error);
      await cancelCalendarReminder(reminderRunId);
    }
  }

  return NextResponse.json({ event: serializeCalendarEvent(event) });
}

// DELETE /api/calendar/events/[eventId] — creator or Admin only.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [member, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);
  const { eventId } = await params;

  const existing = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!existing) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (existing.createdById !== member.id && !isAdmin) {
    return NextResponse.json(
      { error: "Only the creator or an Admin can delete this event" },
      { status: 403 },
    );
  }

  await prisma.calendarEvent.delete({ where: { id: eventId } });
  await enqueueGoogleCalendarSync("CALENDAR_EVENT", eventId);
  await cancelCalendarReminder(existing.reminderRunId);

  return NextResponse.json({ ok: true });
}
