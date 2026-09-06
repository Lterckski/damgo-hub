import { CalendarClock, ExternalLink, FolderKanban, Timer, Users } from "lucide-react";

import { countdownLabel, dueLabel, relativeDateTimeLabel } from "@/lib/dashboard/relative-time";
import type { TeamPulse as TeamPulseData } from "@/lib/dashboard/team";
import { Button } from "@/components/ui/button";

/**
 * Row 1 — a thin, high-density strip rather than a card. Small type, four
 * facts, one action. It sets the tab's context without taking a card's
 * worth of vertical space to do it.
 */
export function TeamPulse({ pulse }: { pulse: TeamPulseData }) {
  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-surface px-4 py-2.5 ring-1 ring-surface-border">
      <Stat icon={CalendarClock} label="Next meeting">
        {pulse.nextMeeting ? (
          <span className="flex items-center gap-2">
            <span className="truncate text-copy-primary">{pulse.nextMeeting.title}</span>
            <span className="text-copy-muted">
              {relativeDateTimeLabel(pulse.nextMeeting.at)} · {countdownLabel(pulse.nextMeeting.at)}
            </span>
            {pulse.nextMeeting.joinUrl && (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={pulse.nextMeeting.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Join
              </Button>
            )}
          </span>
        ) : (
          <span className="text-copy-muted">None scheduled</span>
        )}
      </Stat>

      <Stat icon={Timer} label="Nearest deadline">
        {pulse.nearestDeadline ? (
          <span>
            <span className="text-copy-primary">{pulse.nearestDeadline.title}</span>{" "}
            <span className="text-copy-muted">
              {pulse.nearestDeadline.kind.toLowerCase()} · {dueLabel(pulse.nearestDeadline.at)}
            </span>
          </span>
        ) : (
          <span className="text-copy-muted">Nothing in the next 30 days</span>
        )}
      </Stat>

      <Stat icon={FolderKanban} label="Active projects">
        <span className="text-copy-primary tabular-nums">{pulse.activeProjectCount}</span>
      </Stat>

      {/* Roster status, labelled as such. Damgo Hub has no presence signal
          outside Liveblocks board rooms, so "present/away" would be a claim
          the data can't support. */}
      <Stat icon={Users} label="Roster">
        <span className="text-copy-primary tabular-nums">
          {pulse.activeMemberCount} active
        </span>
        {pulse.inactiveMemberCount > 0 && (
          <span className="text-copy-muted"> · {pulse.inactiveMemberCount} inactive</span>
        )}
      </Stat>
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-brand" />
      <span className="shrink-0 font-semibold tracking-wide text-copy-secondary uppercase">
        {label}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}
