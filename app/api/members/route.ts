import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { listOrgRoles } from "@/lib/organization-roles";

// GET /api/members — list every member with their live Clerk org role,
// isLeader, and functional/work-distribution tags. Any authenticated
// member can read this; only org:admin can mutate (see the other routes
// under app/api/members/[memberId]/*).
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgRoles = await listOrgRoles();
  const members = await prisma.member.findMany({
    where: { clerkUserId: { in: [...orgRoles.keys()] } },
    include: { functionalRoles: true, workDistributionRoles: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    members: members.map((member) => ({
      id: member.id,
      clerkUserId: member.clerkUserId,
      email: member.email,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      status: member.status,
      isLeader: member.isLeader,
      orgRole: orgRoles.get(member.clerkUserId) ?? "org:member",
      functionalRoles: member.functionalRoles.map((r) => r.role),
      workDistributionRoles: member.workDistributionRoles.map((r) => r.role),
      createdAt: member.createdAt,
    })),
  });
}
