import { entityVisibilityWhere } from "@/lib/hub/context";
import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { requireProjectAccess } from "@/lib/project-access";
import { PROJECT_INCLUDE, serializeProject } from "@/lib/projects";

// DELETE /api/projects/[projectId]/members/[memberId] — owner only; remove a collaborator.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; memberId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentMember = await getCurrentMember();
  const { projectId, memberId } = await params;
  const access = await requireProjectAccess(projectId, currentMember);
  if (!access) {
    return NextResponse.json(
      { error: "Not found or no access" },
      { status: 403 },
    );
  }
  if (access !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can remove collaborators" },
      { status: 403 },
    );
  }

  await prisma.projectMember.deleteMany({ where: { projectId, memberId } });

  const project = await prisma.project.findUniqueOrThrow({
    where: {
      ...{ id: projectId },
      AND: [await entityVisibilityWhere("project")],
    },
    include: PROJECT_INCLUDE,
  });

  return NextResponse.json({ project: serializeProject(project) });
}
