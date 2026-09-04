import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { del, get, put } from "@vercel/blob";

import { hasVerifiedOrgMembership, memberHasRoomAccess } from "@/lib/board-access";
import { getCurrentMember } from "@/lib/current-member";
import { prisma } from "@/lib/prisma";

// Generic board save/load — see 15-board-autosave.md. Every collaborative
// board surface (roadmap now, ideas later) stores its React Flow
// nodes/edges as one JSON blob in Vercel Blob, with the returned blob
// pathname kept on whichever Prisma record owns that room. This route
// doesn't know or care about milestone-specific shapes — `nodes`/`edges`
// pass through as opaque JSON, same as React Flow itself treats `data`.

type BoardOwner = { kind: "project"; projectId: string } | { kind: "ideas" };

/**
 * Resolves a room ID to the Prisma record that owns its saved snapshot.
 * Mirrors the room ID convention `memberHasRoomAccess` already enforces —
 * kept separate from it because "which surface is this" and "does the
 * caller have access to it" are different questions, and the snapshot
 * route needs the former to find a record to read/write, not just a
 * yes/no answer.
 */
function resolveBoardOwner(room: string): BoardOwner | null {
  if (room === "ideas") return { kind: "ideas" };
  if (room.startsWith("project:")) return { kind: "project", projectId: room.slice("project:".length) };
  return null;
}

async function deleteSnapshotBlob(pathname: string) {
  try {
    await del(pathname);
  } catch (error) {
    console.error("Failed to delete board snapshot Blob", { pathname, error });
  }
}

async function authorizeRoom(room: string) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  if (!orgId || !(await hasVerifiedOrgMembership(userId, orgId))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }

  const member = await getCurrentMember();
  if (!(await memberHasRoomAccess(room, member))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }

  const owner = resolveBoardOwner(room);
  if (!owner) {
    return { error: NextResponse.json({ error: "Unknown room" }, { status: 404 }) } as const;
  }

  return { member, owner } as const;
}

// PUT /api/boards/[roomId]/snapshot — save the latest board JSON.
export async function PUT(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const authResult = await authorizeRoom(roomId);
  if ("error" in authResult) return authResult.error;
  const { owner } = authResult;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    return NextResponse.json({ error: "nodes and edges arrays are required" }, { status: 400 });
  }

  if (owner.kind === "ideas") {
    // 19-ideas-board.md doesn't exist yet — no owning record to save
    // against. Room-access already passed, so this is a "not built yet"
    // response, not an authorization failure.
    return NextResponse.json({ error: "Ideas board autosave isn't wired up yet" }, { status: 501 });
  }

  const project = await prisma.project.findUnique({
    where: { id: owner.projectId },
    select: { roadmapSnapshotPath: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const previousPath = project.roadmapSnapshotPath;
  let blob: Awaited<ReturnType<typeof put>> | null = null;

  try {
    blob = await put(`boards/project-${owner.projectId}-${Date.now()}.json`, JSON.stringify(body), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: true,
    });

    // Compare-and-swap the pointer. If another save advanced it while this
    // request was uploading, this stale request must not move it backwards.
    const replacement = await prisma.project.updateMany({
      where: { id: owner.projectId, roadmapSnapshotPath: previousPath },
      data: { roadmapSnapshotPath: blob.pathname },
    });

    if (replacement.count !== 1) {
      await deleteSnapshotBlob(blob.pathname);
      return NextResponse.json({ error: "A newer board snapshot was already saved" }, { status: 409 });
    }
  } catch (error) {
    if (blob) await deleteSnapshotBlob(blob.pathname);
    throw error;
  }

  // The new pointer is committed before the old object is reclaimed, so a
  // failed upload or losing concurrent save can never strand the database.
  if (previousPath) await deleteSnapshotBlob(previousPath);

  return NextResponse.json({ ok: true });
}

// GET /api/boards/[roomId]/snapshot — load the last saved board JSON, or an
// empty board if nothing has been saved yet.
export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const authResult = await authorizeRoom(roomId);
  if ("error" in authResult) return authResult.error;
  const { owner } = authResult;

  if (owner.kind === "ideas") {
    return NextResponse.json({ error: "Ideas board autosave isn't wired up yet" }, { status: 501 });
  }

  const project = await prisma.project.findUnique({
    where: { id: owner.projectId },
    select: { roadmapSnapshotPath: true },
  });

  if (!project?.roadmapSnapshotPath) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  const blob = await get(project.roadmapSnapshotPath, { access: "private" });
  if (!blob?.stream) {
    // The DB points at a path Blob no longer has — treat as "nothing
    // saved" rather than failing the board load outright.
    return NextResponse.json({ nodes: [], edges: [] });
  }

  const text = await new Response(blob.stream).text();
  const snapshot = JSON.parse(text);
  return NextResponse.json({ nodes: snapshot.nodes ?? [], edges: snapshot.edges ?? [] });
}
