import { format } from "date-fns";
import { CheckSquare, CalendarClock, Wallet, Lightbulb } from "lucide-react";

import { DashboardWidget, WidgetEmptyState } from "@/components/dashboard/dashboard-widget";
import { TaskStatusBadge, type TaskStatusValue } from "@/components/tasks/task-status-badge";
import { formatPHP } from "@/lib/currency";
import { getFinancialSnapshot } from "@/lib/finance";
import { getRecentIdeas, getUpcomingItems } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";

interface MyDashboardPanelProps {
  memberId: string;
}

/**
 * The member-scoped dashboard grid — My Tasks, Upcoming, Financial
 * Snapshot, Recent Ideas. All four now read real data per
 * 22-dashboard-data-wiring.md (previously mock — see
 * lib/mock-dashboard-data.ts, now unused); Recent Ideas is the last one
 * wired, reading from the ideas board's autosaved snapshot rather than its
 * live Liveblocks state (see lib/dashboard.ts's getRecentIdeas). Stays a
 * Server Component doing its own fetching — this is one of two panels
 * dashboard/page.tsx wraps in its own Suspense boundary, so a slow query
 * here streams in independently of Team Overview rather than blocking it.
 */
export async function MyDashboardPanel({ memberId }: MyDashboardPanelProps) {
  const [myTasks, upcoming, finance, recentIdeas] = await Promise.all([
    prisma.task.findMany({
      where: { assignees: { some: { memberId } } },
      select: { id: true, title: true, status: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    getUpcomingItems(),
    getFinancialSnapshot(),
    getRecentIdeas(),
  ]);

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
        {recentIdeas.length === 0 ? (
          <WidgetEmptyState icon={Lightbulb} message="No ideas posted yet." />
        ) : (
          <ul className="space-y-3">
            {recentIdeas.map((idea) => (
              <li key={idea.id} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(--idea-color-${idea.colorIndex}-fill)` }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-copy-primary">{idea.text}</p>
                  <p className="text-xs text-copy-secondary">{idea.authorName}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashboardWidget>
    </div>
  );
}
