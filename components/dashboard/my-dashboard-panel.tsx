import { format } from "date-fns";
import { CheckSquare, CalendarClock, Wallet, Lightbulb } from "lucide-react";

import { DashboardWidget, WidgetEmptyState } from "@/components/dashboard/dashboard-widget";
import { TaskStatusBadge, type TaskStatusValue } from "@/components/tasks/task-status-badge";
import { formatPHP } from "@/lib/currency";
import { getFinancialSnapshot } from "@/lib/finance";
import { getUpcomingItems } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";

interface MyDashboardPanelProps {
  memberId: string;
}

/**
 * The member-scoped dashboard grid — My Tasks, Upcoming, Financial
 * Snapshot, Recent Ideas. Real data as of 22-dashboard-data-wiring.md
 * (previously mock — see lib/mock-dashboard-data.ts, now unused). Stays a
 * Server Component doing its own fetching — this is one of two panels
 * dashboard/page.tsx wraps in its own Suspense boundary, so a slow query
 * here streams in independently of Team Overview rather than blocking it.
 */
export async function MyDashboardPanel({ memberId }: MyDashboardPanelProps) {
  const [myTasks, upcoming, finance] = await Promise.all([
    prisma.task.findMany({
      where: { assignees: { some: { memberId } } },
      select: { id: true, title: true, status: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    getUpcomingItems(),
    getFinancialSnapshot(),
  ]);

  // Ideas board doesn't exist yet (19-ideas-board.md) — no mock data
  // pretending otherwise; this widget says so plainly instead, same as
  // /ideas itself (components/shared/coming-soon.tsx).
  const ideasAvailable = false;

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
                  <p className="text-xs text-copy-secondary">Due {format(task.dueDate, "MMM d")}</p>
                </div>
                <TaskStatusBadge status={task.status as TaskStatusValue} />
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
        {ideasAvailable ? null : (
          <WidgetEmptyState icon={Lightbulb} message="Ideas board isn't available yet." />
        )}
      </DashboardWidget>
    </div>
  );
}
