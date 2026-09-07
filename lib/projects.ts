/** Shared serialization for Project API responses — see 11-project-proposals.md. */
export interface ProjectMemberOption {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SerializedProjectLink {
  id: string;
  label: string;
  url: string;
}

export interface SerializedProject {
  id: string;
  name: string;
  description: string | null;
  objectives: string | null;
  status: string;
  priority: string;
  category: string | null;
  startDate: string | null;
  targetEndDate: string | null;
  estimatedBudgetCentavos: number | null;
  ownerId: string;
  ownerName: string;
  members: ProjectMemberOption[];
  links: SerializedProjectLink[];
  createdAt: string;
  updatedAt: string;
}

// select, not include — every caller only ever reads owner.displayName and
// member.{id,displayName,avatarUrl} (see serializeProject below), but a
// bare `true` include was pulling every column on Member (email, org
// roles, functional roles, work-distribution roles, ...) for the owner and
// every collaborator on every project fetched. This is on the hot path for
// both /projects (many projects x many members) and the project detail
// page, so trimming it cuts real payload/DB work on every load with zero
// behavior change.
export const PROJECT_INCLUDE = {
  owner: { select: { displayName: true } },
  members: {
    include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
  },
  links: { orderBy: { createdAt: "asc" } },
} as const;

export function serializeProject(project: {
  id: string;
  name: string;
  description: string | null;
  objectives: string | null;
  status: string;
  priority: string;
  category: string | null;
  startDate: Date | null;
  targetEndDate: Date | null;
  estimatedBudgetCentavos: number | null;
  ownerId: string;
  owner: { displayName: string };
  members: { member: { id: string; displayName: string; avatarUrl: string | null } }[];
  links: { id: string; label: string; url: string }[];
  createdAt: Date;
  updatedAt: Date;
}): SerializedProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    objectives: project.objectives,
    status: project.status,
    priority: project.priority,
    category: project.category,
    startDate: project.startDate ? project.startDate.toISOString() : null,
    targetEndDate: project.targetEndDate ? project.targetEndDate.toISOString() : null,
    estimatedBudgetCentavos: project.estimatedBudgetCentavos,
    ownerId: project.ownerId,
    ownerName: project.owner.displayName,
    members: project.members.map((m) => ({
      id: m.member.id,
      displayName: m.member.displayName,
      avatarUrl: m.member.avatarUrl,
    })),
    links: project.links.map((l) => ({ id: l.id, label: l.label, url: l.url })),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export const PROJECT_STATUS_OPTIONS = [
  { value: "PROPOSED", label: "Proposed" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "REJECTED", label: "Rejected" },
] as const;

// The statuses an owner may set directly. Approval (ACTIVE) and rejection
// (REJECTED) are admin decisions and are deliberately absent — they move
// only through lib/project-decisions.ts. See 11-project-proposals.md.
export const OWNER_SETTABLE_PROJECT_STATUSES = [
  "COMPLETED",
  "ARCHIVED",
] as const;

// Statuses that mean "an admin has decided this proposal", either way.
export const DECIDED_PROJECT_STATUSES = ["ACTIVE", "REJECTED"] as const;

export function projectStatusLabel(status: string): string {
  return PROJECT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

// Statuses a Task is allowed to link to — PROPOSED and ACTIVE only, per the
// user's explicit call: a task can be assigned against a proposal that
// hasn't formally kicked off yet, but not against something COMPLETED or
// ARCHIVED. See 08-task-assignment.md.
export const TASK_LINKABLE_PROJECT_STATUSES = ["PROPOSED", "ACTIVE"] as const;

export const PROJECT_PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
] as const;

export function projectPriorityLabel(priority: string): string {
  return PROJECT_PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
}

// "adjust options to fit our use case" — a hackathon team's actual
// proposals, not a generic PM taxonomy.
export const PROJECT_CATEGORY_OPTIONS = [
  { value: "FEATURE", label: "Feature" },
  { value: "RESEARCH", label: "Research" },
  { value: "INTERNAL_TOOL", label: "Internal Tool" },
  { value: "HACKATHON_ENTRY", label: "Hackathon Entry" },
  { value: "OTHER", label: "Other" },
] as const;

export function projectCategoryLabel(category: string): string {
  return PROJECT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}
