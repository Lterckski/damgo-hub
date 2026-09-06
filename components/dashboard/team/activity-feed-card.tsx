"use client";

import * as React from "react";
import { Activity } from "lucide-react";

import { cn } from "@/lib/utils";
import { agoLabel } from "@/lib/dashboard/relative-time";
import type { ActivityRow } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";

/**
 * Row 8 — the global feed, filterable by type.
 *
 * Filtering is client-side here on purpose, unlike My Dashboard's scoping:
 * this feed is already team-wide and visible to everyone, so narrowing it
 * reveals nothing that wasn't sent. Personal scoping is the case that must
 * happen server-side, and it does.
 */

const FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "tasks", label: "Tasks", match: (type: string) => type.startsWith("TASK_") },
  { id: "money", label: "Money", match: (type: string) => type.startsWith("TRANSACTION_") || type.startsWith("PENALTY_") || type === "DUES_ASSESSED" },
  { id: "projects", label: "Projects", match: (type: string) => type.startsWith("PROJECT_") },
  { id: "meetings", label: "Meetings", match: (type: string) => type.startsWith("MEETING_") || type.startsWith("AGENDA_") },
] as const;

export function ActivityFeedCard({ events }: { events: ActivityRow[] }) {
  const [filterId, setFilterId] = React.useState<string>("all");

  const activeFilter = FILTERS.find((filter) => filter.id === filterId) ?? FILTERS[0];
  const visible = events.filter((event) => activeFilter.match(event.type));

  return (
    <PanelCard
      title="Activity"
      icon={Activity}
      emphasis="secondary"
      headerAside={
        <div className="flex flex-wrap justify-end gap-1">
          {FILTERS.map((filter) => (
            <Button
              key={filter.id}
              size="sm"
              variant={filterId === filter.id ? "default" : "ghost"}
              className="h-6 px-2 text-[10px]"
              onClick={() => setFilterId(filter.id)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      }
    >
      {visible.length === 0 ? (
        <CardEmptyState
          message={
            events.length === 0
              ? "Nothing has happened yet. Completed tasks, approvals and new projects appear here."
              : "Nothing matches that filter."
          }
          action={
            events.length > 0 && filterId !== "all" ? (
              <Button size="sm" variant="outline" onClick={() => setFilterId("all")}>
                Show all
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((event) => (
            <li key={event.id} className="flex items-start gap-2">
              <span
                aria-hidden
                className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-copy-faint")}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-copy-primary">{event.summary}</p>
                <p className="text-xs text-copy-muted">{agoLabel(event.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
