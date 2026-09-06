import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { reassignTask } from "@/lib/admin/mutations";

// POST /api/admin/reassign — the "reassign any task" override. Distinct
// from the normal task edit route because it bypasses ownership entirely,
// which is exactly why reassignTask() requires a reason and writes one
// before/after audit entry per call.
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

  const { taskId, memberIds, reason } = body as Record<string, unknown>;
  if (typeof taskId !== "string") {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  try {
    const outcome = await reassignTask(
      guard.context.actor,
      taskId,
      memberIds,
      reason,
    );
    if (!outcome.ok)
      return NextResponse.json(
        { error: outcome.error },
        { status: outcome.status },
      );
    return NextResponse.json({ ok: true, message: outcome.message });
  } catch (error) {
    return toErrorResponse(error);
  }
}
