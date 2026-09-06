"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditMilestone } from "./roadmap-actions-context";
import { format } from "date-fns";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useBoardMembers } from "@/components/board/board-member-context";
import type {
  MilestoneNode as MilestoneNodeType,
  MilestoneStatus,
} from "@/types/roadmap";

const MAX_VISIBLE_ASSIGNEES = 3;

// Per 13-roadmap-board.md: --text-muted for NOT_STARTED, --accent-primary
// for IN_PROGRESS, --state-success for DONE — same tokens as the calendar
// and task priority badges elsewhere, applied here to the node's left
// accent bar rather than a full badge (the card is already compact).
const STATUS_ACCENT_CLASS: Record<MilestoneStatus, string> = {
  NOT_STARTED: "bg-copy-muted",
  IN_PROGRESS: "bg-brand",
  DONE: "bg-success",
};

const HANDLE_CLASS =
  "!h-2.5 !w-2.5 !border !border-surface-border !bg-surface opacity-0 transition-opacity group-hover/milestone-node:opacity-100";

// One source + one target handle stacked at each side so a drag can start
// or land from any edge of the card — connection direction is decided by
// which handle the drag actually starts/ends on, not by which side it's
// visually on.
const HANDLE_SIDES = [
  { position: Position.Top, key: "top" },
  { position: Position.Right, key: "right" },
  { position: Position.Bottom, key: "bottom" },
  { position: Position.Left, key: "left" },
] as const;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The one node type this board renders — see types/roadmap.ts and
 * 13-roadmap-board.md. Registered as `nodeTypes={{ milestoneNode:
 * MilestoneNode }}` on the <ReactFlow> instance in roadmap-canvas.tsx,
 * which also owns double-click-to-edit (`onNodeDoubleClick`). The explicit
 * Edit button uses a local context callback; functions never enter the
 * node data synced through Liveblocks storage.
 */
export function MilestoneNode({
  id,
  data,
  selected,
}: NodeProps<MilestoneNodeType>) {
  const members = useBoardMembers();
  const edit = useEditMilestone();
  const assignees = data.assigneeIds
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);
  const visibleAssignees = assignees.slice(0, MAX_VISIBLE_ASSIGNEES);
  const overflow = assignees.length - visibleAssignees.length;

  return (
    <div
      className={cn(
        "group/milestone-node relative flex w-56 items-stretch overflow-hidden rounded-2xl border bg-surface shadow-sm transition-colors",
        selected ? "border-brand" : "border-surface-border",
      )}
    >
      {HANDLE_SIDES.flatMap(({ position, key }) => [
        <Handle
          key={`${key}-target`}
          id={`${key}-target`}
          type="target"
          position={position}
          className={HANDLE_CLASS}
        />,
        <Handle
          key={`${key}-source`}
          id={`${key}-source`}
          type="source"
          position={position}
          className={HANDLE_CLASS}
        />,
      ])}

      <span
        className={cn("w-1.5 shrink-0", STATUS_ACCENT_CLASS[data.status])}
        aria-hidden
      />

      <div className="min-w-0 flex-1 space-y-2 p-3">
        <p className="truncate text-sm font-bold text-copy-primary">
          {data.title || "Untitled milestone"}
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="nodrag nopan min-h-11"
          aria-label={`Edit milestone: ${data.title || "Untitled milestone"}`}
          onClick={() => edit(id)}
        >
          <Pencil className="h-4 w-4" /> Edit
        </Button>

        {data.dueDate && (
          <p className="text-xs font-medium text-copy-secondary">
            Due {format(new Date(data.dueDate), "MMM d, yyyy")}
          </p>
        )}

        {assignees.length > 0 && (
          <AvatarGroup>
            {visibleAssignees.map((assignee) => (
              <Avatar
                key={assignee.id}
                size="sm"
                className="ring-2 ring-surface"
              >
                {assignee.avatarUrl ? (
                  <AvatarImage
                    src={assignee.avatarUrl}
                    alt={assignee.displayName}
                  />
                ) : null}
                <AvatarFallback className="text-[10px]">
                  {initialsFor(assignee.displayName)}
                </AvatarFallback>
              </Avatar>
            ))}
            {overflow > 0 && (
              <AvatarGroupCount className="ring-2 ring-surface">
                +{overflow}
              </AvatarGroupCount>
            )}
          </AvatarGroup>
        )}
      </div>
    </div>
  );
}
