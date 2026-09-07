import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin/guard";
import { hubApiGuard } from "@/lib/hub/context";
import { decideProject } from "@/lib/project-decisions";

/**
 * POST /api/projects/[projectId]/decision — Admin only.
 *
 * Approve or reject a `PROPOSED` project. This is the only route that can
 * move a proposal to ACTIVE or REJECTED; the owner's own PATCH refuses both
 * (see 11-project-proposals.md — Proposal Approval Flow).
 *
 * `requireAdmin()` re-derives the Clerk role per request and honours the
 * "View as member" toggle, so an admin simulating a member is refused here
 * too — the toggle proves the server denies a member rather than the UI
 * merely hiding the buttons.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { projectId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { decision, reason } = body as {
    decision?: unknown;
    reason?: unknown;
  };
  if (decision !== "APPROVE" && decision !== "REJECT") {
    return NextResponse.json(
      { error: "decision must be APPROVE or REJECT" },
      { status: 400 },
    );
  }

  const outcome = await decideProject(
    guard.context.actor,
    projectId,
    decision,
    reason,
  );
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error },
      { status: outcome.status },
    );
  }

  return NextResponse.json({
    ok: true,
    message: outcome.message,
    status: outcome.status,
  });
}
