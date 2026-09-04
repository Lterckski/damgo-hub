"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ProjectGrid } from "@/components/projects/projects-list";
import { PROJECT_STATUS_OPTIONS, type SerializedProject } from "@/lib/projects";
import { cn } from "@/lib/utils";

const ALL_STATUSES = "ALL";

/**
 * All project proposals regardless of ownership, with status filters — see
 * 20-admin-dashboard.md. Reuses `ProjectGrid` (`projects-list.tsx`,
 * `11-project-proposals.md`) as-is; the only new piece here is the status
 * filter pills, since `/projects`' own "All Proposals" tab already shows
 * every project unfiltered.
 */
export function AdminProjectsView({ projects }: { projects: SerializedProject[] }) {
  const [status, setStatus] = useState<string>(ALL_STATUSES);

  const filtered = status === ALL_STATUSES ? projects : projects.filter((p) => p.status === status);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(status === ALL_STATUSES && "border-brand/50 bg-accent-dim text-brand")}
          onClick={() => setStatus(ALL_STATUSES)}
        >
          All
        </Button>
        {PROJECT_STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            size="sm"
            className={cn(status === option.value && "border-brand/50 bg-accent-dim text-brand")}
            onClick={() => setStatus(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="mt-4">
        <ProjectGrid projects={filtered} emptyMessage="No proposals match this filter." />
      </div>
    </div>
  );
}
