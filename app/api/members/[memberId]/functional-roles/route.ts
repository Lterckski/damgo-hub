import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isCurrentMemberAdmin } from "@/lib/current-member";

const VALID_ROLES = new Set([
  "PITCHING",
  "DOCUMENTS",
  "CREATIVES",
  "PRODUCTION",
  "QUALITY_ASSURANCE",
  "MARKETING",
  "MODEL",
]);

// PATCH /api/members/[memberId]/functional-roles — replace a member's
// Member Role tag set. org:admin only (Leader or Assistant Leader).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
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
      { error: `roles must be an array drawn from: ${[...VALID_ROLES].join(", ")}` },
      { status: 400 },
    );
  }

  const uniqueRoles = [...new Set(roles)] as (
    | "PITCHING"
    | "DOCUMENTS"
    | "CREATIVES"
    | "PRODUCTION"
    | "QUALITY_ASSURANCE"
    | "MARKETING"
    | "MODEL"
  )[];

  await prisma.$transaction([
    prisma.memberFunctionalRole.deleteMany({ where: { memberId } }),
    prisma.memberFunctionalRole.createMany({
      data: uniqueRoles.map((role) => ({ memberId, role })),
    }),
  ]);

  return NextResponse.json({ functionalRoles: uniqueRoles });
}
