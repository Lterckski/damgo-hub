import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isCurrentMemberLeader } from "@/lib/current-member";
import { grantOrgAdmin, listOrgRoles, revokeOrgAdmin } from "@/lib/organization-roles";

// POST /api/members/[memberId]/assistant-leader — grant org:admin to this
// member. Leader only. There is only ever one Assistant Leader seat, so
// whoever currently holds it (if anyone, and it isn't the Leader) is
// demoted back to org:member first.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const isLeader = await isCurrentMemberLeader();
  if (!isLeader) {
    return NextResponse.json(
      { error: "Only the Leader can assign the Assistant Leader" },
      { status: 403 },
    );
  }

  const { memberId } = await params;
  const target = await prisma.member.findUnique({ where: { id: memberId } });

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (target.isLeader) {
    return NextResponse.json(
      { error: "The Leader already holds admin access" },
      { status: 400 },
    );
  }

  const [orgRoles, allMembers] = await Promise.all([
    listOrgRoles(),
    prisma.member.findMany(),
  ]);

  const currentAssistantLeader = allMembers.find(
    (m) => !m.isLeader && orgRoles.get(m.clerkUserId) === "org:admin",
  );

  if (currentAssistantLeader && currentAssistantLeader.id !== target.id) {
    await revokeOrgAdmin(currentAssistantLeader.clerkUserId);
  }

  await grantOrgAdmin(target.clerkUserId);

  return NextResponse.json({ assistantLeaderId: target.id });
}

// DELETE /api/members/[memberId]/assistant-leader — revoke org:admin from
// this member (demote to org:member, not removed from the org). Leader only.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const isLeader = await isCurrentMemberLeader();
  if (!isLeader) {
    return NextResponse.json(
      { error: "Only the Leader can revoke the Assistant Leader" },
      { status: 403 },
    );
  }

  const { memberId } = await params;
  const target = await prisma.member.findUnique({ where: { id: memberId } });

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (target.isLeader) {
    return NextResponse.json(
      { error: "Cannot revoke the Leader's admin access" },
      { status: 400 },
    );
  }

  await revokeOrgAdmin(target.clerkUserId);

  return NextResponse.json({ ok: true });
}
