import { entityVisibilityWhere } from "@/lib/hub/context";
import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { requireProjectAccess } from "@/lib/project-access";
import { PROJECT_INCLUDE, serializeProject } from "@/lib/projects";

// POST /api/projects/[projectId]/members — owner only; assign a collaborator.
export async function POST(
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
      { error: "Only the owner can add collaborators" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { memberId } = body;
  if (typeof memberId !== "string" || memberId.trim() === "") {
    return NextResponse.json(
      { error: "memberId is required" },
      { status: 400 },
    );
  }

  await prisma.projectMember.upsert({
    where: { projectId_memberId: { projectId, memberId } },
    create: { projectId, memberId },
    update: {},
  });

  const project = await prisma.project.findUniqueOrThrow({
    where: {
      ...{ id: projectId },
      AND: [await entityVisibilityWhere("project")],
    },
    include: PROJECT_INCLUDE,
  });

  return NextResponse.json(
    { project: serializeProject(project) },
    { status: 201 },
  );
}
