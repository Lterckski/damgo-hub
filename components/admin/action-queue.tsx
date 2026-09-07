"use client";

import * as React from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/currency";
import type { QueueAction, QueueItem } from "@/lib/admin/queue";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AdminDrawerTarget } from "@/lib/admin/types";
import { useSingleFlight } from "@/hooks/use-action-guard";

/**
 * Zone 2 — the Action Queue.
 *
 * One list, six sources. The point of merging them is that an admin's
 * actual job is "what needs me?", which was previously answered by opening
 * four pages and reading each one's own pending section.
 *
 * Multi-select spans kinds, but the bulk bar only offers actions every
 * selected row genuinely supports — offering "Approve" over a mixed
 * selection of transactions and overdue tasks would either fail half the
 * batch or quietly mean two different things.
 */

const SEVERITY_ACCENT: Record<QueueItem["severity"], string> = {
  info: "bg-collab",
  warning: "bg-state-warning",
  critical: "bg-state-error",
};

const KIND_LABEL: Record<QueueItem["kind"], string> = {
  TRANSACTION_PENDING: "Finance",
  JOIN_REQUEST: "Join request",
  ROLE_CHANGE_REQUEST: "Role change",
  AGENDA_PROPOSAL: "Agenda",
  PROJECT_PROPOSAL: "Proposal",
  PENALTY_PAST_DUE: "Penalty",
  TASK_OVERDUE: "Task",
};

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${Math.max(minutes, 0)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

interface ActionQueueProps {
  items: QueueItem[];
  onAction: (action: QueueAction, entityIds: string[]) => void;
  onOpenDrawer: (target: AdminDrawerTarget) => void;
  pendingIds: Set<string>;
}

export function ActionQueue({ items, onAction, onOpenDrawer, pendingIds }: ActionQueueProps) {
  const single = useSingleFlight();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Selection is read through the live item list rather than pruned when
  // items change: after an approval the row leaves the queue, and a stale
  // id left in the Set is invisible here because nothing reads the Set
  // directly. That keeps the count honest without an effect that would
  // re-render on every refresh.
  const selectedItems = items.filter((item) => selected.has(item.id));

  /**
   * Actions offered over a selection: only those every selected row lists.
   * Intersection, not union — a bulk button that silently skips rows is
   * worse than one that isn't there.
   */
  const sharedActions: QueueAction[] = React.useMemo(() => {
    if (selectedItems.length === 0) return [];
    const [first, ...rest] = selectedItems;
    return first.actions.filter((action) =>
      rest.every((item) => item.actions.some((other) => other.actionId === action.actionId)),
    );
  }, [selectedItems]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-surface px-6 py-14 text-center ring-1 ring-surface-border">
        <Inbox className="h-8 w-8 text-copy-faint" />
        <div>
          <p className="text-sm font-semibold text-copy-primary">The queue is clear</p>
          <p className="mt-1 max-w-sm text-sm text-copy-secondary">
            Pending transactions, join and role-change requests, agenda and project proposals,
            past-due penalties and escalated overdue tasks all land here for a decision.
          </p>
        </div>
      </div>
    );
  }

  const allSelected = items.length > 0 && selectedItems.length === items.length;

  return (
    <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-surface-border">
      <div className="flex items-center gap-3 border-b border-surface-border px-4 py-3">
        <Checkbox
          checked={allSelected}
          onCheckedChange={() =>
            setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))
          }
          aria-label="Select all queue items"
        />
        <p className="text-xs font-bold tracking-[0.08em] text-copy-primary uppercase">
          Awaiting decision ({items.length})
        </p>
      </div>

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-surface-border bg-accent-dim px-4 py-2.5">
          <p className="text-sm font-semibold text-copy-primary">{selectedItems.length} selected</p>
          <div className="ml-auto flex flex-wrap gap-2">
            {sharedActions.length === 0 ? (
              <p className="text-xs text-copy-secondary">
                No action applies to every selected row
              </p>
            ) : (
              sharedActions.map((action) => (
                <Button
                  key={action.actionId}
                  size="sm"
                  variant={action.variant === "destructive" ? "destructive" : action.variant === "primary" ? "default" : "outline"}
                  onClick={() =>
                    onAction(action, selectedItems.map((item) => item.entityId))
                  }
                >
                  {action.label}
                </Button>
              ))
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-surface-border-subtle">
        {items.map((item) => {
          const isPending = pendingIds.has(item.id);
          return (
            <li
              key={item.id}
              className={cn(
                "relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-subtle",
                isPending && "opacity-50",
              )}
            >
              <span
                className={cn("absolute inset-y-0 left-0 w-0.5", SEVERITY_ACCENT[item.severity])}
                aria-hidden
              />
              <Checkbox
                checked={selected.has(item.id)}
                onCheckedChange={() => toggle(item.id)}
                aria-label={`Select ${item.title}`}
                className="mt-1"
              />

              <Avatar className="mt-0.5 h-8 w-8 shrink-0">
                {item.subjectAvatarUrl && <AvatarImage src={item.subjectAvatarUrl} alt="" />}
                <AvatarFallback>{initials(item.subjectName ?? "?")}</AvatarFallback>
              </Avatar>

              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => item.drawer && onOpenDrawer(item.drawer)}
                disabled={!item.drawer}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {KIND_LABEL[item.kind]}
                  </Badge>
                  <p className="truncate text-sm font-semibold text-copy-primary">{item.title}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-copy-secondary">
                  {[item.subjectName, item.detail].filter(Boolean).join(" · ")}
                </p>
              </button>

              <div className="flex shrink-0 items-center gap-3">
                {item.amountCents !== null && (
                  <span className="text-sm font-semibold text-copy-primary tabular-nums">
                    {formatPHP(item.amountCents)}
                  </span>
                )}
                <span className="w-8 text-right text-xs text-copy-muted tabular-nums">
                  {relativeAge(item.occurredAt)}
                </span>
                <div className="flex gap-1.5">
                  {item.actions.map((action) => (
                    <Button
                      key={action.actionId}
                      size="sm"
                      variant={
                        action.variant === "destructive"
                          ? "destructive"
                          : action.variant === "primary"
                            ? "default"
                            : "outline"
                      }
                      disabled={isPending}
                      onClick={single(() => onAction(action, [item.entityId]), `${action.actionId}:${item.entityId}`)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
