import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import { requireMember, toggleIdeaVote } from "@/lib/dashboard/mutations";

// POST /api/dashboard/ideas — toggle this member's upvote on one idea.
//
// The id is a Liveblocks canvas node id, not a database key: idea notes
// live on the board, only their votes are in Postgres (see
// prisma/models/idea-vote.prisma). Nothing validates that the node still
// exists — the read path drops votes whose note is gone, which is cheaper
// than a Blob round-trip on every click.
export async function POST(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const outcome = await toggleIdeaVote(
    guard.member,
    (body as Record<string, unknown>).ideaNodeId,
  );
  if (!outcome.ok)
    return NextResponse.json(
      { error: outcome.error },
      { status: outcome.status },
    );
  return NextResponse.json({ ok: true, message: outcome.message });
}
