import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { serializeTask, TASK_INCLUDE, TASK_TYPE_OPTIONS } from "@/lib/tasks";
import { TASK_LINKABLE_PROJECT_STATUSES } from "@/lib/projects";
import { enqueueGoogleCalendarSync } from "@/lib/sync-calendar";
import type { FunctionalRole, TaskStatus } from "@/app/generated/prisma/enums";
import type { Prisma } from "@/app/generated/prisma/client";

const VALID_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const VALID_TYPES = TASK_TYPE_OPTIONS.map((option) => option.value);

// GET /api/tasks — any authenticated member; ?assignee=me, ?projectId=,
// ?status= filters.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const assignee = searchParams.get("assignee");
  const projectId = searchParams.get("projectId");
  const statusParam = searchParams.get("status");

  if (statusParam && !VALID_STATUSES.includes(statusParam as TaskStatus)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const where: Prisma.TaskWhereInput = {};
  if (statusParam) where.status = statusParam as TaskStatus;
  if (projectId) where.projectId = projectId;
  if (assignee === "me") {
    const member = await getCurrentMember();
    where.assignees = { some: { memberId: member.id } };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: TASK_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tasks: tasks.map(serializeTask) });
}

// POST /api/tasks — any authenticated member creates a task with initial
// assignees. title, type, startDate, and dueDate are all mandatory — see
// 08-task-assignment.md.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creator = await getCurrentMember();
  const body = await request.json();
  const { title, description, type, startDate, dueDate, assigneeIds, projectId, documentIds } = body;

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as FunctionalRole)) {
    return NextResponse.json({ error: "type is required and must be a valid task type" }, { status: 400 });
  }
  if (typeof startDate !== "string" || Number.isNaN(Date.parse(startDate))) {
    return NextResponse.json({ error: "startDate is required and must be a valid date" }, { status: 400 });
  }
  if (typeof dueDate !== "string" || Number.isNaN(Date.parse(dueDate))) {
    return NextResponse.json({ error: "dueDate is required and must be a valid date" }, { status: 400 });
  }
  if (assigneeIds !== undefined && !Array.isArray(assigneeIds)) {
    return NextResponse.json({ error: "assigneeIds must be an array" }, { status: 400 });
  }
  if (documentIds !== undefined && !Array.isArray(documentIds)) {
    return NextResponse.json({ error: "documentIds must be an array" }, { status: 400 });
  }

  // A task can only link to a PROPOSED or ACTIVE project — not a
  // COMPLETED/ARCHIVED one — per the user's explicit call. See
  // lib/projects.ts's TASK_LINKABLE_PROJECT_STATUSES.
  let resolvedProjectId: string | null = null;
  if (typeof projectId === "string" && projectId !== "") {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 400 });
    }
    if (!TASK_LINKABLE_PROJECT_STATUSES.includes(project.status as (typeof TASK_LINKABLE_PROJECT_STATUSES)[number])) {
      return NextResponse.json(
        { error: "A task can only link to a Proposed or Active project" },
        { status: 400 },
      );
    }
    resolvedProjectId = projectId;
  }

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: typeof description === "string" && description.trim() !== "" ? description.trim() : null,
      type: type as FunctionalRole,
      startDate: new Date(startDate),
      dueDate: new Date(dueDate),
      createdById: creator.id,
      projectId: resolvedProjectId,
      assignees: {
        create: ((assigneeIds as string[]) ?? []).map((memberId) => ({ memberId })),
      },
      relatedDocuments: {
        create: ((documentIds as string[]) ?? []).map((docId) => ({ docId })),
      },
    },
    include: TASK_INCLUDE,
  });

  await enqueueGoogleCalendarSync("TASK", task.id);

  return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
}
