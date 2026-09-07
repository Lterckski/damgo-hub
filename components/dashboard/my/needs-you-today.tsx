"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Receipt } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/currency";
import { countdownLabel, dueLabel, relativeDateTimeLabel } from "@/lib/dashboard/relative-time";
import type { UrgentItem } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSingleFlight } from "@/hooks/use-action-guard";

/**
 * Row 1 — the one merged urgency strip.
 *
 * Two rules make this work, and both are easy to lose:
 *
 * 1. **When there's nothing wrong it collapses to a single quiet line.**
 *    An empty urgency zone that still occupies a card's worth of space is
 *    the thing it's meant to prevent — it trains people to skip the strip,
 *    which is exactly where the real alerts appear.
 *
 * 2. **This is the only red-capable zone on the tab.** Everything else is
 *    neutral. Red here means something is genuinely late or owed; if it
 *    appeared anywhere decorative, it would stop meaning that.
 */

const KIND_ICON = {
  OVERDUE_TASK: CheckCircle2,
  UNPAID_PENALTY: Receipt,
  MEETING_SOON: CalendarClock,
  AWAITING_YOU: AlertTriangle,
} as const;

const TONE_BAR = {
  critical: "bg-state-error",
  warning: "bg-state-warning",
  neutral: "bg-collab",
} as const;

const TONE_TEXT = {
  critical: "text-state-error",
  warning: "text-state-warning",
  neutral: "text-copy-secondary",
} as const;

interface NeedsYouTodayProps {
  items: UrgentItem[];
}

export function NeedsYouToday({ items }: NeedsYouTodayProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyIds, setBusyIds] = React.useState<Set<string>>(new Set());
  const [resolved, setResolved] = React.useState<Set<string>>(new Set());

  const live = items.filter((item) => !resolved.has(item.id));

  const single = useSingleFlight();

  async function act(item: UrgentItem) {
    if (!item.action) return;

    if (item.action.kind === "JOIN_MEETING" || item.action.kind === "OPEN") {
      if (item.action.href) window.open(item.action.href, "_blank", "noopener,noreferrer");
      return;
    }

    setBusyIds((current) => new Set(current).add(item.id));

    const entityId = item.id.split(":")[1];
    const request =
      item.action.kind === "COMPLETE_TASK"
        ? fetch("/api/dashboard/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: entityId, done: true }),
          })
        : fetch("/api/dashboard/penalties", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "claim_paid", penaltyId: entityId }),
          });

    const response = await request.catch(() => null);
    const payload: unknown = await response?.json().catch(() => null);
    const data = (payload ?? {}) as Record<string, unknown>;

    setBusyIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });

    if (!response?.ok) {
      toast({
        message: typeof data.error === "string" ? data.error : "That didn't work",
        tone: "error",
      });
      return;
    }

    setResolved((current) => new Set(current).add(item.id));
    toast({ message: typeof data.message === "string" ? data.message : "Done" });
    router.refresh();
  }

  // Collapsed state — one line, no card, no wasted fold.
  if (live.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-2 ring-1 ring-surface-border">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-state-success" />
        <p className="text-sm text-copy-secondary">
          Nothing needs you today — no overdue work, nothing owed, no meetings in the next 24 hours.
        </p>
      </div>
    );
  }

  const criticalCount = live.filter((item) => item.tone === "critical").length;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl bg-surface shadow-sm ring-1",
        criticalCount > 0 ? "ring-state-error/40" : "ring-state-warning/40",
      )}
    >
      <div className={cn("h-1", criticalCount > 0 ? "bg-state-error" : "bg-state-warning")} />

      <header className="flex items-center justify-between gap-3 px-5 pt-3.5 pb-2">
        <h2 className="text-sm font-bold tracking-[0.08em] text-copy-primary uppercase">
          Needs you today
        </h2>
        <span className="text-xs text-copy-muted tabular-nums">
          {live.length} item{live.length === 1 ? "" : "s"}
        </span>
      </header>

      <ul className="divide-y divide-surface-border-subtle">
        {live.map((item) => {
          const Icon = KIND_ICON[item.kind];
          const isBusy = busyIds.has(item.id);

          return (
            <li
              key={item.id}
              className={cn(
                "relative flex items-center gap-3 px-5 py-2.5",
                isBusy && "opacity-50",
              )}
            >
              <span className={cn("absolute inset-y-0 left-0 w-0.5", TONE_BAR[item.tone])} aria-hidden />
              <Icon className={cn("h-4 w-4 shrink-0", TONE_TEXT[item.tone])} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-copy-primary">{item.title}</p>
                {item.detail && (
                  <p className="truncate text-xs text-copy-muted">{item.detail}</p>
                )}
              </div>

              {item.amountCents !== null && (
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", TONE_TEXT[item.tone])}>
                  {formatPHP(item.amountCents)}
                </span>
              )}

              <span className="hidden shrink-0 text-xs text-copy-muted sm:block">
                {item.kind === "MEETING_SOON"
                  ? `${relativeDateTimeLabel(item.at)} · ${countdownLabel(item.at)}`
                  : item.kind === "AWAITING_YOU"
                    ? relativeDateTimeLabel(item.at)
                    : dueLabel(item.at)}
              </span>

              {item.action && (
                <Button
                  size="sm"
                  // Teal is the primary action colour and nothing else. A
                  // destructive-looking button here would double-signal
                  // urgency the row's own accent already carries.
                  variant={item.action.kind === "JOIN_MEETING" ? "default" : "outline"}
                  disabled={isBusy}
                  onClick={single(() => act(item), item.id)}
                  className="shrink-0"
                >
                  {item.action.kind === "JOIN_MEETING" && <ExternalLink className="h-3.5 w-3.5" />}
                  {item.action.label}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
