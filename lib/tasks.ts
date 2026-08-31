/** Shared serialization for Task API responses — see 08-task-assignment.md. */
export interface SerializedTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  startDate: string;
  dueDate: string;
  createdById: string;
  createdByName: string;
  projectId: string | null;
  projectName: string | null;
  documents: { id: string; title: string }[];
  assignees: { id: string; displayName: string; avatarUrl: string | null }[];
  createdAt: string;
}

export function serializeTask(task: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  startDate: Date;
  dueDate: Date;
  createdById: string;
  createdBy: { displayName: string };
  projectId: string | null;
  project: { name: string } | null;
  relatedDocuments: { doc: { id: string; title: string } }[];
  createdAt: Date;
  assignees: { member: { id: string; displayName: string; avatarUrl: string | null } }[];
}): SerializedTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    type: task.type,
    priority: task.priority,
    startDate: task.startDate.toISOString(),
    dueDate: task.dueDate.toISOString(),
    createdById: task.createdById,
    createdByName: task.createdBy.displayName,
    projectId: task.projectId,
    projectName: task.project?.name ?? null,
    documents: task.relatedDocuments.map((rd) => ({ id: rd.doc.id, title: rd.doc.title })),
    assignees: task.assignees.map((a) => ({
      id: a.member.id,
      displayName: a.member.displayName,
      avatarUrl: a.member.avatarUrl,
    })),
    createdAt: task.createdAt.toISOString(),
  };
}

// select, not a bare `member: true` / `createdBy: true` include —
// serializeTask only ever reads id/displayName/avatarUrl off each
// assignee and displayName off createdBy (same over-fetch as
// PROJECT_INCLUDE in lib/projects.ts — see that file's comment).
// createdBy doubles as "assigned by" in the UI — this app has no separate
// "assigned by someone other than the creator" concept, whoever created
// the task is who assigned it (to themselves, if a regular member; to
// whoever they picked, if an admin — see the assignee-restriction rules
// in app/api/tasks/route.ts).
export const TASK_INCLUDE = {
  assignees: {
    include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
  },
  createdBy: { select: { displayName: true } },
  project: { select: { name: true } },
  relatedDocuments: { include: { doc: { select: { id: true, title: true } } } },
} as const;

/** A member as offered in the assignee picker — used by both /tasks and /calendar's task dialogs. */
export interface TaskMemberOption {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/** A project as offered in the task-linking dropdown — see 08-task-assignment.md. */
export interface TaskProjectOption {
  id: string;
  name: string;
}

/** A doc as offered in the related-documents picker — see 08-task-assignment.md. */
export interface TaskDocOption {
  id: string;
  title: string;
  projectId: string | null;
}

export function taskTypeLabel(type: string): string {
  return TASK_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

// A generous cap, not a real limit anyone should hit — just enough to stop
// a custom type from blowing out a task card/badge. See task.prisma: type
// is free text now, not the FunctionalRole enum.
export const TASK_TYPE_MAX_LENGTH = 40;

export const TASK_TYPE_OPTIONS = [
  { value: "PITCHING", label: "Pitching" },
  { value: "DOCUMENTS", label: "Documents" },
  { value: "CREATIVES", label: "Creatives" },
  { value: "PRODUCTION", label: "Production" },
  { value: "QUALITY_ASSURANCE", label: "Quality Assurance" },
  { value: "MARKETING", label: "Marketing" },
  { value: "MODEL", label: "Model" },
] as const;

export function taskPriorityLabel(priority: string): string {
  return TASK_PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
}

// Same LOW/MEDIUM/HIGH shape as Project priority (lib/projects.ts) — kept
// as its own enum/options rather than reusing ProjectPriority, since a
// task isn't a project and there's no reason a future divergence between
// the two (e.g. a task-specific "Urgent" tier) should be blocked by
// sharing one type.
export const TASK_PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
] as const;
