"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { dueLabel } from "@/lib/dashboard/relative-time";
import type { MyTaskRow, TaskBucket } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";

/**
 * My Tasks — the tallest card on the tab, because it's the one people
 * actually work from.
 *
 * Completing is optimistic: the row disappears immediately and the request
 * follows. The Undo toast is what makes that safe — the checkbox is a
 * one-click destructive-ish action on a small target, and a mis-click with
 * no way back is the reason optimistic UI gets a bad name.
 */

const BUCKET_ORDER: TaskBucket[] = ["OVERDUE", "TODAY", "THIS_WEEK", "LATER"];

const BUCKET_LABEL: Record<TaskBucket, string> = {
  OVERDUE: "Overdue",
  TODAY: "Today",
  THIS_WEEK: "This week",
  LATER: "Later",
};

// Only OVERDUE gets colour. Everything else is neutral — if "This week"
// were amber the urgency layer would stop reading.
const BUCKET_HEADER_CLASS: Record<TaskBucket, string> = {
  OVERDUE: "text-state-error",
  TODAY: "text-copy-primary",
  THIS_WEEK: "text-copy-secondary",
  LATER: "text-copy-muted",
};

const VISIBLE_LIMIT = 5;

interface MyTasksCardProps {
  tasks: MyTaskRow[];
  onCreateTask: () => void;
}

export function MyTasksCard({ tasks, onCreateTask }: MyTasksCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [completed, setCompleted] = React.useState<Set<string>>(new Set());
  const [showAll, setShowAll] = React.useState(false);

  async function send(taskId: string, done: boolean): Promise<boolean> {
    const response = await fetch("/api/dashboard/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, done }),
    }).catch(() => null);

    if (!response?.ok) {
      const payload: unknown = await response?.json().catch(() => null);
      const error =
        typeof payload === "object" && payload !== null && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "Couldn't update that task";
      toast({ message: error, tone: "error" });
      return false;
    }
    return true;
  }

  async function complete(task: MyTaskRow) {
    // Optimistic: hide the row first.
    setCompleted((current) => new Set(current).add(task.id));

    const ok = await send(task.id, true);
    if (!ok) {
      // Roll back — the row comes straight back where it was.
      setCompleted((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
      return;
    }

    toast({
      message: `“${task.title}” completed`,
      undo: async () => {
        const undone = await send(task.id, false);
        if (undone) {
          setCompleted((current) => {
            const next = new Set(current);
            next.delete(task.id);
            return next;
          });
          router.refresh();
        }
      },
    });

    router.refresh();
  }

  const live = tasks.filter((task) => !completed.has(task.id));
  const visible = showAll ? live : live.slice(0, VISIBLE_LIMIT);
  const hidden = live.length - visible.length;

  const grouped = BUCKET_ORDER.map((bucket) => ({
    bucket,
    rows: visible.filter((task) => task.bucket === bucket),
  })).filter((group) => group.rows.length > 0);

  return (
    <PanelCard
      title="My Tasks"
      icon={CheckSquare}
      emphasis="hero"
      headerAside={
        live.length > 0 ? (
          <span className="text-xs text-copy-muted tabular-nums">{live.length} open</span>
        ) : null
      }
      footerHref="/tasks"
    >
      {live.length === 0 ? (
        <CardEmptyState
          message={
            tasks.length === 0
              ? "No tasks assigned to you yet."
              : "Everything assigned to you is done."
          }
          action={
            <Button size="sm" onClick={onCreateTask}>
              <Plus className="h-4 w-4" />
              Create task
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {grouped.map((group) => (
              <div key={group.bucket}>
                <h4
                  className={cn(
                    "mb-1.5 text-[10px] font-bold tracking-[0.08em] uppercase",
                    BUCKET_HEADER_CLASS[group.bucket],
                  )}
                >
                  {BUCKET_LABEL[group.bucket]}
                  <span className="ml-1.5 font-medium text-copy-faint">{group.rows.length}</span>
                </h4>

                <ul className="flex flex-col gap-1.5">
                  {group.rows.map((task) => (
                    <li key={task.id} className="flex items-start gap-2.5">
                      <Checkbox
                        checked={false}
                        onCheckedChange={() => complete(task)}
                        aria-label={`Complete ${task.title}`}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-copy-primary">{task.title}</p>
                        <p className="truncate text-xs text-copy-muted">
                          {[
                            task.projectName,
                            `from ${task.assignedByName}`,
                            group.bucket === "OVERDUE" ? null : dueLabel(task.dueAt),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      {group.bucket === "OVERDUE" && (
                        <span className="shrink-0 text-xs font-semibold text-state-error">
                          {dueLabel(task.dueAt)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 text-xs font-medium text-copy-muted transition-colors hover:text-brand"
            >
              +{hidden} more
            </button>
          )}
        </>
      )}
    </PanelCard>
  );
}
