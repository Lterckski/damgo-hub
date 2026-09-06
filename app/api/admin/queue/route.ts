import { NextResponse } from "next/server";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { applyQueueAction } from "@/lib/admin/mutations";
import { isQueueActionId } from "@/lib/admin/queue";

// POST /api/admin/queue — runs one Action Queue decision, or the same
// decision across a multi-select. Admin only, re-checked here: the queue's
// inline buttons are rendered from a payload the client holds, so which
// actions a row "offered" is never what authorizes the request.
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { actionId, entityIds, reason } = body as Record<string, unknown>;

  if (!isQueueActionId(actionId)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (!Array.isArray(entityIds) || entityIds.length === 0 || entityIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "entityIds must be a non-empty array of ids" }, { status: 400 });
  }

  try {
    const results = [];
    for (const entityId of entityIds as string[]) {
      results.push({ entityId, outcome: await applyQueueAction(guard.context, actionId, entityId, reason) });
    }

    const failed = results.filter((r) => !r.outcome.ok);
    const succeeded = results.length - failed.length;

    // A single-item action reports its own status code so one failed
    // approval reads as a failure rather than a silent no-op; a batch
    // always returns 200 with a per-item breakdown, since partial success
    // is the normal case there.
    if (results.length === 1) {
      const outcome = results[0].outcome;
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      return NextResponse.json({ ok: true, message: outcome.message });
    }

    return NextResponse.json({
      ok: failed.length === 0,
      succeeded,
      failed: failed.map((f) => ({ entityId: f.entityId, error: f.outcome.ok ? null : f.outcome.error })),
      message: `${succeeded} of ${results.length} completed`,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
