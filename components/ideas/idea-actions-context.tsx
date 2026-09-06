"use client";

import { createContext, useContext } from "react";

interface IdeaActions {
  deleteIdea: (nodeId: string) => void;
  /** Writes a note's text through to Liveblocks storage — no separate save step. */
  commitText: (nodeId: string, text: string) => void;
  /**
   * The note (if any) that should immediately enter edit mode — set once,
   * locally, right after "New Idea" creates a node (per
   * 19-ideas-board.md's "immediately focused for text entry"). Never
   * written into node `data`, so it stays purely local: only the member
   * who clicked "New Idea" gets auto-focused editing, not every
   * collaborator who happens to be looking at the board when the node
   * syncs in.
   */
  autoEditNodeId: string | null;
  /** The auto-edit node has claimed its focus — clears so it doesn't refire. */
  clearAutoEdit: () => void;
}

const IdeaActionsContext = createContext<IdeaActions>({
  commitText: () => {},
  deleteIdea: () => {},
  autoEditNodeId: null,
  clearAutoEdit: () => {},
});

/**
 * `ideaNode` needs to write its own text back through `onNodesChange`
 * (inline editing, per 19-ideas-board.md — no separate edit dialog like
 * the roadmap board's milestone nodes have), but a React Flow node
 * component only ever receives `data`/`id`/`selected` as props, not
 * whatever mutators the canvas that registered it happens to have. This
 * context is exactly `roadmap-member-context.tsx`'s reasoning, just for a
 * write instead of a read.
 */
export function IdeaActionsProvider({
  commitText,
  deleteIdea,
  autoEditNodeId,
  clearAutoEdit,
  children,
}: {
  commitText: IdeaActions["commitText"];
  deleteIdea: IdeaActions["deleteIdea"];
  autoEditNodeId: string | null;
  clearAutoEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <IdeaActionsContext.Provider
      value={{ commitText, deleteIdea, autoEditNodeId, clearAutoEdit }}
    >
      {children}
    </IdeaActionsContext.Provider>
  );
}

export function useIdeaActions(): IdeaActions {
  return useContext(IdeaActionsContext);
}
