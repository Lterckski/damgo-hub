"use client";

import { useState } from "react";
import { Background, Panel, ReactFlow, useReactFlow } from "@xyflow/react";
import { useLiveblocksFlow } from "@liveblocks/react-flow";
import { Maximize, Plus, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BoardCursors } from "@/components/board/board-cursors";
import { BoardPresence } from "@/components/board/board-presence";
import { BoardSaveStatus } from "@/components/board/board-save-status";
import { IdeaActionsProvider } from "@/components/ideas/idea-actions-context";
import { IdeaNode } from "@/components/ideas/idea-node";
import { useBoardAutosave } from "@/hooks/use-board-autosave";
import {
  createIdeaNode,
  IDEA_NODE_COLOR_COUNT,
  IDEA_NODE_TYPE,
  type IdeaNode as IdeaNodeType,
} from "@/types/roadmap";

import "@xyflow/react/dist/style.css";

const nodeTypes = { [IDEA_NODE_TYPE]: IdeaNode };

/**
 * The Ideas tab's actual board — everything inside the RoomProvider /
 * ClientSideSuspense / ReactFlowProvider tree set up by ideas-board.tsx.
 * No edges anywhere (this board is freeform notes only, per
 * 19-ideas-board.md's scope limits) — `nodesConnectable={false}` on top
 * of `IdeaNode` never rendering a `<Handle>` at all, so there's no path
 * to drawing one even by accident.
 */
export function IdeasCanvas({ currentMemberId }: { currentMemberId: string }) {
  const { nodes, edges, onNodesChange, onEdgesChange } =
    useLiveblocksFlow<IdeaNodeType>({
      suspense: true,
      nodes: { initial: [] },
      edges: { initial: [] },
    });
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const {
    status: saveStatus,
    canRetryLoad,
    retryLoad,
  } = useBoardAutosave({
    roomId: "ideas",
    nodes,
    edges,
    onLoadSnapshot: (snapshot) => {
      if (snapshot.nodes.length > 0) {
        onNodesChange(
          snapshot.nodes.map((item) => ({ type: "add" as const, item })),
        );
      }
      if (snapshot.edges.length > 0) {
        onEdgesChange(
          snapshot.edges.map((item) => ({ type: "add" as const, item })),
        );
      }
    },
  });

  const [autoEditNodeId, setAutoEditNodeId] = useState<string | null>(null);

  function addIdea() {
    const id = crypto.randomUUID();
    // Slightly randomized so new notes don't land exactly on top of each
    // other — see 19-ideas-board.md step 5.
    const position = {
      x: 80 + Math.random() * 320,
      y: 80 + Math.random() * 240,
    };
    const colorIndex = nodes.length % IDEA_NODE_COLOR_COUNT;
    const node = createIdeaNode(id, position, currentMemberId, colorIndex);
    onNodesChange([{ type: "add", item: node }]);
    setAutoEditNodeId(id);
  }

  function commitText(nodeId: string, text: string) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    onNodesChange([
      {
        id: nodeId,
        type: "replace",
        item: { ...node, data: { ...node.data, text } },
      },
    ]);
  }

  return (
    <div className="board-canvas relative overflow-hidden rounded-2xl border border-surface-border bg-surface">
      <BoardCursors className="h-full w-full">
        <IdeaActionsProvider
          commitText={commitText}
          deleteIdea={(id) => onNodesChange([{ type: "remove", id }])}
          autoEditNodeId={autoEditNodeId}
          clearAutoEdit={() => setAutoEditNodeId(null)}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            nodesConnectable={false}
            fitView
          >
            <Background gap={20} size={1} />

            <Panel position="top-left">
              <Button type="button" size="sm" onClick={addIdea}>
                <Plus className="h-3.5 w-3.5" /> New Idea
              </Button>
            </Panel>

            <Panel position="bottom-left" className="board-controls">
              <div className="flex items-center gap-1 rounded-xl border border-surface-border bg-surface p-1 shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Zoom in"
                  title="Zoom in"
                  onClick={() => zoomIn()}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Zoom out"
                  title="Zoom out"
                  onClick={() => zoomOut()}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Fit view"
                  title="Fit view"
                  onClick={() => fitView()}
                >
                  <Maximize className="h-4 w-4" />
                </Button>
                <div className="mx-1 h-4 w-px bg-surface-border" />
                <BoardSaveStatus
                  status={saveStatus}
                  onRetryLoad={canRetryLoad ? retryLoad : undefined}
                />
              </div>
            </Panel>
          </ReactFlow>
        </IdeaActionsProvider>
      </BoardCursors>

      <BoardPresence />
    </div>
  );
}
