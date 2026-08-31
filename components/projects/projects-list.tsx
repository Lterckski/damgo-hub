"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import type { ProjectMemberOption, SerializedProject } from "@/lib/projects";

interface ProjectsListProps {
  myProjects: SerializedProject[];
  allProjects: SerializedProject[];
  members: ProjectMemberOption[];
  currentMemberId: string;
}

export function ProjectsList({ myProjects, allProjects, members, currentMemberId }: ProjectsListProps) {
  return (
    <Tabs defaultValue="mine">
      <div className="flex items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="mine" className="data-active:bg-elevated data-active:text-brand">
            My Projects
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
      <TabsContent value="all" className="mt-6">
        <ProjectGrid projects={allProjects} emptyMessage="No proposals visible to you yet." />
      </TabsContent>
    </Tabs>
  );
}

function ProjectGrid({ projects, emptyMessage }: { projects: SerializedProject[]; emptyMessage: string }) {
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
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
