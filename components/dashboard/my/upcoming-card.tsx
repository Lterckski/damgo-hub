"use client";

import { CalendarClock, ExternalLink, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { relativeDateTimeLabel, relativeDayLabel } from "@/lib/dashboard/relative-time";
import type { TimelineItem } from "@/lib/dashboard/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";
import { useDashboardCapture } from "@/components/dashboard/my/dashboard-capture";

/**
 * Upcoming — one unified timeline for the next 7 days: meetings, task
 * deadlines, calendar events, hackathon dates and dues deadlines.
 *
 * Rows are grouped under a day heading rather than repeating the date on
 * every line, so the shape of the week is visible at a glance. Items that
 * are the reader's own are marked; the rest are context, which is the
 * distinction the old shared `getUpcomingItems()` couldn't make.
 */

const KIND_LABEL: Record<TimelineItem["kind"], string> = {
  MEETING: "Meeting",
  TASK_DUE: "Task",
  EVENT: "Event",
  HACKATHON: "Hackathon",
  DUES: "Dues",
};

export function UpcomingCard({ items }: { items: TimelineItem[] }) {
  const { openCapture } = useDashboardCapture();
  // Group by team-local day, preserving chronological order.
  const groups: { day: string; rows: TimelineItem[] }[] = [];
  for (const item of items) {
    const day = relativeDayLabel(item.at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.rows.push(item);
    else groups.push({ day, rows: [item] });
  }

  return (
    <PanelCard
      title="Upcoming"
      icon={CalendarClock}
      emphasis="primary"
      headerAside={<span className="text-xs text-copy-muted">Next 7 days</span>}
      footerHref="/calendar"
      footerLabel="View calendar"
    >
      {items.length === 0 ? (
        <CardEmptyState
          message="Nothing scheduled in the next 7 days — no meetings, deadlines or dues."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => openCapture("task")}
            >
              <Plus className="h-4 w-4" />
              Create task
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.day}>
              <h4 className="mb-1.5 text-[10px] font-bold tracking-[0.08em] text-copy-secondary uppercase">
                {group.day}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {group.rows.map((item) => (
                  <li key={item.id} className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        item.isMine ? "bg-brand" : "bg-copy-faint",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-copy-primary">{item.title}</p>
                      <p className="truncate text-xs text-copy-muted">
                        {[relativeDateTimeLabel(item.at).split(", ")[1], item.detail]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex">
                      {KIND_LABEL[item.kind]}
                    </Badge>
                    {item.kind === "MEETING" && item.joinUrl && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => window.open(item.joinUrl!, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Join
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}
