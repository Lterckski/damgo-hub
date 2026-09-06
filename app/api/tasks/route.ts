import { taskInclude } from "@/lib/hub/task-include";
import { entityVisibilityWhere } from "@/lib/hub/context";
import { taskVisibilityWhere } from "@/lib/hub/context";
import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import {
  serializeTask,
  TASK_PRIORITY_OPTIONS,
  TASK_TYPE_MAX_LENGTH,
} from "@/lib/tasks";
import { TASK_LINKABLE_PROJECT_STATUSES } from "@/lib/projects";
import { enqueueGoogleCalendarSync } from "@/lib/sync-calendar";
import type { TaskPriority, TaskStatus } from "@/app/generated/prisma/enums";
import type { Prisma } from "@/app/generated/prisma/client";

const VALID_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const VALID_PRIORITIES = TASK_PRIORITY_OPTIONS.map((option) => option.value);

// GET /api/tasks — any authenticated member; ?assignee=me, ?projectId=,
// ?status= filters.
export async function GET(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const assignee = searchParams.get("assignee");
  const projectId = searchParams.get("projectId");
  const statusParam = searchParams.get("status");

  if (statusParam && !VALID_STATUSES.includes(statusParam as TaskStatus)) {
    return NextResponse.json(
      { error: "Invalid status filter" },
      { status: 400 },
    );
  }

  const where: Prisma.TaskWhereInput = {};
  if (statusParam) where.status = statusParam as TaskStatus;
  if (projectId) where.projectId = projectId;
  if (assignee === "me") {
    const member = await getCurrentMember();
    where.assignees = { some: { memberId: member.id } };
  }

  const tasks = await prisma.task.findMany({
    where: { AND: [await taskVisibilityWhere(), where] },
    include: await taskInclude(),
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tasks: tasks.map(serializeTask) });
}

// POST /api/tasks — any authenticated member creates a task with initial
// assignees. title, type, startDate, and dueDate are all mandatory — see
// 08-task-assignment.md.
export async function POST(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [creator, isAdmin] = await Promise.all([
    getCurrentMember(),
    isCurrentMemberAdmin(),
  ]);
  const body = await request.json();
  const {
    title,
    description,
    type,
    priority,
    startDate,
    dueDate,
    assigneeIds,
    projectId,
    documentIds,
  } = body;

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  // type is free text now (a preset label or a custom one — see
  // task.prisma), just non-empty and capped so a custom label can't blow
  // out task cards/badges elsewhere.
  if (
    typeof type !== "string" ||
    type.trim() === "" ||
    type.trim().length > TASK_TYPE_MAX_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `type is required and must be ${TASK_TYPE_MAX_LENGTH} characters or fewer`,
      },
      { status: 400 },
    );
  }
  if (typeof startDate !== "string" || Number.isNaN(Date.parse(startDate))) {
    return NextResponse.json(
      { error: "startDate is required and must be a valid date" },
      { status: 400 },
    );
  }
  if (typeof dueDate !== "string" || Number.isNaN(Date.parse(dueDate))) {
    return NextResponse.json(
      { error: "dueDate is required and must be a valid date" },
      { status: 400 },
    );
  }
  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }
  if (assigneeIds !== undefined && !Array.isArray(assigneeIds)) {
    return NextResponse.json(
      { error: "assigneeIds must be an array" },
      { status: 400 },
    );
  }
  if (documentIds !== undefined && !Array.isArray(documentIds)) {
    return NextResponse.json(
      { error: "documentIds must be an array" },
      { status: 400 },
    );
  }

  // A task can only link to a PROPOSED or ACTIVE project — not a
  // COMPLETED/ARCHIVED one — per the user's explicit call. See
  // lib/projects.ts's TASK_LINKABLE_PROJECT_STATUSES.
  let resolvedProjectId: string | null = null;
  if (typeof projectId === "string" && projectId !== "") {
    const project = await prisma.project.findUnique({
      where: {
        ...{ id: projectId },
        AND: [await entityVisibilityWhere("project")],
      },
      select: { status: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 400 });
    }
    if (
      !TASK_LINKABLE_PROJECT_STATUSES.includes(
        project.status as (typeof TASK_LINKABLE_PROJECT_STATUSES)[number],
      )
    ) {
      return NextResponse.json(
        { error: "A task can only link to a Proposed or Active project" },
        { status: 400 },
      );
    }
    resolvedProjectId = projectId;
  }

  // A regular member (not org:admin) can only ever assign a task to
  // themselves — never to anyone else. Enforced here regardless of what
  // the client actually sent, not just hidden in the UI (see
  // new-task-dialog.tsx for the matching UI restriction).
  if (
    body.visibilityScope !== undefined &&
    !["user", "org", "project"].includes(body.visibilityScope)
  )
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  const visibilityScope = isAdmin ? (body.visibilityScope ?? "user") : "user";
  if (visibilityScope === "project" && !resolvedProjectId)
    return NextResponse.json({ error: "Project required" }, { status: 400 });
  const resolvedAssigneeIds = isAdmin
    ? ((assigneeIds as string[]) ?? [])
    : [creator.id];

  if (
    resolvedAssigneeIds.some((id) => typeof id !== "string") ||
    new Set(resolvedAssigneeIds).size !== resolvedAssigneeIds.length
  )
    return NextResponse.json(
      { error: "Choose distinct organization members" },
      { status: 400 },
    );
  const validAssignees = await prisma.hubMembership.count({
    where: { memberId: { in: resolvedAssigneeIds } },
  });
  if (
    validAssignees !== resolvedAssigneeIds.length ||
    (visibilityScope === "user" && resolvedAssigneeIds.length === 0)
  )
    return NextResponse.json(
      { error: "Choose at least one current organization member" },
      { status: 400 },
    );
  const task = await prisma.task.create({
    data: {
      visibilityScope,
      title: title.trim(),
      description:
        typeof description === "string" && description.trim() !== ""
          ? description.trim()
          : null,
      type: type.trim(),
      priority: (priority as TaskPriority | undefined) ?? "MEDIUM",
      startDate: new Date(startDate),
      dueDate: new Date(dueDate),
      createdById: creator.id,
      projectId: resolvedProjectId,
      assignees: {
        create: resolvedAssigneeIds.map((memberId) => ({ memberId })),
      },
      relatedDocuments: {
        create: ((documentIds as string[]) ?? []).map((docId) => ({ docId })),
      },
    },
    include: await taskInclude(),
  });

  await enqueueGoogleCalendarSync("TASK", task.id);

  return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
}
