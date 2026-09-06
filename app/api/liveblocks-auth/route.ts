import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  hasVerifiedOrgMembership,
  memberHasRoomAccess,
} from "@/lib/board-access";
import { getCurrentMember } from "@/lib/current-member";
import { cursorColorForMember, liveblocksClient } from "@/lib/liveblocks";

/**
 * Authorizes a verified organization member for one Liveblocks room.
 * Liveblocks' client SDK calls this through its configured auth endpoint.
 */
export async function POST(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

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
