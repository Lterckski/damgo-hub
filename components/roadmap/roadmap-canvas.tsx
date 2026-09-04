"use client";

import { useState } from "react";
import { Background, MarkerType, Panel, ReactFlow, useReactFlow } from "@xyflow/react";
import { useLiveblocksFlow } from "@liveblocks/react-flow";
import { useCanRedo, useCanUndo, useRedo, useUndo } from "@liveblocks/react/suspense";
import { Maximize, Plus, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BoardCursors } from "@/components/board/board-cursors";
import { BoardPresence } from "@/components/board/board-presence";
import { MilestoneEditDialog } from "@/components/roadmap/milestone-edit-dialog";
import { MilestoneNode } from "@/components/roadmap/milestone-node";
import { createMilestoneNode, MILESTONE_NODE_TYPE, type MilestoneNode as MilestoneNodeType } from "@/types/roadmap";
import type { ProjectMemberOption } from "@/lib/projects";

import "@xyflow/react/dist/style.css";

const nodeTypes = { [MILESTONE_NODE_TYPE]: MilestoneNode };

// Thin --border-default stroke at rest with a right-angle (smoothstep)
// route and an arrowhead — hover/selected recoloring to --accent-primary
// lives in app/globals.css since defaultEdgeOptions can only set a static
// rest style. See 13-roadmap-board.md's "Add dependency edges".
const DEFAULT_EDGE_OPTIONS = {
  type: "smoothstep",
  style: { stroke: "var(--border-default)", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border-default)", width: 16, height: 16 },
};

/**
 * The Roadmap tab's actual board — everything inside the RoomProvider /
 * ClientSideSuspense / ReactFlowProvider tree set up by roadmap-board.tsx.
 * Split out from that wrapper because `useLiveblocksFlow`, `useReactFlow`,
 * and the presence hooks all need their respective providers above them.
 */
export function RoadmapCanvas({ collaborators }: { collaborators: ProjectMemberOption[] }) {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, onDelete } = useLiveblocksFlow<MilestoneNodeType>({
    suspense: true,
    nodes: { initial: [] },
    edges: { initial: [] },
  });
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const undo = useUndo();
  const redo = useRedo();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const editingNode = nodes.find((n) => n.id === editingNodeId) ?? null;

  function addMilestone() {
    const id = crypto.randomUUID();
    const newNode = createMilestoneNode(id, { x: 120, y: 120 });
    onNodesChange([{ type: "add", item: newNode }]);
    setEditingNodeId(id);
  }

  return (
    <div className="relative h-[34rem] overflow-hidden rounded-2xl border border-surface-border bg-surface">
      <BoardCursors className="h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDelete={onDelete}
          onNodeDoubleClick={(_, node) => setEditingNodeId(node.id)}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          fitView
        >
          <Background gap={20} size={1} />

          <Panel position="top-left">
            <Button type="button" size="sm" onClick={addMilestone}>
              <Plus className="h-3.5 w-3.5" /> Add Milestone
            </Button>
          </Panel>

          <Panel position="bottom-left">
            <div className="flex items-center gap-1 rounded-xl border border-surface-border bg-surface p-1 shadow-sm">
              <Button type="button" variant="ghost" size="icon" title="Zoom in" onClick={() => zoomIn()}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" title="Zoom out" onClick={() => zoomOut()}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" title="Fit view" onClick={() => fitView()}>
                <Maximize className="h-4 w-4" />
              </Button>
              <div className="mx-1 h-4 w-px bg-surface-border" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Undo"
                disabled={!canUndo}
                onClick={() => undo()}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Redo"
                disabled={!canRedo}
                onClick={() => redo()}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </Panel>
        </ReactFlow>
      </BoardCursors>

      <BoardPresence />

      <MilestoneEditDialog
        node={editingNode}
        onOpenChange={(open) => !open && setEditingNodeId(null)}
        onNodesChange={onNodesChange}
        onDelete={onDelete}
        collaborators={collaborators}
      />
    </div>
  );
}
