"use client";

import { ExternalLink, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { dueLabel } from "@/lib/dashboard/relative-time";
import type { HackathonRow } from "@/lib/dashboard/team";
import { Badge } from "@/components/ui/badge";
import { PanelCard } from "@/components/dashboard/panel-card";

/**
 * Row 5 — the hackathon pipeline.
 *
 * Only rendered when at least one competition has been recorded (see
 * lib/dashboard/features.ts). An empty pipeline card would be a heading
 * advertising a feature with nothing behind it, which is the thing this
 * rebuild set out to remove.
 */

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  WATCHING: "outline",
  REGISTERED: "secondary",
  SUBMITTED: "default",
  WON: "default",
  ELIMINATED: "destructive",
  SKIPPED: "outline",
};

export function HackathonCard({ hackathons }: { hackathons: HackathonRow[] }) {
  return (
    <PanelCard title="Hackathon Pipeline" icon={Trophy} emphasis="secondary">
      <ul className="flex flex-col gap-2">
        {hackathons.map((hackathon) => (
          <li key={hackathon.id} className="rounded-xl bg-base px-3 py-2.5 ring-1 ring-surface-border">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-copy-primary">{hackathon.name}</p>
                  {hackathon.url && (
                    <a
                      href={hackathon.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-copy-faint transition-colors hover:text-brand"
                      aria-label={`Open ${hackathon.name}`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="truncate text-xs text-copy-muted">
                  {[hackathon.organizer, hackathon.projectName ? `Entry: ${hackathon.projectName}` : null]
                    .filter(Boolean)
                    .join(" · ") || "No entry yet"}
                </p>
              </div>
              <Badge
                variant={STATUS_VARIANT[hackathon.entryStatus] ?? "outline"}
                className="shrink-0 text-[10px]"
              >
                {hackathon.entryStatus.toLowerCase()}
              </Badge>
            </div>

            <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
              <Deadline label="Register" iso={hackathon.registrationDeadline} />
              <Deadline label="Submit" iso={hackathon.submissionDeadline} />
            </div>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}

function Deadline({ label, iso }: { label: string; iso: string | null }) {
  if (!iso) return null;
  const isPast = new Date(iso) < new Date();
  return (
    <span className={cn(isPast ? "text-copy-faint line-through" : "text-copy-muted")}>
      {label}: <span className={cn(!isPast && "text-copy-secondary")}>{dueLabel(iso)}</span>
    </span>
  );
}
