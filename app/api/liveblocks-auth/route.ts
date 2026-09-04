import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { getCurrentMember } from "@/lib/current-member";
import { cursorColorForMember, liveblocksClient } from "@/lib/liveblocks";
import { requireProjectAccess } from "@/lib/project-access";
import type { Member } from "@/app/generated/prisma/client";

/**
 * Confirms the signed-in user is still a member of their active Clerk
 * organization. This must run before `getCurrentMember()`, since that helper
 * creates a local profile and a local profile is not proof of org membership.
 */
async function hasVerifiedOrgMembership(userId: string, orgId: string): Promise<boolean> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    userId: [userId],
    limit: 1,
  });

  return data.some((membership) => membership.publicUserData?.userId === userId);
}

/**
 * Resolves a room ID to its collaboration surface and enforces that surface's
 * resource-level access rule.
 */
async function memberHasRoomAccess(room: string, member: Member): Promise<boolean> {
  if (room === "ideas") {
    // Single global room, no suffix — any authenticated member passes.
    return true;
  }

  if (room.startsWith("project:")) {
    const projectId = room.slice("project:".length);
    const access = await requireProjectAccess(projectId, member);
    return access !== null;
  }

  // An unrecognized prefix isn't a surface this app knows about — deny
  // by default rather than falling through to an implicit allow.
  return false;
}

/**
 * Authorizes a verified organization member for one Liveblocks room.
 * Liveblocks' client SDK calls this through its configured auth endpoint.
 */
export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!orgId || !(await hasVerifiedOrgMembership(userId, orgId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const room = body?.room;
  if (typeof room !== "string" || room === "") {
    return NextResponse.json({ error: "room is required" }, { status: 400 });
  }

  const member = await getCurrentMember();

  const hasAccess = await memberHasRoomAccess(room, member);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Access-token auth: the room's own defaultAccesses stays empty —
  // permission comes entirely from the session below, scoped to exactly
  // this one room, not any baked-in default on the room itself.
  await liveblocksClient.getOrCreateRoom(room, { defaultAccesses: [] });

  const session = liveblocksClient.prepareSession(member.id, {
    userInfo: {
      memberId: member.id,
      name: member.displayName,
      avatar: member.avatarUrl ?? "",
      color: cursorColorForMember(member.id),
    },
  });
  session.allow(room, ["room:write"]);

  const { status, body: responseBody } = await session.authorize();
  return new NextResponse(responseBody, { status });
}
