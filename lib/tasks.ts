/** Shared serialization for Task API responses — see 08-task-assignment.md. */
export interface SerializedTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  startDate: string;
  dueDate: string;
  createdById: string;
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
  startDate: Date;
  dueDate: Date;
  createdById: string;
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
    startDate: task.startDate.toISOString(),
    dueDate: task.dueDate.toISOString(),
    createdById: task.createdById,
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

// select, not a bare `member: true` include — serializeTask only ever
// reads id/displayName/avatarUrl off each assignee (same over-fetch as
// PROJECT_INCLUDE in lib/projects.ts — see that file's comment).
export const TASK_INCLUDE = {
  assignees: {
    include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
  },
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

export const TASK_TYPE_OPTIONS = [
  { value: "PITCHING", label: "Pitching" },
  { value: "DOCUMENTS", label: "Documents" },
  { value: "CREATIVES", label: "Creatives" },
  { value: "PRODUCTION", label: "Production" },
  { value: "QUALITY_ASSURANCE", label: "Quality Assurance" },
  { value: "MARKETING", label: "Marketing" },
  { value: "MODEL", label: "Model" },
] as const;
