import { format } from "date-fns";
import { Users, ListChecks, CalendarClock, ShieldQuestion } from "lucide-react";

import { DashboardWidget, WidgetEmptyState } from "@/components/dashboard/dashboard-widget";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import {
  getMockRoleCoverage,
  getMockTasksByMember,
  getMockTeamTaskSummary,
  getMockTeamUpcoming,
} from "@/lib/mock-dashboard-data";

/**
 * The team-wide dashboard grid — Tasks by Member, Team Task Summary, Team
 * Upcoming, Role Coverage. Mock data only, per 06-dashboard-home.md; the
 * point is surfacing who's doing what and where the gaps are, at a glance.
 */
export function TeamOverviewPanel() {
  const tasksByMember = getMockTasksByMember();
  const summary = getMockTeamTaskSummary();
  const upcoming = getMockTeamUpcoming();
  const roleCoverage = getMockRoleCoverage();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <DashboardWidget title="Tasks by Member" icon={Users} viewAllHref="/tasks">
        {tasksByMember.length === 0 ? (
          <WidgetEmptyState icon={Users} message="No members yet." />
        ) : (
          <ul className="space-y-4">
            {tasksByMember.map(({ member, tasks }) => (
              <li key={member}>
                <p className="text-sm font-bold text-copy-primary">{member}</p>
                {tasks.length === 0 ? (
                  <p className="mt-1 text-xs text-copy-secondary">No tasks assigned</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {tasks.map((task) => (
                      <li key={task.id} className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-copy-secondary">{task.title}</span>
                        <TaskStatusBadge status={task.status} />
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
                <span className="text-sm font-medium text-copy-primary">{entry.role}</span>
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
