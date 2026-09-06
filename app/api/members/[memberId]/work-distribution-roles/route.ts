import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isCurrentMemberAdmin } from "@/lib/current-member";

// Only these two are freely assignable tags — "Leader / Secretariat /
// Finance" and "Assistant Leader" are derived labels (isLeader + Clerk
// org:admin), never stored rows. See architecture-context.md.
const VALID_ROLES = new Set(["HACKATHON_HUNTER", "PROJECT_SCAVENGER_CREATOR"]);

// PATCH /api/members/[memberId]/work-distribution-roles — replace a
// member's Work Distribution tag set. org:admin only.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const isAdmin = await isCurrentMemberAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { memberId } = await params;
  const body = await request.json().catch(() => null);
  const roles = body?.roles;

  if (
    !Array.isArray(roles) ||
    !roles.every((role) => typeof role === "string" && VALID_ROLES.has(role))
  ) {
    return NextResponse.json(
      {
        error: `roles must be an array drawn from: ${[...VALID_ROLES].join(", ")}`,
      },
      { status: 400 },
    );
  }

  const uniqueRoles = [...new Set(roles)] as (
    | "HACKATHON_HUNTER"
    | "PROJECT_SCAVENGER_CREATOR"
  )[];

  await prisma.$transaction([
    prisma.memberWorkDistributionRole.deleteMany({ where: { memberId } }),
    prisma.memberWorkDistributionRole.createMany({
      data: uniqueRoles.map((role) => ({ memberId, role })),
    }),
  ]);

  return NextResponse.json({ workDistributionRoles: uniqueRoles });
}
