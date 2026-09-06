"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

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
import { Input } from "@/components/ui/input";
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
import {
  TASK_PRIORITY_OPTIONS,
  TASK_TYPE_MAX_LENGTH,
  TASK_TYPE_OPTIONS,
  type TaskDocOption,
  type TaskMemberOption,
  type TaskProjectOption,
} from "@/lib/tasks";

const FIELD_LABEL_CLASS =
  "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";
const NO_PROJECT = "__none__";
const NO_PROJECT_LABEL = "Not part of a project / Standalone";
const CUSTOM_TYPE = "__custom__";
const CUSTOM_TYPE_LABEL = "Custom…";

// Base UI's <Select.Value> can only show the label for the current value
// once the popup has actually opened and registered its items — without an
// `items` map on <Select.Root>, it falls back to the raw value (a task type
// enum like "PITCHING", a sentinel like "__none__", or worse, a member's
// raw id) until then. Passing `items` fixes this on every Select in the
// app, not just this file — see the fix in every other Select usage too.
const TASK_TYPE_ITEMS = {
  ...Object.fromEntries(TASK_TYPE_OPTIONS.map((o) => [o.value, o.label])),
  [CUSTOM_TYPE]: CUSTOM_TYPE_LABEL,
};
const TASK_PRIORITY_ITEMS = Object.fromEntries(
  TASK_PRIORITY_OPTIONS.map((o) => [o.value, o.label]),
);

export interface NewTaskDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  members: TaskMemberOption[];
  projects: TaskProjectOption[];
  docs: TaskDocOption[];
  currentMemberId: string;
  isAdmin: boolean;
}

/**
 * "New Task" button + creation dialog — shared between `/tasks` and
 * `/calendar` (per the user's explicit request that task creation isn't
 * only reachable from the task board). See 08-task-assignment.md.
 *
 * Laid out wide (`sm:max-w-2xl`) with paired columns — Title/Type,
 * Start/End, Project/Documents — rather than one long single-column stack,
 * per the user's explicit request to fit more on one screen.
 */
export function NewTaskDialog({
  members,
  projects,
  docs,
  currentMemberId,
  isAdmin,
  open,
  onOpenChange,
}: NewTaskDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  function setIsOpen(value: boolean) {
    setInternalOpen(value);
    onOpenChange?.(value);
  }
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The `disabled` state on the submit button alone isn't airtight against
  // a fast double-click: there's a real gap between setIsSubmitting(true)
  // being called and React actually committing that to the DOM's disabled
  // attribute, and a second click landing inside that gap still reaches
  // this handler. A ref is checked/set synchronously, before any of that
  // render-timing gap exists, so a second concurrent call is refused
  // outright rather than racing on state.
  const isSubmittingRef = useRef(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>(TASK_TYPE_OPTIONS[0].value);
  const [customType, setCustomType] = useState("");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  // A regular member can only ever assign a task to themselves — never to
  // anyone else (the server enforces this too, see app/api/tasks/route.ts;
  // this is the matching UI so the control isn't misleading about what'll
  // actually happen). Admins keep the full picker.
  const [projectAudience, setProjectAudience] = useState(false);
  const [wholeOrg, setWholeOrg] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    isAdmin ? [] : [currentMemberId],
  );
  const [projectId, setProjectId] = useState<string>(NO_PROJECT);
  const [documentIds, setDocumentIds] = useState<string[]>([]);

  const projectItems: Record<string, string> = {
    [NO_PROJECT]: NO_PROJECT_LABEL,
    ...Object.fromEntries(projects.map((p) => [p.id, p.name])),
  };

  function resetForm() {
    setError(null);
    setProjectAudience(false);
    setWholeOrg(false);
    setTitle("");
    setType(TASK_TYPE_OPTIONS[0].value);
    setCustomType("");
    setPriority("MEDIUM");
    setStartDate("");
    setDueDate("");
    setAssigneeIds(isAdmin ? [] : [currentMemberId]);
    setProjectId(NO_PROJECT);
    setDocumentIds([]);
  }

  function toggleAssignee(memberId: string) {
    setProjectAudience(false);
    setWholeOrg(false);
    setAssigneeIds((prev) => {
      const set = new Set(prev);
      if (set.has(memberId)) set.delete(memberId);
      else set.add(memberId);
      return [...set];
    });
  }

  async function createTask(formData: FormData) {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      const description = formData.get("description");
      const finalType = type === CUSTOM_TYPE ? customType.trim() : type;
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          type: finalType,
          priority,
          startDate,
          dueDate,
          assigneeIds,
          visibilityScope: projectAudience
            ? "project"
            : wholeOrg
              ? "org"
              : "user",
          projectId: projectId === NO_PROJECT ? null : projectId,
          documentIds,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "Unable to create task");
      }
      if (response.ok) {
        setIsOpen(false);
        resetForm();
        router.refresh();
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to create task",
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {open === undefined && (
        <Button onClick={() => setIsOpen(true)}>
          <Plus className="h-4 w-4" /> New Task
        </Button>
      )}

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">
              New Task
            </DialogTitle>
            <DialogDescription>
              Create a task and assign it to one or more members.
            </DialogDescription>
          </DialogHeader>

          <form action={createTask} className="grid gap-4">
            {error && (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>
                  Title <span className="text-error">*</span>
                </label>
                <Input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-copy-primary!"
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>
                  Task Type <span className="text-error">*</span>
                </label>
                <Select
                  items={TASK_TYPE_ITEMS}
                  value={type}
                  onValueChange={(value) => value && setType(value)}
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
                    <SelectItem value={CUSTOM_TYPE}>
                      {CUSTOM_TYPE_LABEL}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {type === CUSTOM_TYPE && (
                  <Input
                    className="mt-2 text-copy-primary!"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                    placeholder="Describe the task type…"
                    maxLength={TASK_TYPE_MAX_LENGTH}
                    required
                  />
                )}
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL_CLASS}>
                Description (optional)
              </label>
              <Textarea
                name="description"
                rows={2}
                className="text-copy-primary!"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <DateTimePicker
                label="Start"
                value={startDate}
                onChange={setStartDate}
                required
              />
              <DateTimePicker
                label="End"
                value={dueDate}
                onChange={setDueDate}
                required
              />
              <div>
                <label className={FIELD_LABEL_CLASS}>Priority</label>
                <Select
                  items={TASK_PRIORITY_ITEMS}
                  value={priority}
                  onValueChange={(value) => value && setPriority(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>Project (optional)</label>
                <Select
                  items={projectItems}
                  value={projectId}
                  onValueChange={(value) => {
                    if (value) {
                      setProjectId(value);
                      setProjectAudience(false);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT}>
                      {NO_PROJECT_LABEL}
                    </SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projects.length === 0 && (
                  <p className="mt-1 text-xs text-copy-secondary">
                    No Proposed or Active projects to link to yet.
                  </p>
                )}
              </div>

              {docs.length > 0 && (
                <div>
                  <p className={FIELD_LABEL_CLASS}>
                    Related Documents (optional)
                  </p>
                  <DocumentMultiSelect
                    docs={docs}
                    selectedIds={documentIds}
                    onChange={setDocumentIds}
                    activeProjectId={
                      projectId === NO_PROJECT ? undefined : projectId
                    }
                  />
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-bold tracking-wide text-copy-primary uppercase">
                Assignees
              </p>
              {isAdmin ? (
                <>
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-copy-primary">
                    <Checkbox
                      checked={wholeOrg}
                      onCheckedChange={() => {
                        setProjectAudience(false);
                        setWholeOrg(!wholeOrg);
                        setAssigneeIds(
                          wholeOrg ? [] : members.map((m) => m.id),
                        );
                      }}
                    />
                    Select All (whole team — group task)
                  </label>
                  {projectId !== NO_PROJECT && (
                    <label className="mb-2 flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={projectAudience}
                        onCheckedChange={(value) => {
                          setProjectAudience(value === true);
                          setWholeOrg(false);
                          if (value) setAssigneeIds([currentMemberId]);
                        }}
                      />
                      Members of the selected project
                    </label>
                  )}
                  <div className="grid max-h-32 grid-cols-1 sm:grid-cols-3 gap-2 overflow-y-auto border-t border-surface-border-subtle pt-2">
                    {members.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 text-sm text-copy-primary"
                      >
                        <Checkbox
                          checked={assigneeIds.includes(m.id)}
                          onCheckedChange={() => toggleAssignee(m.id)}
                        />
                        {m.displayName}
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-copy-secondary">
                  Assigned to you — only Admins can assign tasks to other
                  members.
                </p>
              )}
              {assigneeIds.length === 0 && (
                <p className="mt-2 text-xs font-medium text-error">
                  Select at least one assignee, or check Select All for a group
                  task.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  title.trim() === "" ||
                  startDate === "" ||
                  dueDate === "" ||
                  assigneeIds.length === 0 ||
                  (type === CUSTOM_TYPE && customType.trim() === "")
                }
              >
                Create Task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
