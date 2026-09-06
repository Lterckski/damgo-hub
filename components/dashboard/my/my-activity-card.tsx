import { Activity } from "lucide-react";

import { agoLabel } from "@/lib/dashboard/relative-time";
import type { ActivityRow } from "@/lib/dashboard/types";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";

/**
 * My Activity — only items aimed at this member, or actions they took.
 *
 * Not the global feed with a filter: the query selects on
 * `ActivityEvent.audienceMemberId` (lib/dashboard/personal.ts), which is
 * what makes "addressed to you" a real property of the row rather than a
 * guess made at render time.
 */

interface MyActivityCardProps {
  events: ActivityRow[];
}

export function MyActivityCard({ events }: MyActivityCardProps) {
  return (
    <PanelCard title="My Activity" icon={Activity} emphasis="secondary">
      {events.length === 0 ? (
        <CardEmptyState message="Nothing addressed to you yet — assignments, approvals and mentions land here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-2">
              <span
                aria-hidden
                className={
                  event.isForYou
                    ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                    : "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-copy-faint"
                }
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
