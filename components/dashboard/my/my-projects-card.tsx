"use client";

import Link from "next/link";
import { AlertTriangle, FolderKanban } from "lucide-react";

import { cn } from "@/lib/utils";
import { dueLabel } from "@/lib/dashboard/relative-time";
import type { MyProjectRow } from "@/lib/dashboard/types";
import { Badge } from "@/components/ui/badge";
import { CardEmptyState, PanelCard } from "@/components/dashboard/panel-card";

/**
 * My Projects — only the ones this member owns or collaborates on, filtered
 * in the query (lib/dashboard/personal.ts), not here.
 *
 * The progress bar is tasks-done over tasks-total. That's an honest,
 * derivable number; a percentage typed in by hand would drift the moment
 * anyone forgot to update it.
 */

interface MyProjectsCardProps {
  projects: MyProjectRow[];
}

export function MyProjectsCard({ projects }: MyProjectsCardProps) {
  return (
    <PanelCard
      title="My Projects"
      icon={FolderKanban}
      emphasis="secondary"
      footerHref="/projects"
    >
      {projects.length === 0 ? (
        <CardEmptyState
          message="You're not on any active projects yet."
          action={
            <Link
              href="/projects"
              className="text-xs font-semibold text-brand transition-colors hover:underline"
            >
              Browse projects →
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {projects.map((project) => {
            const percent =
              project.totalTaskCount === 0
                ? 0
                : Math.round((project.completedTaskCount / project.totalTaskCount) * 100);

            return (
              <li key={project.id} className="rounded-xl bg-base px-3 py-2.5 ring-1 ring-surface-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="truncate text-sm font-medium text-copy-primary transition-colors hover:text-brand"
                    >
                      {project.name}
                    </Link>
                    <p className="text-xs text-copy-muted">
                      {project.role} · {project.openTaskCount} open
                    </p>
                  </div>
                  {project.blockedReason && (
                    <Badge variant="destructive" className="shrink-0 text-[10px]">
                      <AlertTriangle className="h-3 w-3" />
                      Blocked
                    </Badge>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-2">
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
                    {project.totalTaskCount === 0
                      ? "no tasks"
                      : `${project.completedTaskCount}/${project.totalTaskCount}`}
                  </span>
                </div>

                {project.nextMilestone && (
                  <p
                    className={cn(
                      "mt-1.5 truncate text-xs",
                      project.nextMilestone.isOverdue ? "text-state-error" : "text-copy-muted",
                    )}
                  >
                    Next: {project.nextMilestone.title} · {dueLabel(project.nextMilestone.dueAt)}
                  </p>
                )}
                {project.blockedReason && (
                  <p className="mt-1 truncate text-xs text-state-warning">{project.blockedReason}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}
