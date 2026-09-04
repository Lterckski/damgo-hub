import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { del, get, put } from "@vercel/blob";

import { hasVerifiedOrgMembership, memberHasRoomAccess } from "@/lib/board-access";
import { getCurrentMember } from "@/lib/current-member";
import { prisma } from "@/lib/prisma";

// Generic board save/load — see 15-board-autosave.md. Every collaborative
// board surface (roadmap, ideas) stores its React Flow nodes/edges as one
// JSON blob in Vercel Blob, with the returned blob pathname kept on
// whichever Prisma record owns that room. This route doesn't know or care
// about milestone/idea-specific shapes — `nodes`/`edges` pass through as
// opaque JSON, same as React Flow itself treats `data`.

type BoardOwner = { kind: "project"; projectId: string } | { kind: "ideas" };

// The single IdeasBoard row's fixed, known id — see 19-ideas-board.md and
// its own migration's seed insert. Never generated, always this literal.
const IDEAS_BOARD_ID = "ideas-board";

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

/**
 * One pointer read + compare-and-swap write per board surface, so PUT/GET
 * below don't have to branch on `owner.kind` at every step. `read()`
 * returns `null` for "the owning record itself doesn't exist" (only
 * possible for a project — the IdeasBoard singleton is always seeded) so
 * the caller can 404 distinctly from "no snapshot saved yet."
 */
interface SnapshotPointer {
  blobKeyPrefix: string;
  read(): Promise<{ exists: boolean; path: string | null }>;
  /** Compare-and-swap: succeeds only if the stored path still matches `previousPath`. */
  write(previousPath: string | null, newPath: string): Promise<boolean>;
}

function pointerFor(owner: BoardOwner): SnapshotPointer {
  if (owner.kind === "project") {
    return {
      blobKeyPrefix: `boards/project-${owner.projectId}`,
      async read() {
        const project = await prisma.project.findUnique({
          where: { id: owner.projectId },
          select: { roadmapSnapshotPath: true },
        });
        return project ? { exists: true, path: project.roadmapSnapshotPath } : { exists: false, path: null };
      },
      async write(previousPath, newPath) {
        const result = await prisma.project.updateMany({
          where: { id: owner.projectId, roadmapSnapshotPath: previousPath },
          data: { roadmapSnapshotPath: newPath },
        });
        return result.count === 1;
      },
    };
  }

  return {
    blobKeyPrefix: "boards/ideas",
    async read() {
      const board = await prisma.ideasBoard.findUnique({
        where: { id: IDEAS_BOARD_ID },
        select: { snapshotPath: true },
      });
      // Always seeded by its own migration — `exists: false` here would
      // mean the singleton row itself got deleted, not a normal state.
      return { exists: board !== null, path: board?.snapshotPath ?? null };
    },
    async write(previousPath, newPath) {
      const result = await prisma.ideasBoard.updateMany({
        where: { id: IDEAS_BOARD_ID, snapshotPath: previousPath },
        data: { snapshotPath: newPath },
      });
      return result.count === 1;
    },
  };
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

  const pointer = pointerFor(owner);
  const current = await pointer.read();
  if (!current.exists) {
    return NextResponse.json({ error: "Board owner not found" }, { status: 404 });
  }

  const previousPath = current.path;
  let blob: Awaited<ReturnType<typeof put>> | null = null;

  try {
    blob = await put(`${pointer.blobKeyPrefix}-${Date.now()}.json`, JSON.stringify(body), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: true,
    });

    // Compare-and-swap the pointer. If another save advanced it while this
    // request was uploading, this stale request must not move it backwards.
    const swapped = await pointer.write(previousPath, blob.pathname);

    if (!swapped) {
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

  const pointer = pointerFor(owner);
  const current = await pointer.read();
  if (!current.exists || !current.path) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  const blob = await get(current.path, { access: "private" });
  if (!blob?.stream) {
    // The DB points at a path Blob no longer has — treat as "nothing
    // saved" rather than failing the board load outright.
    return NextResponse.json({ nodes: [], edges: [] });
  }

  const text = await new Response(blob.stream).text();
  const snapshot = JSON.parse(text);
  return NextResponse.json({ nodes: snapshot.nodes ?? [], edges: snapshot.edges ?? [] });
}
