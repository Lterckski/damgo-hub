"use client";

import * as React from "react";
import { ScrollText } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AuditLogEntry } from "@/lib/audit-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Zone 5 — the append-only audit feed.
 *
 * Built and shipped before any override capability, which was the explicit
 * sequencing requirement: an override that predates its own log is an
 * unlogged edit. Every entry shows actor, entity, before → after, reason
 * and timestamp, because "who changed this and why" is the only question
 * this feed exists to answer.
 */

const ENTITY_LABEL: Record<string, string> = {
  MEMBER: "Member",
  TRANSACTION: "Transaction",
  PENALTY: "Penalty",
  PROJECT: "Project",
  TASK: "Task",
  MEETING: "Meeting",
  AGENDA_PROPOSAL: "Agenda",
  MEMBER_REQUEST: "Request",
  BROADCAST: "Broadcast",
  ORG_SETTINGS: "Settings",
};

function humanAction(action: string): string {
  return action.replaceAll(".", " ").replaceAll("_", " ");
}

/** Only the keys that actually changed, so the diff line stays scannable. */
function diffPairs(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { key: string; from: string; to: string }[] {
  if (!after) return [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  const format = (value: unknown) =>
    value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

  return [...keys]
    .map((key) => ({ key, from: format(before?.[key]), to: format(after[key]) }))
    .filter((pair) => pair.from !== pair.to);
}

export function AuditLogFeed({ entries }: { entries: AuditLogEntry[] }) {
  const [limit, setLimit] = React.useState(25);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-surface px-6 py-14 text-center ring-1 ring-surface-border">
        <ScrollText className="h-8 w-8 text-copy-faint" />
        <div>
          <p className="text-sm font-semibold text-copy-primary">No admin actions recorded yet</p>
          <p className="mt-1 max-w-md text-sm text-copy-secondary">
            Approvals, role changes, waivers, overrides and settings edits all append here —
            actor, what changed, before and after, and the reason given.
          </p>
        </div>
      </div>
    );
  }

  const visible = entries.slice(0, limit);

  return (
    <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-surface-border">
      <ul className="divide-y divide-surface-border-subtle">
        {visible.map((entry) => {
          const pairs = diffPairs(entry.before, entry.after);
          return (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <Badge variant="outline" className="text-[10px]">
                  {ENTITY_LABEL[entry.entityType] ?? entry.entityType}
                </Badge>
                <p className="text-sm text-copy-primary">
                  <span className="font-semibold">{entry.actorName}</span>{" "}
                  <span className="text-copy-secondary">{humanAction(entry.action)}</span>{" "}
                  <span className="font-medium">{entry.entityLabel}</span>
                </p>
                <time
                  className="ml-auto shrink-0 text-xs text-copy-muted tabular-nums"
                  dateTime={entry.createdAt}
                >
                  {new Date(entry.createdAt).toLocaleString()}
                </time>
              </div>

              {pairs.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {pairs.map((pair) => (
                    <li key={pair.key} className="text-xs text-copy-secondary">
                      <span className="font-semibold text-copy-primary">{pair.key}</span>{" "}
                      <span className="line-through opacity-70">{pair.from}</span>
                      <span className="mx-1">→</span>
                      <span className="font-medium text-copy-primary">{pair.to}</span>
                    </li>
                  ))}
                </ul>
              )}

              {entry.reason && (
                <p
                  className={cn(
                    "mt-1.5 border-l-2 border-brand pl-2 text-xs text-copy-secondary italic",
                  )}
                >
                  {entry.reason}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {entries.length > limit && (
        <div className="border-t border-surface-border px-4 py-3 text-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((current) => current + 50)}>
            Show more ({entries.length - limit} older)
          </Button>
        </div>
      )}
    </div>
  );
}
