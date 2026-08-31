import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { pesosToCentavos } from "@/lib/currency";
import {
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_INCLUDE,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  serializeProject,
} from "@/lib/projects";
import type { ProjectCategory, ProjectPriority, ProjectStatus } from "@/app/generated/prisma/enums";
import type { Prisma } from "@/app/generated/prisma/client";

const VALID_STATUSES = PROJECT_STATUS_OPTIONS.map((option) => option.value);
const VALID_PRIORITIES = PROJECT_PRIORITY_OPTIONS.map((option) => option.value);
const VALID_CATEGORIES = PROJECT_CATEGORY_OPTIONS.map((option) => option.value);

// GET /api/projects — projects the current member owns or is assigned to;
// ?status= filter. "All Proposals" on the list page still calls this same
// route with no member restriction lifted — the endpoint itself always
// scopes to what the caller can see; see lib/project-access.ts.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await getCurrentMember();
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");

  if (statusParam && !VALID_STATUSES.includes(statusParam as ProjectStatus)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const where: Prisma.ProjectWhereInput = {
    OR: [{ ownerId: member.id }, { members: { some: { memberId: member.id } } }],
  };
  if (statusParam) where.status = statusParam as ProjectStatus;

  const projects = await prisma.project.findMany({
    where,
    include: PROJECT_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ projects: projects.map(serializeProject) });
}

// POST /api/projects — any authenticated member creates a proposal. Only
// `name` is required; everything else is optional or defaulted — see
// 11-project-proposals.md's Implementation Notes.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creator = await getCurrentMember();
  const body = await request.json();
  const {
    name,
    description,
    objectives,
    priority,
    category,
    startDate,
    targetEndDate,
    estimatedBudgetPesos,
    ownerId, // "Team Lead" — defaults to the creator, but the creator can pick someone else.
    memberIds,
    links,
  } = body;

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (priority !== undefined && !VALID_PRIORITIES.includes(priority as ProjectPriority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }
  if (category !== undefined && category !== null && !VALID_CATEGORIES.includes(category as ProjectCategory)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (startDate !== undefined && startDate !== null && Number.isNaN(Date.parse(startDate))) {
    return NextResponse.json({ error: "startDate must be a valid date" }, { status: 400 });
  }
  if (targetEndDate !== undefined && targetEndDate !== null && Number.isNaN(Date.parse(targetEndDate))) {
    return NextResponse.json({ error: "targetEndDate must be a valid date" }, { status: 400 });
  }
  if (
    estimatedBudgetPesos !== undefined &&
    estimatedBudgetPesos !== null &&
    (typeof estimatedBudgetPesos !== "number" || Number.isNaN(estimatedBudgetPesos) || estimatedBudgetPesos < 0)
  ) {
    return NextResponse.json({ error: "estimatedBudgetPesos must be a non-negative number" }, { status: 400 });
  }
  if (memberIds !== undefined && !Array.isArray(memberIds)) {
    return NextResponse.json({ error: "memberIds must be an array" }, { status: 400 });
  }
  if (links !== undefined && !Array.isArray(links)) {
    return NextResponse.json({ error: "links must be an array" }, { status: 400 });
  }

  // Team Lead: defaults to the creator, but the creator can hand it to
  // anyone — validate it's a real member rather than trusting the client.
  let resolvedOwnerId = creator.id;
  if (typeof ownerId === "string" && ownerId !== creator.id) {
    const ownerCandidate = await prisma.member.findUnique({ where: { id: ownerId } });
    if (!ownerCandidate) {
      return NextResponse.json({ error: "ownerId is not a real member" }, { status: 400 });
    }
    resolvedOwnerId = ownerCandidate.id;
  }

  // Team Members: exclude the resolved owner — they already have full
  // access as owner, a ProjectMember row for them would be redundant.
  const collaboratorIds = ((memberIds as string[]) ?? []).filter((id) => id !== resolvedOwnerId);

  const validLinks = ((links as { label?: unknown; url?: unknown }[]) ?? [])
    .filter((link) => typeof link.url === "string" && link.url.trim() !== "")
    .map((link) => ({
      label: typeof link.label === "string" && link.label.trim() !== "" ? link.label.trim() : "Link",
      url: (link.url as string).trim(),
    }));

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      description: typeof description === "string" && description.trim() !== "" ? description.trim() : null,
      objectives: typeof objectives === "string" && objectives.trim() !== "" ? objectives.trim() : null,
      priority: (priority as ProjectPriority) ?? "MEDIUM",
      category: typeof category === "string" ? (category as ProjectCategory) : null,
      startDate: startDate ? new Date(startDate) : null,
      targetEndDate: targetEndDate ? new Date(targetEndDate) : null,
      estimatedBudgetCentavos:
        typeof estimatedBudgetPesos === "number" ? pesosToCentavos(estimatedBudgetPesos) : null,
      ownerId: resolvedOwnerId,
      members: { create: collaboratorIds.map((memberId) => ({ memberId })) },
      links: { create: validLinks },
    },
    include: PROJECT_INCLUDE,
  });

  return NextResponse.json({ project: serializeProject(project) }, { status: 201 });
}
