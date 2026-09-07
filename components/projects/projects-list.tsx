"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectDecisionActions } from "@/components/projects/project-decision-actions";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import type { ProjectMemberOption, SerializedProject } from "@/lib/projects";

interface ProjectsListProps {
  myProjects: SerializedProject[];
  proposedProjects: SerializedProject[];
  allProjects: SerializedProject[];
  members: ProjectMemberOption[];
  currentMemberId: string;
  isAdmin: boolean;
}

/**
 * Three distinct views, per 11-project-proposals.md — Proposal Approval
 * Flow. They are separate destinations with their own contents, not one
 * grid behind a status dropdown:
 *
 * - My Projects       — what the viewer owns or collaborates on
 * - Proposed Projects — the org-wide queue of proposals awaiting a decision
 * - All Proposals     — the existing open discovery list, every project
 *
 * Every member can see the pending queue (knowing what the team has put
 * forward is not privileged); only an admin gets Approve/Reject in it, and
 * the API refuses a member regardless of what the browser renders.
 */
export function ProjectsList({
  myProjects,
  proposedProjects,
  allProjects,
  members,
  currentMemberId,
  isAdmin,
}: ProjectsListProps) {
  return (
    <Tabs defaultValue="mine">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList className="flex-wrap">
          <TabsTrigger value="mine" className="data-active:bg-elevated data-active:text-brand">
            My Projects
          </TabsTrigger>
          <TabsTrigger value="proposed" className="data-active:bg-elevated data-active:text-brand">
            Proposed Projects
            {proposedProjects.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent-dim px-1.5 text-[10px] font-bold text-brand">
                {proposedProjects.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="data-active:bg-elevated data-active:text-brand">
            All Proposals
          </TabsTrigger>
        </TabsList>
        <NewProjectDialog members={members} currentMemberId={currentMemberId} />
      </div>

      <TabsContent value="mine" className="mt-6">
        <ProjectGrid projects={myProjects} emptyMessage="No projects yet — start the first proposal." />
      </TabsContent>
      <TabsContent value="proposed" className="mt-6">
        <ProjectGrid
          projects={proposedProjects}
          emptyMessage="Nothing awaiting a decision."
          decidableByAdmin={isAdmin}
        />
      </TabsContent>
      <TabsContent value="all" className="mt-6">
        <ProjectGrid projects={allProjects} emptyMessage="No proposals visible to you yet." />
      </TabsContent>
    </Tabs>
  );
}

// Exported so app/(app)/admin/projects/page.tsx's AdminProjectsView
// (20-admin-dashboard.md) can reuse the exact same card rendering with its
// own status-filtered project list, instead of a parallel copy.
export function ProjectGrid({
  projects,
  emptyMessage,
  decidableByAdmin = false,
}: {
  projects: SerializedProject[];
  emptyMessage: string;
  /** Render Approve/Reject on PROPOSED cards. Admin-only, and cosmetic —
   *  the decision route enforces the role itself. */
  decidableByAdmin?: boolean;
}) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <FolderKanban className="h-8 w-8 text-copy-faint" />
        <p className="text-sm text-copy-secondary">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Link key={project.id} href={`/projects/${project.id}`}>
          <Card className="group/project h-full overflow-hidden border-none py-0 shadow-sm ring-1 ring-surface-border transition-all hover:shadow-md hover:ring-brand/40">
            <div className="h-1 bg-gradient-to-r from-brand to-collab" />
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-brand">
                    <FolderKanban className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-bold text-copy-primary">{project.name}</h3>
                </div>
                <ProjectStatusBadge status={project.status} />
              </div>
              <p className="mt-3 text-xs font-medium text-copy-secondary">Owned by {project.ownerName}</p>
              {project.members.length > 0 && (
                <div className="mt-3 flex -space-x-2">
                  {project.members.slice(0, 5).map((collaborator) => (
                    <Avatar key={collaborator.id} className="h-6 w-6 border-2 border-surface">
                      <AvatarImage src={collaborator.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {collaborator.displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              )}
              {decidableByAdmin && project.status === "PROPOSED" && (
                <div className="mt-4 border-t border-surface-border pt-3">
                  <ProjectDecisionActions
                    projectId={project.id}
                    projectName={project.name}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
