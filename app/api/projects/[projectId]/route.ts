import { entityVisibilityWhere } from "@/lib/hub/context";
import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { pesosToCentavos } from "@/lib/currency";
import { requireProjectAccess } from "@/lib/project-access";
import {
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_INCLUDE,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  serializeProject,
} from "@/lib/projects";
import type {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
} from "@/app/generated/prisma/enums";

const VALID_STATUSES = PROJECT_STATUS_OPTIONS.map((option) => option.value);
const VALID_PRIORITIES = PROJECT_PRIORITY_OPTIONS.map((option) => option.value);
const VALID_CATEGORIES = PROJECT_CATEGORY_OPTIONS.map((option) => option.value);

// GET /api/projects/[projectId] — requires owner or collaborator access.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await getCurrentMember();
  const { projectId } = await params;
  const access = await requireProjectAccess(projectId, member);
  if (!access) {
    return NextResponse.json(
      { error: "Not found or no access" },
      { status: 403 },
    );
  }

  const project = await prisma.project.findUnique({
    where: {
      ...{ id: projectId },
      AND: [await entityVisibilityWhere("project")],
    },
    include: PROJECT_INCLUDE,
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project: serializeProject(project) });
}

// PATCH /api/projects/[projectId] — owner only; rename/describe/change
// status plus the rest of the proposal fields added alongside the New
// Proposal form (objectives, priority, category, timeline, budget). Team
// Lead (ownerId) and Supporting Links aren't editable here — reassigning
// ownership and managing links stay creation-time/dedicated-route concerns,
// not folded into this general update, per 11-project-proposals.md's
// Implementation Notes.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await getCurrentMember();
  const { projectId } = await params;
  const access = await requireProjectAccess(projectId, member);
  if (!access) {
    return NextResponse.json(
      { error: "Not found or no access" },
      { status: 403 },
    );
  }
  if (access !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can edit this project" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const {
    name,
    description,
    objectives,
    status,
    priority,
    category,
    startDate,
    targetEndDate,
    estimatedBudgetPesos,
  } = body;

  if (
    status !== undefined &&
    !VALID_STATUSES.includes(status as ProjectStatus)
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (
    priority !== undefined &&
    !VALID_PRIORITIES.includes(priority as ProjectPriority)
  ) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }
  if (
    category !== undefined &&
    category !== null &&
    !VALID_CATEGORIES.includes(category as ProjectCategory)
  ) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (
    startDate !== undefined &&
    startDate !== null &&
    Number.isNaN(Date.parse(startDate))
  ) {
    return NextResponse.json(
      { error: "startDate must be a valid date" },
      { status: 400 },
    );
  }
  if (
    targetEndDate !== undefined &&
    targetEndDate !== null &&
    Number.isNaN(Date.parse(targetEndDate))
  ) {
    return NextResponse.json(
      { error: "targetEndDate must be a valid date" },
      { status: 400 },
    );
  }
  if (
    estimatedBudgetPesos !== undefined &&
    estimatedBudgetPesos !== null &&
    (typeof estimatedBudgetPesos !== "number" ||
      Number.isNaN(estimatedBudgetPesos) ||
      estimatedBudgetPesos < 0)
  ) {
    return NextResponse.json(
      { error: "estimatedBudgetPesos must be a non-negative number" },
      { status: 400 },
    );
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(typeof name === "string" && name.trim() !== ""
        ? { name: name.trim() }
        : {}),
      ...(typeof description === "string"
        ? { description: description.trim() === "" ? null : description.trim() }
        : {}),
      ...(typeof objectives === "string"
        ? { objectives: objectives.trim() === "" ? null : objectives.trim() }
        : {}),
      ...(typeof status === "string"
        ? { status: status as ProjectStatus }
        : {}),
      ...(typeof priority === "string"
        ? { priority: priority as ProjectPriority }
        : {}),
      ...(category !== undefined
        ? { category: (category as ProjectCategory) ?? null }
        : {}),
      ...(startDate !== undefined
        ? { startDate: startDate ? new Date(startDate) : null }
        : {}),
      ...(targetEndDate !== undefined
        ? { targetEndDate: targetEndDate ? new Date(targetEndDate) : null }
        : {}),
      ...(estimatedBudgetPesos !== undefined
        ? {
            estimatedBudgetCentavos:
              typeof estimatedBudgetPesos === "number"
                ? pesosToCentavos(estimatedBudgetPesos)
                : null,
          }
        : {}),
    },
    include: PROJECT_INCLUDE,
  });

  return NextResponse.json({ project: serializeProject(project) });
}

// DELETE /api/projects/[projectId] — owner only.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await getCurrentMember();
  const { projectId } = await params;
  const access = await requireProjectAccess(projectId, member);
  if (!access) {
    return NextResponse.json(
      { error: "Not found or no access" },
      { status: 403 },
    );
  }
  if (access !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can delete this project" },
      { status: 403 },
    );
  }

  await prisma.project.delete({ where: { id: projectId } });
  return NextResponse.json({ ok: true });
}
