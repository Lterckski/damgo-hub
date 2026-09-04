"use client";

import { createContext, useContext } from "react";

import type { ProjectMemberOption } from "@/lib/projects";

/**
 * Milestone node `data` only stores assignee member IDs (see
 * types/roadmap.ts) — that's what's synced through Liveblocks storage.
 * Rendering a name/avatar for one of those IDs needs the project's
 * collaborator list, which doesn't need to sync through Liveblocks at all
 * (it's the same data every viewer already has from the page load), so it
 * travels via plain React context instead.
 */
const RoadmapMembersContext = createContext<ProjectMemberOption[]>([]);

export function RoadmapMembersProvider({
  members,
  children,
}: {
  members: ProjectMemberOption[];
  children: React.ReactNode;
}) {
  return <RoadmapMembersContext.Provider value={members}>{children}</RoadmapMembersContext.Provider>;
}

export function useRoadmapMembers(): ProjectMemberOption[] {
  return useContext(RoadmapMembersContext);
}

export function useRoadmapMember(memberId: string): ProjectMemberOption | undefined {
  const members = useRoadmapMembers();
  return members.find((m) => m.id === memberId);
}
