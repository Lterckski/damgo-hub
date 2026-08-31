"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { FileText, FolderKanban, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/shared/date-time-picker";
import { DocumentMultiSelect } from "@/components/tasks/document-multi-select";
import { TaskStatusBadge, type TaskStatusValue } from "@/components/tasks/task-status-badge";
import {
  TASK_TYPE_OPTIONS,
  taskTypeLabel,
  type SerializedTask,
  type TaskDocOption,
  type TaskMemberOption,
  type TaskProjectOption,
} from "@/lib/tasks";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";
const NO_PROJECT = "__none__";
const NO_PROJECT_LABEL = "Not part of a project / Standalone";

// See new-task-dialog.tsx's comment — <Select.Value> needs an `items` map
// to show a label instead of the raw value before the popup has opened.
const STATUS_ITEMS = { TODO: "To Do", IN_PROGRESS: "In Progress", DONE: "Done" };
const TASK_TYPE_ITEMS = Object.fromEntries(TASK_TYPE_OPTIONS.map((o) => [o.value, o.label]));

interface TaskDetailDialogProps {
  task: SerializedTask;
  members: TaskMemberOption[];
  projects: TaskProjectOption[];
  docs: TaskDocOption[];
  currentMemberId: string;
  isAdmin: boolean;
  onClose: () => void;
  /**
   * View-only — shows the same info (status, type, dates, description,
   * assignees, project, documents) with no editable fields, just a Delete
   * option (creator/Admin only) and Close. `/calendar` uses this: clicking
   * a task there is for checking what it is, not editing it — full editing
   * stays on `/tasks`.
   */
  readOnly?: boolean;
}

/**
 * View/edit/delete for one task. Shared between `/tasks` (full editing —
 * status, type, dates, description, assignees, linked project/docs) and
 * `/calendar` (view-only, `readOnly`), so the same component backs both
 * rather than two divergent copies. See 08-task-assignment.md and
 * 10-calendar.md.
 */
export function TaskDetailDialog({
  task,
  members,
  projects,
  docs,
  currentMemberId,
  isAdmin,
  onClose,
  readOnly = false,
}: TaskDetailDialogProps) {
  const router = useRouter();
  const [draftStatus, setDraftStatus] = useState<TaskStatusValue>(task.status as TaskStatusValue);
  const [draftType, setDraftType] = useState(task.type);
  const [draftStartDate, setDraftStartDate] = useState(task.startDate);
  const [draftDueDate, setDraftDueDate] = useState(task.dueDate);
  const [draftDescription, setDraftDescription] = useState(task.description ?? "");
  const [draftAssigneeIds, setDraftAssigneeIds] = useState(task.assignees.map((a) => a.id));
  const [draftProjectId, setDraftProjectId] = useState(task.projectId ?? NO_PROJECT);
  const [draftDocumentIds, setDraftDocumentIds] = useState(task.documents.map((d) => d.id));
  const [isSaving, setIsSaving] = useState(false);

  function toggleAssignee(memberId: string) {
    setDraftAssigneeIds((prev) => {
      const set = new Set(prev);
      if (set.has(memberId)) set.delete(memberId);
      else set.add(memberId);
      return [...set];
    });
  }

  // The task's own currently-linked project is always selectable even if
  // it's since moved to a non-linkable status (COMPLETED/ARCHIVED) — the
  // dropdown shouldn't silently drop what's already set.
  const projectOptions =
    task.projectId && !projects.some((p) => p.id === task.projectId)
      ? [{ id: task.projectId, name: task.projectName ?? "Linked project" }, ...projects]
      : projects;

  const projectItems: Record<string, string> = {
    [NO_PROJECT]: NO_PROJECT_LABEL,
    ...Object.fromEntries(projectOptions.map((p) => [p.id, p.name])),
  };

  async function saveTask() {
    setIsSaving(true);
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: draftStatus,
          type: draftType,
          startDate: draftStartDate,
          dueDate: draftDueDate,
          description: draftDescription,
          assigneeIds: draftAssigneeIds,
          projectId: draftProjectId === NO_PROJECT ? null : draftProjectId,
          documentIds: draftDocumentIds,
        }),
      });
      onClose();
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTask() {
    setIsSaving(true);
    try {
      await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      onClose();
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  const canDelete = task.createdById === currentMemberId || isAdmin;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">{task.title}</DialogTitle>
          <DialogDescription>
            {readOnly ? "Task details." : "Edit type, dates, status, assignees, and description."}
          </DialogDescription>
        </DialogHeader>

        {readOnly ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={task.status as TaskStatusValue} />
              <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-copy-secondary">
                {taskTypeLabel(task.type)}
              </span>
              {task.projectId && (
                <Link
                  href={`/projects/${task.projectId}`}
                  className="flex items-center gap-1 rounded-full bg-accent-dim px-2 py-0.5 text-xs font-semibold text-brand hover:underline"
                >
                  <FolderKanban className="h-3 w-3" />
                  {task.projectName ?? "Project"}
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className={FIELD_LABEL_CLASS}>Start</p>
                <p className="text-sm font-medium text-copy-primary">
                  {format(new Date(task.startDate), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
              <div>
                <p className={FIELD_LABEL_CLASS}>End</p>
                <p className="text-sm font-medium text-copy-primary">
                  {format(new Date(task.dueDate), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>

            <div>
              <p className={FIELD_LABEL_CLASS}>Description</p>
              <p className="text-sm text-copy-secondary">{task.description || "No description."}</p>
            </div>

            <div>
              <p className={FIELD_LABEL_CLASS}>Assignees</p>
              {task.assignees.length === 0 ? (
                <p className="text-sm text-copy-faint">Unassigned — group task.</p>
              ) : (
                <p className="text-sm font-medium text-copy-primary">
                  {task.assignees.map((a) => a.displayName).join(", ")}
                </p>
              )}
            </div>

            {task.documents.length > 0 && (
              <div>
                <p className={FIELD_LABEL_CLASS}>Related Documents</p>
                <ul className="space-y-1.5">
                  {task.documents.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`/docs/${doc.id}`}
                        className="flex items-center gap-2 text-sm font-medium text-brand hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {doc.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>Status</label>
                <Select
                  items={STATUS_ITEMS}
                  value={draftStatus}
                  onValueChange={(value) => setDraftStatus(value as TaskStatusValue)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODO">To Do</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="DONE">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Task Type</label>
                <Select
                  items={TASK_TYPE_ITEMS}
                  value={draftType}
                  onValueChange={(value) => value && setDraftType(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <DateTimePicker label="Start" value={draftStartDate} onChange={setDraftStartDate} required />
              <DateTimePicker label="End" value={draftDueDate} onChange={setDraftDueDate} required />
            </div>

            <div>
              <label className={FIELD_LABEL_CLASS}>Description</label>
              <Textarea
                rows={2}
                className="text-copy-primary!"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>Project (optional)</label>
                <Select
                  items={projectItems}
                  value={draftProjectId}
                  onValueChange={(value) => value && setDraftProjectId(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT}>{NO_PROJECT_LABEL}</SelectItem>
                    {projectOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {docs.length > 0 && (
                <div>
                  <p className={FIELD_LABEL_CLASS}>Related Documents (optional)</p>
                  <DocumentMultiSelect
                    docs={docs}
                    selectedIds={draftDocumentIds}
                    onChange={setDraftDocumentIds}
                    activeProjectId={draftProjectId === NO_PROJECT ? undefined : draftProjectId}
                  />
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-bold tracking-wide text-copy-primary uppercase">Assignees</p>
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-copy-primary">
                <Checkbox
                  checked={members.length > 0 && draftAssigneeIds.length === members.length}
                  onCheckedChange={() =>
                    setDraftAssigneeIds(
                      draftAssigneeIds.length === members.length ? [] : members.map((m) => m.id),
                    )
                  }
                />
                Select All (whole team — group task)
              </label>
              <div className="grid max-h-32 grid-cols-3 gap-2 overflow-y-auto border-t border-surface-border-subtle pt-2">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm text-copy-primary">
                    <Checkbox
                      checked={draftAssigneeIds.includes(m.id)}
                      onCheckedChange={() => toggleAssignee(m.id)}
                    />
                    {m.displayName}
                  </label>
                ))}
              </div>
              {draftAssigneeIds.length === 0 && (
                <p className="mt-2 text-xs font-medium text-error">
                  Select at least one assignee, or check Select All for a group task.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="justify-between">
          {canDelete ? (
            <Button variant="ghost" disabled={isSaving} onClick={deleteTask} className="text-error">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          {readOnly ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={saveTask}
                disabled={
                  isSaving || draftStartDate === "" || draftDueDate === "" || draftAssigneeIds.length === 0
                }
              >
                Save
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
