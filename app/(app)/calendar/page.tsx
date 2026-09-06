import { taskInclude } from "@/lib/hub/task-include";
import { entityVisibilityWhere } from "@/lib/hub/context";
import { taskVisibilityWhere } from "@/lib/hub/context";
import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { getMemberPickerOptions } from "@/lib/members";
import {
  serializeCalendarEvent,
  type UnifiedCalendarItem,
} from "@/lib/calendar";
import { serializeTask } from "@/lib/tasks";
import { TASK_LINKABLE_PROJECT_STATUSES } from "@/lib/projects";
import { getVisibleMeetingCalendarItems } from "@/lib/meetings";
import { BackButton } from "@/components/shared/back-button";
import { CalendarView } from "@/components/calendar/calendar-view";

export default async function CalendarPage() {
  await requireWorkspaceSession();

  const currentMember = await getCurrentMember();
  const isAdmin = await isCurrentMemberAdmin();

  const [
    eventRecords,
    taskRecords,
    memberRecords,
    linkableProjects,
    docs,
    meetingItems,
  ] = await Promise.all([
    prisma.calendarEvent.findMany({
      include: { createdBy: { select: { displayName: true } } },
      orderBy: { startAt: "asc" },
    }),
    prisma.task.findMany({
      where: await taskVisibilityWhere(),
      include: await taskInclude(),
      orderBy: { createdAt: "desc" },
    }),
    getMemberPickerOptions(),
    prisma.project.findMany({
      where: {
        ...{ status: { in: [...TASK_LINKABLE_PROJECT_STATUSES] } },
        AND: [await entityVisibilityWhere("project")],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.doc.findMany({
      where: await entityVisibilityWhere("document"),
      select: { id: true, title: true, projectId: true },
      orderBy: { title: "asc" },
    }),
    getVisibleMeetingCalendarItems(currentMember.id, isAdmin),
  ]);

  const events = eventRecords.map(serializeCalendarEvent);
  const tasks = taskRecords.map(serializeTask);
  const members = memberRecords.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
  }));

  const items: UnifiedCalendarItem[] = [
    ...events.map((event) => ({
      id: event.id,
      title: event.title,
      type: "event" as const,
      startAt: event.startAt,
      endAt: event.endAt,
      creatorId: event.createdById,
    })),
    // A task spans its full startDate -> dueDate range, not just its due
    // day — see lib/calendar.ts's UnifiedCalendarItem.
    ...tasks.map((task) => ({
      id: task.id,
      title: task.title,
      type: "task" as const,
      startAt: task.startDate,
      endAt: task.dueDate,
      creatorId: null,
    })),
    ...meetingItems,
  ];

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Calendar</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        Team events and task deadlines — synced to your Google Calendar once
        it&apos;s connected.
      </p>

      <div className="mt-6">
        <CalendarView
          items={items}
          events={events}
          tasks={tasks}
          members={members}
          projects={linkableProjects}
          docs={docs}
          currentMemberId={currentMember.id}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}
