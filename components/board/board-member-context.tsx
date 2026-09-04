"use client";

import { createContext, useContext } from "react";

/** The common shape every "member picker" option in this app already has (`ProjectMemberOption`, `MeetingMemberOption`, `MemberPickerOption`, ...). */
export interface BoardMemberOption {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * A board's node `data` only ever stores member **IDs** (roadmap milestone
 * assignees, idea authors) — that's what actually syncs through Liveblocks
 * storage. Rendering a name/avatar for one of those IDs needs the roster
 * to resolve against, which doesn't need to sync through Liveblocks at all
 * (it's the same data every viewer already has from the page load), so it
 * travels via plain React context instead. Originally built for the
 * roadmap board (13-roadmap-board.md, as `RoadmapMembersContext`),
 * extracted here for 19-ideas-board.md to reuse as-is.
 */
const BoardMembersContext = createContext<BoardMemberOption[]>([]);

export function BoardMembersProvider({
  members,
  children,
}: {
  members: BoardMemberOption[];
  children: React.ReactNode;
}) {
  return <BoardMembersContext.Provider value={members}>{children}</BoardMembersContext.Provider>;
}

export function useBoardMembers(): BoardMemberOption[] {
  return useContext(BoardMembersContext);
}

export function useBoardMember(memberId: string): BoardMemberOption | undefined {
  const members = useBoardMembers();
  return members.find((m) => m.id === memberId);
}
