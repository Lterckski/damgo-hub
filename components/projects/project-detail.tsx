"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { FolderKanban, Link as LinkIcon, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { BackButton } from "@/components/shared/back-button";
import { DateTimePicker } from "@/components/shared/date-time-picker";
import { ManageCollaboratorsDialog } from "@/components/projects/manage-collaborators-dialog";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { RoadmapBoard } from "@/components/roadmap/roadmap-board";
import { formatPHP } from "@/lib/currency";
import {
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  projectCategoryLabel,
  projectPriorityLabel,
  type ProjectMemberOption,
  type SerializedProject,
} from "@/lib/projects";

const FIELD_LABEL_CLASS =
  "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

const PRIORITY_VARIANT: Record<
  string,
  "outline" | "secondary" | "destructive"
> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "destructive",
};

// See new-task-dialog.tsx's comment — <Select.Value> needs an `items` map
// to show a label instead of the raw value before the popup has opened.
const STATUS_ITEMS = Object.fromEntries(
  PROJECT_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);
const PRIORITY_ITEMS = Object.fromEntries(
  PROJECT_PRIORITY_OPTIONS.map((o) => [o.value, o.label]),
);
const CATEGORY_ITEMS = Object.fromEntries(
  PROJECT_CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

interface ProjectDetailProps {
  project: SerializedProject;
  allMembers: ProjectMemberOption[];
  isOwner: boolean;
}

/**
 * Owns the whole project page below the top nav — same inline-edit
 * pattern as components/docs/doc-detail.tsx (per the user's explicit
 * preference established there): clicking Edit swaps every field directly
 * into editable inputs in place, no popup. Team Lead (owner) and Supporting
 * Links aren't editable here — see the API route's own comment for why.
 */
export function ProjectDetail({
  project,
  allMembers,
  isOwner,
}: ProjectDetailProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [objectives, setObjectives] = useState(project.objectives ?? "");
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority);
  const [category, setCategory] = useState(project.category ?? "");
  const [startDate, setStartDate] = useState(project.startDate ?? "");
  const [targetEndDate, setTargetEndDate] = useState(
    project.targetEndDate ?? "",
  );
  const [budget, setBudget] = useState(
    project.estimatedBudgetCentavos !== null
      ? String(project.estimatedBudgetCentavos / 100)
      : "",
  );

  function startEditing() {
    setName(project.name);
    setDescription(project.description ?? "");
    setObjectives(project.objectives ?? "");
    setStatus(project.status);
    setPriority(project.priority);
    setCategory(project.category ?? "");
    setStartDate(project.startDate ?? "");
    setTargetEndDate(project.targetEndDate ?? "");
    setBudget(
      project.estimatedBudgetCentavos !== null
        ? String(project.estimatedBudgetCentavos / 100)
        : "",
    );
    setIsEditing(true);
  }

  async function save() {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          objectives,
          status,
          priority,
          category: category || null,
          startDate: startDate || null,
          targetEndDate: targetEndDate || null,
          estimatedBudgetPesos: budget.trim() === "" ? null : Number(budget),
        }),
      });
      if (response.ok) {
        setIsEditing(false);
        router.refresh();
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteProject() {
    setIsSaving(true);
    try {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      router.push("/projects");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <BackButton />
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-brand">
              <FolderKanban className="h-4 w-4" />
            </span>
            {isEditing ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="font-display h-auto py-1 text-3xl text-copy-primary!"
              />
            ) : (
              <h1 className="font-display text-3xl text-copy-primary">
                {project.name}
              </h1>
            )}
          </div>
          <div className="mt-2 ml-10 flex flex-wrap items-center gap-2">
            {isEditing ? (
              <Select
                items={STATUS_ITEMS}
                value={status}
                onValueChange={(value) => value && setStatus(value)}
              >
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <ProjectStatusBadge status={project.status} />
            )}
            {isEditing ? (
              <Select
                items={PRIORITY_ITEMS}
                value={priority}
                onValueChange={(value) => value && setPriority(value)}
              >
                <SelectTrigger className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={PRIORITY_VARIANT[project.priority] ?? "outline"}>
                {projectPriorityLabel(project.priority)} priority
              </Badge>
            )}
            {!isEditing && project.category && (
              <Badge variant="outline">
                {projectCategoryLabel(project.category)}
              </Badge>
            )}
            {isEditing && (
              <Select
                items={CATEGORY_ITEMS}
                value={category}
                onValueChange={(value) => setCategory(value ?? "")}
              >
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-sm font-medium text-copy-secondary">
              Led by {project.ownerName}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ManageCollaboratorsDialog
            projectId={project.id}
            ownerName={project.ownerName}
            collaborators={project.members}
            allMembers={allMembers}
            isOwner={isOwner}
          />
          {isOwner &&
            (isEditing ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving || name.trim() === ""}
                  onClick={save}
                >
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startEditing}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-error"
                  onClick={() => setIsDeleting(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </>
            ))}
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger
            value="overview"
            className="data-active:bg-elevated data-active:text-brand"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="roadmap"
            className="data-active:bg-elevated data-active:text-brand"
          >
            Roadmap
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="rounded-2xl border border-surface-border bg-surface p-6">
            <p className={FIELD_LABEL_CLASS}>Description</p>
            {isEditing ? (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What is this project about?"
                className="w-full text-copy-primary!"
              />
            ) : project.description ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-copy-secondary">
                {project.description}
              </p>
            ) : (
              <p className="text-sm text-copy-secondary">No description yet.</p>
            )}

            <p className={`${FIELD_LABEL_CLASS} mt-4`}>Objectives</p>
            {isEditing ? (
              <Textarea
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                rows={4}
                placeholder="What is this project trying to achieve?"
                className="w-full text-copy-primary!"
              />
            ) : project.objectives ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-copy-secondary">
                {project.objectives}
              </p>
            ) : (
              <p className="text-sm text-copy-secondary">
                No objectives set yet.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-surface-border bg-surface p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                {isEditing ? (
                  <DateTimePicker
                    label="Proposed Start"
                    value={startDate}
                    onChange={setStartDate}
                    includeTime={false}
                  />
                ) : (
                  <>
                    <p className={FIELD_LABEL_CLASS}>Proposed Start</p>
                    <p className="text-sm font-medium text-copy-primary">
                      {project.startDate
                        ? format(new Date(project.startDate), "MMM d, yyyy")
                        : "Not set"}
                    </p>
                  </>
                )}
              </div>
              <div>
                {isEditing ? (
                  <DateTimePicker
                    label="Target End"
                    value={targetEndDate}
                    onChange={setTargetEndDate}
                    includeTime={false}
                  />
                ) : (
                  <>
                    <p className={FIELD_LABEL_CLASS}>Target End</p>
                    <p className="text-sm font-medium text-copy-primary">
                      {project.targetEndDate
                        ? format(new Date(project.targetEndDate), "MMM d, yyyy")
                        : "Not set"}
                    </p>
                  </>
                )}
              </div>
              <div>
                <p className={FIELD_LABEL_CLASS}>Estimated Budget</p>
                {isEditing ? (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="0.00"
                    className="text-copy-primary!"
                  />
                ) : (
                  <p className="text-sm font-medium text-copy-primary">
                    {project.estimatedBudgetCentavos !== null
                      ? formatPHP(project.estimatedBudgetCentavos)
                      : "Not set"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {project.links.length > 0 && (
            <div className="rounded-2xl border border-surface-border bg-surface p-6">
              <p className={FIELD_LABEL_CLASS}>Supporting Links</p>
              <ul className="space-y-2">
                {project.links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm font-medium text-copy-primary transition-colors hover:border-brand/40"
                    >
                      <LinkIcon className="h-4 w-4 text-copy-secondary" />
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="roadmap" className="mt-4">
          <RoadmapBoard
            projectId={project.id}
            collaborators={project.members}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">
              Delete this proposal?
            </DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. Tasks and docs linked to it stay, just
              unlinked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDeleting(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isSaving}
              onClick={deleteProject}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
