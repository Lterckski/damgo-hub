import { Gauge } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkloadRow } from "@/lib/dashboard/team";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";

/**
 * Workload — one row per member: open tasks, overdue, completion rate.
 *
 * Completion rate is `completed / due this month`, measured with
 * `Task.completedAt`. A null rate renders as "—", not "0%": nothing due
 * this month means nothing to measure, and 0% would read as a failure.
 * Only the overdue column carries colour.
 */
export function WorkloadCard({ rows }: { rows: WorkloadRow[] }) {
  return (
    <PanelCard title="Workload" icon={Gauge} emphasis="primary" footerHref="/tasks">
      {rows.length === 0 ? (
        <CardEmptyState message="No members on the roster yet." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-bold tracking-wide text-copy-secondary uppercase">
              <th className="pb-1.5 text-left font-bold">Member</th>
              <th className="pb-1.5 text-right font-bold">Open</th>
              <th className="pb-1.5 text-right font-bold">Overdue</th>
              <th className="pb-1.5 text-right font-bold">Done</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.memberId} className="border-t border-surface-border-subtle">
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
                      <AvatarFallback className="text-[10px]">
                        {row.displayName
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase())
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-copy-primary">{row.displayName}</span>
                  </div>
                </td>
                <td className="py-1.5 text-right text-copy-primary tabular-nums">
                  {row.openTaskCount}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right tabular-nums",
                    row.overdueCount > 0 ? "font-semibold text-state-error" : "text-copy-muted",
                  )}
                >
                  {row.overdueCount === 0 ? "—" : row.overdueCount}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {row.completionRate === null ? (
                    <span className="text-copy-muted" title="Nothing was due this month">
                      —
                    </span>
                  ) : (
                    <span className="text-copy-primary">
                      {row.completionRate}%
                      <span className="ml-1 text-[10px] text-copy-muted">
                        {row.completedThisMonth}/{row.dueThisMonth}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-[10px] text-copy-faint">
        Completion rate covers tasks due this calendar month.
      </p>
    </PanelCard>
  );
}
