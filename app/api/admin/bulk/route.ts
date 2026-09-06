import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { applyBulkAction, isBulkAction } from "@/lib/admin/mutations";

// POST /api/admin/bulk — one action across a table selection. Returns a
// per-record breakdown rather than a single ok/fail: a bulk waive where two
// of nine penalties were already decided partly succeeded, and the UI has
// to be able to say which two.
export async function POST(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { action, ids, value, reason } = body as Record<string, unknown>;
  if (!isBulkAction(action)) {
    return NextResponse.json({ error: "Unknown bulk action" }, { status: 400 });
  }
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.some((id) => typeof id !== "string")
  ) {
    return NextResponse.json(
      { error: "ids must be a non-empty array" },
      { status: 400 },
    );
  }
  if (ids.length > 200) {
    return NextResponse.json(
      { error: "Select at most 200 records at a time" },
      { status: 400 },
    );
  }

  try {
    const result = await applyBulkAction(
      guard.context,
      action,
      ids as string[],
      value,
      reason,
    );
    return NextResponse.json({
      ok: result.failed.length === 0,
      ...result,
      message: `${result.succeeded} of ${ids.length} completed`,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
