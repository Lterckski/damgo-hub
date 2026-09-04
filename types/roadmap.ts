import type { Node } from "@xyflow/react";

// Milestone node shape for the project roadmap board — see
// 13-roadmap-board.md. Deliberately a single, purpose-built node type
// (not a generic shape system like the one hinted at for the ideas board
// in ui-context.md's "Node Color Palette" / types/canvas.ts) — the spec
// is explicit that a generic multi-shape system is out of scope here.

export type MilestoneStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

export const MILESTONE_STATUS_OPTIONS: { value: MilestoneStatus; label: string }[] = [
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

export function milestoneStatusLabel(status: MilestoneStatus): string {
  return MILESTONE_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export interface MilestoneNodeData extends Record<string, unknown> {
  title: string;
  status: MilestoneStatus;
  /** ISO date string, or null if unset. */
  dueDate: string | null;
  /** Member IDs assigned to this milestone. */
  assigneeIds: string[];
}

export const MILESTONE_NODE_TYPE = "milestoneNode" as const;

export type MilestoneNode = Node<MilestoneNodeData, typeof MILESTONE_NODE_TYPE>;

export function createMilestoneNode(id: string, position: { x: number; y: number }): MilestoneNode {
  return {
    id,
    type: MILESTONE_NODE_TYPE,
    position,
    data: {
      title: "",
      status: "NOT_STARTED",
      dueDate: null,
      assigneeIds: [],
    },
  };
}
