"use client";

import Link from "next/link";
import { AlertTriangle, FolderKanban } from "lucide-react";

import { cn } from "@/lib/utils";
import { dueLabel } from "@/lib/dashboard/relative-time";
import type { TeamProjectRow } from "@/lib/dashboard/team";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";

/** Row 4 — a card per active project, full width. */
export function TeamProjectsCard({ projects }: { projects: TeamProjectRow[] }) {
  return (
    <PanelCard title="Projects" icon={FolderKanban} emphasis="primary" footerHref="/projects">
      {projects.length === 0 ? (
        <CardEmptyState
          message="No active projects. Approved proposals appear here with their progress and next milestone."
          action={
            <Link
              href="/projects"
              className="text-xs font-semibold text-brand transition-colors hover:underline"
            >
              Browse proposals →
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const percent =
              project.totalTaskCount === 0
                ? 0
                : Math.round((project.completedTaskCount / project.totalTaskCount) * 100);

            return (
              <div
                key={project.id}
                className="flex flex-col rounded-xl bg-base p-3 ring-1 ring-surface-border"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/projects/${project.id}`}
                    className="min-w-0 truncate text-sm font-medium text-copy-primary transition-colors hover:text-brand"
                  >
                    {project.name}
                  </Link>
                  {project.blockedReason && (
                    <Badge variant="destructive" className="shrink-0 text-[10px]">
                      <AlertTriangle className="h-3 w-3" />
                      Blocked
                    </Badge>
                  )}
                </div>

                <div className="mt-1.5 flex items-center gap-1.5">
                  <Avatar className="h-5 w-5">
                    {project.ownerAvatarUrl && <AvatarImage src={project.ownerAvatarUrl} alt="" />}
                    <AvatarFallback className="text-[9px]">
                      {project.ownerName
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase())
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-xs text-copy-muted">{project.ownerName}</span>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle"
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${project.name} progress`}
                  >
                    <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="shrink-0 text-[10px] text-copy-muted tabular-nums">
                    {project.totalTaskCount === 0 ? "—" : `${percent}%`}
                  </span>
                </div>

                <p
                  className={cn(
                    "mt-1.5 truncate text-xs",
                    project.nextMilestone?.isOverdue ? "text-state-error" : "text-copy-muted",
                  )}
                >
                  {project.nextMilestone
                    ? `Next: ${project.nextMilestone.title} · ${dueLabel(project.nextMilestone.dueAt)}`
                    : "No milestones set"}
                </p>

                {project.blockedReason && (
                  <p className="mt-1 truncate text-xs text-state-warning">{project.blockedReason}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}
