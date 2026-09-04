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

// Idea node shape for the open ideas board — see 19-ideas-board.md. A
// freeform sticky note, deliberately much simpler than a milestone: one
// editable text field, an author set once at creation and never editable
// afterward, and a color cycled from the shared 8-pair palette
// (app/globals.css's --idea-color-N-fill/-text custom properties, copied
// from ui-context.md's Node Color Palette) so the board reads as varied
// rather than uniform as notes are added.

export const IDEA_NODE_COLOR_COUNT = 8;

export interface IdeaNodeData extends Record<string, unknown> {
  text: string;
  authorId: string;
  /** Index into the shared 8-color palette, fixed at creation — never recomputed later. */
  colorIndex: number;
}

export const IDEA_NODE_TYPE = "ideaNode" as const;

export type IdeaNode = Node<IdeaNodeData, typeof IDEA_NODE_TYPE>;

export function createIdeaNode(
  id: string,
  position: { x: number; y: number },
  authorId: string,
  colorIndex: number,
): IdeaNode {
  return {
    id,
    type: IDEA_NODE_TYPE,
    position,
    data: {
      text: "",
      authorId,
      colorIndex: colorIndex % IDEA_NODE_COLOR_COUNT,
    },
  };
}
