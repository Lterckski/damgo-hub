import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { serializeTask, TASK_INCLUDE, TASK_TYPE_MAX_LENGTH } from "@/lib/tasks";
import { TASK_LINKABLE_PROJECT_STATUSES } from "@/lib/projects";
import { enqueueGoogleCalendarSync } from "@/lib/sync-calendar";
import type { TaskStatus } from "@/app/generated/prisma/enums";
import type { Prisma } from "@/app/generated/prisma/client";

const VALID_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

// PATCH /api/tasks/[taskId] — any authenticated member; updates
// title/description/status/type/startDate/dueDate/assignees. type,
// startDate, and dueDate are mandatory on the record, so a PATCH that
// includes one must supply a valid value — it can never be cleared to
// null/empty, only replaced.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [member, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);
  const { taskId } = await params;
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const body = await request.json();
  const { title, description, status, type, startDate, dueDate, assigneeIds, projectId, documentIds } = body;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (
    type !== undefined &&
    (typeof type !== "string" || type.trim() === "" || type.trim().length > TASK_TYPE_MAX_LENGTH)
  ) {
    return NextResponse.json(
      { error: `type must be ${TASK_TYPE_MAX_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }
  if (startDate !== undefined && Number.isNaN(Date.parse(startDate))) {
    return NextResponse.json({ error: "startDate must be a valid date" }, { status: 400 });
  }
  if (dueDate !== undefined && Number.isNaN(Date.parse(dueDate))) {
    return NextResponse.json({ error: "dueDate must be a valid date" }, { status: 400 });
  }
  if (assigneeIds !== undefined && !Array.isArray(assigneeIds)) {
    return NextResponse.json({ error: "assigneeIds must be an array" }, { status: 400 });
  }
  if (documentIds !== undefined && !Array.isArray(documentIds)) {
    return NextResponse.json({ error: "documentIds must be an array" }, { status: 400 });
  }

  // Same PROPOSED/ACTIVE-only rule as creation — see app/api/tasks/route.ts.
  let resolvedProjectId: string | null | undefined = undefined;
  if (projectId !== undefined) {
    if (projectId === null || projectId === "") {
      resolvedProjectId = null;
    } else {
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 400 });
      }
      if (
        !TASK_LINKABLE_PROJECT_STATUSES.includes(project.status as (typeof TASK_LINKABLE_PROJECT_STATUSES)[number])
      ) {
        return NextResponse.json(
          { error: "A task can only link to a Proposed or Active project" },
          { status: 400 },
        );
      }
      resolvedProjectId = projectId;
    }
  }

  const data: Prisma.TaskUpdateInput = {};
  if (typeof title === "string" && title.trim() !== "") data.title = title.trim();
  if (description !== undefined) {
    data.description =
      typeof description === "string" && description.trim() !== "" ? description.trim() : null;
  }
  if (status !== undefined) data.status = status;
  if (type !== undefined) data.type = type.trim();
  if (startDate !== undefined) data.startDate = new Date(startDate);
  if (dueDate !== undefined) data.dueDate = new Date(dueDate);
  if (resolvedProjectId !== undefined) {
    data.project = resolvedProjectId ? { connect: { id: resolvedProjectId } } : { disconnect: true };
  }

  // A regular member (not org:admin) can only ever add/remove *themselves*
  // as an assignee — never touch anyone else's assignment. Rather than
  // trusting whatever the client sent (or flatly rejecting it), reconcile
  // it against who's actually still assigned: every other existing
  // assignee is kept no matter what the non-admin submitted, and the only
  // thing their own submission can change is whether *they* are in the
  // set. Matches the read-only-except-yourself checklist in
  // task-detail-dialog.tsx.
  let resolvedAssigneeIds: string[] | undefined = assigneeIds as string[] | undefined;
  if (assigneeIds !== undefined && !isAdmin) {
    const currentAssignees = await prisma.taskAssignee.findMany({
      where: { taskId },
      select: { memberId: true },
    });
    const otherMemberIds = currentAssignees.map((a) => a.memberId).filter((id) => id !== member.id);
    const submittingSelf = (assigneeIds as string[]).includes(member.id);
    resolvedAssigneeIds = submittingSelf ? [...otherMemberIds, member.id] : otherMemberIds;
  }

  const task = await prisma.$transaction(async (tx) => {
    if (resolvedAssigneeIds !== undefined) {
      await tx.taskAssignee.deleteMany({ where: { taskId } });
      if (resolvedAssigneeIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: resolvedAssigneeIds.map((memberId) => ({ taskId, memberId })),
        });
      }
    }
    if (documentIds !== undefined) {
      await tx.taskDocument.deleteMany({ where: { taskId } });
      if ((documentIds as string[]).length > 0) {
        await tx.taskDocument.createMany({
          data: (documentIds as string[]).map((docId) => ({ taskId, docId })),
        });
      }
    }
    return tx.task.update({
      where: { id: taskId },
      data,
      include: TASK_INCLUDE,
    });
  });

  await enqueueGoogleCalendarSync("TASK", task.id);

  return NextResponse.json({ task: serializeTask(task) });
}

// DELETE /api/tasks/[taskId] — creator or an Admin only.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [member, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);
  const { taskId } = await params;

  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (existing.createdById !== member.id && !isAdmin) {
    return NextResponse.json(
      { error: "Only the creator or an Admin can delete this task" },
      { status: 403 },
    );
  }

  await prisma.task.delete({ where: { id: taskId } });
  await enqueueGoogleCalendarSync("TASK", taskId);
  return NextResponse.json({ ok: true });
}
