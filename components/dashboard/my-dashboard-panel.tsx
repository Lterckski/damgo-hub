import { format } from "date-fns";
import { CheckSquare, CalendarClock, Wallet, Lightbulb } from "lucide-react";

import { DashboardWidget, WidgetEmptyState } from "@/components/dashboard/dashboard-widget";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { formatPHP } from "@/lib/currency";
import {
  getMockFinancialSnapshot,
  getMockMyTasks,
  getMockRecentIdeas,
  getMockUpcoming,
} from "@/lib/mock-dashboard-data";

interface MyDashboardPanelProps {
  memberName: string;
}

/**
 * The member-scoped dashboard grid — My Tasks, Upcoming, Financial
 * Snapshot, Recent Ideas. Mock data only, per 06-dashboard-home.md; stays
 * a Server Component since nothing here is interactive.
 */
export function MyDashboardPanel({ memberName }: MyDashboardPanelProps) {
  const myTasks = getMockMyTasks(memberName);
  const upcoming = getMockUpcoming();
  const finance = getMockFinancialSnapshot();
  const ideas = getMockRecentIdeas();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <DashboardWidget title="My Tasks" icon={CheckSquare} viewAllHref="/tasks">
        {myTasks.length === 0 ? (
          <WidgetEmptyState icon={CheckSquare} message="No tasks assigned to you yet." />
        ) : (
          <ul className="space-y-3">
            {myTasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-copy-primary">{task.title}</p>
                  {task.dueDate && (
                    <p className="text-xs text-copy-secondary">
                      Due {format(new Date(task.dueDate), "MMM d")}
                    </p>
                  )}
                </div>
                <TaskStatusBadge status={task.status} />
              </li>
            ))}
          </ul>
        )}
      </DashboardWidget>

      <DashboardWidget title="Upcoming" icon={CalendarClock} viewAllHref="/calendar" viewAllLabel="View calendar">
        {upcoming.length === 0 ? (
          <WidgetEmptyState icon={CalendarClock} message="Nothing on the calendar yet." />
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

      <DashboardWidget title="Financial Snapshot" icon={Wallet} viewAllHref="/finance" viewAllLabel="View finance">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs font-medium text-copy-secondary">Balance</p>
            <p className="mt-1 text-sm font-bold text-copy-primary">
              {formatPHP(finance.balanceCentavos)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-copy-secondary">Income</p>
            <p className="mt-1 text-sm font-bold text-success">
              {formatPHP(finance.monthIncomeCentavos)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-copy-secondary">Expenses</p>
            <p className="mt-1 text-sm font-bold text-error">
              {formatPHP(finance.monthExpenseCentavos)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-copy-secondary">
          This month, approved transactions only
        </p>
      </DashboardWidget>

      <DashboardWidget title="Recent Ideas" icon={Lightbulb} viewAllHref="/ideas" viewAllLabel="Open ideas board">
        {ideas.length === 0 ? (
          <WidgetEmptyState icon={Lightbulb} message="No ideas posted yet." />
        ) : (
          <ul className="space-y-3">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <p className="text-sm font-medium text-copy-primary">{idea.title}</p>
                <p className="text-xs text-copy-secondary">
                  {idea.authorName} · {format(new Date(idea.createdAt), "MMM d")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DashboardWidget>
    </div>
  );
}
