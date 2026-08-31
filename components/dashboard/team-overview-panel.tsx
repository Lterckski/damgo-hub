import { format } from "date-fns";
import { Users, ListChecks, CalendarClock, ShieldQuestion } from "lucide-react";

import { DashboardWidget, WidgetEmptyState } from "@/components/dashboard/dashboard-widget";
import { TaskStatusBadge, type TaskStatusValue } from "@/components/tasks/task-status-badge";
import { getMemberPickerOptions } from "@/lib/members";
import { getRoleCoverage, getUpcomingItems } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL: Record<TaskStatusValue, string> = {
  TODO: "Not Started",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

/**
 * The team-wide dashboard grid — Tasks by Member, Team Task Summary, Team
 * Upcoming, Role Coverage. Real data as of 22-dashboard-data-wiring.md
 * (previously mock — see lib/mock-dashboard-data.ts, now unused). Streams
 * in independently of My Dashboard via dashboard/page.tsx's Suspense
 * boundary.
 */
export async function TeamOverviewPanel() {
  const [members, allTasks, upcoming, roleCoverage] = await Promise.all([
    getMemberPickerOptions(),
    prisma.task.findMany({
      select: { id: true, title: true, status: true, assignees: { select: { memberId: true } } },
    }),
    getUpcomingItems(),
    getRoleCoverage(),
  ]);

  const tasksByMember = members.map((m) => ({
    member: m,
    tasks: allTasks.filter((t) => t.assignees.some((a) => a.memberId === m.id)),
  }));

  const summary = (["TODO", "IN_PROGRESS", "DONE"] as const).map((status) => ({
    status,
    label: STATUS_LABEL[status],
    count: allTasks.filter((t) => t.status === status).length,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <DashboardWidget title="Tasks by Member" icon={Users} viewAllHref="/tasks">
        {tasksByMember.length === 0 ? (
          <WidgetEmptyState icon={Users} message="No members yet." />
        ) : (
          <ul className="space-y-4">
            {tasksByMember.map(({ member, tasks }) => (
              <li key={member.id}>
                <p className="text-sm font-bold text-copy-primary">{member.displayName}</p>
                {tasks.length === 0 ? (
                  <p className="mt-1 text-xs text-copy-secondary">No tasks assigned</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {tasks.map((task) => (
                      <li key={task.id} className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-copy-secondary">{task.title}</span>
                        <TaskStatusBadge status={task.status as TaskStatusValue} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </DashboardWidget>

      <DashboardWidget title="Team Task Summary" icon={ListChecks} viewAllHref="/tasks">
        {summary.every((s) => s.count === 0) ? (
          <WidgetEmptyState icon={ListChecks} message="No tasks logged yet." />
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            {summary.map((s) => (
              <div key={s.status}>
                <p className="text-xs font-medium text-copy-secondary">{s.label}</p>
                <p className="mt-1 text-2xl font-bold text-copy-primary">{s.count}</p>
              </div>
            ))}
          </div>
        )}
      </DashboardWidget>

      <DashboardWidget title="Team Upcoming" icon={CalendarClock} viewAllHref="/calendar" viewAllLabel="View calendar">
        {upcoming.length === 0 ? (
          <WidgetEmptyState icon={CalendarClock} message="Nothing on the team calendar yet." />
        ) : (
          <ul className="space-y-3">
            {upcoming.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-copy-primary">{event.title}</p>
                <p className="text-xs text-copy-secondary">
                  {format(new Date(event.startsAt), "MMM d, h:mm a")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DashboardWidget>

      <DashboardWidget title="Role Coverage" icon={ShieldQuestion} viewAllHref="/members" viewAllLabel="View members">
        {roleCoverage.length === 0 ? (
          <WidgetEmptyState icon={ShieldQuestion} message="No roles defined yet." />
        ) : (
          <ul className="space-y-2">
            {roleCoverage.map((entry) => (
              <li key={entry.role} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-copy-primary">{entry.label}</span>
                <span
                  className={
                    entry.members.length === 0
                      ? "text-xs font-semibold text-warning"
                      : "text-xs text-copy-secondary"
                  }
                >
                  {entry.members.length === 0 ? "Unstaffed" : entry.members.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardWidget>
    </div>
  );
}
