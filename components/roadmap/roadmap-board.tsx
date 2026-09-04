"use client";

import { ClientSideSuspense, LiveblocksProvider, RoomProvider } from "@liveblocks/react/suspense";
import { ReactFlowProvider } from "@xyflow/react";
import { Loader2 } from "lucide-react";

import { BoardErrorBoundary } from "@/components/board/board-error-boundary";
import { BoardMembersProvider } from "@/components/board/board-member-context";
import { RoadmapCanvas } from "@/components/roadmap/roadmap-canvas";
import type { ProjectMemberOption } from "@/lib/projects";

interface RoadmapBoardProps {
  projectId: string;
  collaborators: ProjectMemberOption[];
}

/**
 * Roadmap tab entry point — sets up the Liveblocks room scoped to this
 * project (room ID `project:{projectId}`, per 12-liveblocks-setup.md's
 * Room ID Convention) and hands off to RoadmapCanvas for the actual
 * board. The room-access check itself lives server-side in
 * /api/liveblocks-auth — this component doesn't re-check access, it just
 * connects (a member who reaches this tab already passed
 * requireProjectAccess in page.tsx).
 *
 * Kept local to this tab rather than hoisted into a shared provider in
 * app/layout.tsx — 17-meeting-agenda-board.md and 19-ideas-board.md will
 * each need their own room anyway. If having each surface set up its own
 * LiveblocksProvider gets annoying once those exist, that's the point to
 * factor out a shared one — not before, per this session's usual "don't
 * pre-build for specs that don't exist yet" pattern.
 */
export function RoadmapBoard({ projectId, collaborators }: RoadmapBoardProps) {
  return (
    <BoardErrorBoundary boardLabel="roadmap board">
      <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
        <RoomProvider id={`project:${projectId}`} initialPresence={{ cursor: null }}>
          <ClientSideSuspense
            fallback={
              <div className="flex h-[34rem] items-center justify-center rounded-2xl border border-surface-border bg-surface">
                <Loader2 className="h-5 w-5 animate-spin text-copy-secondary" />
              </div>
            }
          >
            <BoardMembersProvider members={collaborators}>
              <ReactFlowProvider>
                <RoadmapCanvas projectId={projectId} collaborators={collaborators} />
              </ReactFlowProvider>
            </BoardMembersProvider>
          </ClientSideSuspense>
        </RoomProvider>
      </LiveblocksProvider>
    </BoardErrorBoundary>
  );
}
