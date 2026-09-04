"use client";

import { ClientSideSuspense, LiveblocksProvider, RoomProvider } from "@liveblocks/react/suspense";
import { ReactFlowProvider } from "@xyflow/react";
import { Loader2 } from "lucide-react";

import { BoardErrorBoundary } from "@/components/board/board-error-boundary";
import { BoardMembersProvider, type BoardMemberOption } from "@/components/board/board-member-context";
import { IdeasCanvas } from "@/components/ideas/ideas-canvas";

interface IdeasBoardProps {
  currentMemberId: string;
  members: BoardMemberOption[];
}

/**
 * Ideas tab entry point — sets up the single global Liveblocks room
 * (room ID `"ideas"`, per 12-liveblocks-setup.md's Room ID Convention) and
 * hands off to IdeasCanvas for the actual board. No project/meeting
 * scoping — `members` is the full org roster, not a project's
 * collaborators, since any authenticated member can post here.
 */
export function IdeasBoard({ currentMemberId, members }: IdeasBoardProps) {
  return (
    <BoardErrorBoundary boardLabel="ideas board">
      <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
        <RoomProvider id="ideas" initialPresence={{ cursor: null }}>
          <ClientSideSuspense
            fallback={
              <div className="flex h-[34rem] items-center justify-center rounded-2xl border border-surface-border bg-surface">
                <Loader2 className="h-5 w-5 animate-spin text-copy-secondary" />
              </div>
            }
          >
            <BoardMembersProvider members={members}>
              <ReactFlowProvider>
                <IdeasCanvas currentMemberId={currentMemberId} />
              </ReactFlowProvider>
            </BoardMembersProvider>
          </ClientSideSuspense>
        </RoomProvider>
      </LiveblocksProvider>
    </BoardErrorBoundary>
  );
}
