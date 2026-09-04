import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember } from "@/lib/current-member";
import { cursorColorForMember, liveblocksClient } from "@/lib/liveblocks";
import { requireProjectAccess } from "@/lib/project-access";
import type { Member } from "@/app/generated/prisma/client";

// Resolves which surface a room ID belongs to from its prefix (see
// 12-liveblocks-setup.md's Room ID Convention) and checks access for that
// surface specifically — never a blanket "any authenticated member" for
// project/meeting rooms.
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

  if (room.startsWith("meeting:")) {
    // 16-meeting-scheduling.md doesn't exist yet, so there's no
    // participant list to check against — any authenticated member
    // passes until then, exactly as this unit's spec calls for.
    return true;
  }

  // An unrecognized prefix isn't a surface this app knows about — deny
  // by default rather than falling through to an implicit allow.
  return false;
}

// POST /api/liveblocks-auth — Liveblocks' client SDK calls this itself
// (via the `authEndpoint` option passed to createClient/RoomProvider in
// whichever surface is actually using a room) whenever a member tries to
// enter one. See 12-liveblocks-setup.md.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
