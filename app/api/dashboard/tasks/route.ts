import { NextResponse } from "next/server";

import { completeMyTask, requireMember } from "@/lib/dashboard/mutations";

// PATCH /api/dashboard/tasks — inline complete/reopen from My Tasks.
//
// Separate from PATCH /api/tasks/[taskId] on purpose: that route accepts
// any authenticated member editing any task, which is too broad for a
// one-click checkbox. This one only lets you finish work assigned to you,
// checked server-side against TaskAssignee.
export async function PATCH(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { taskId, done } = body as Record<string, unknown>;
  if (typeof taskId !== "string" || typeof done !== "boolean") {
    return NextResponse.json({ error: "taskId and done are required" }, { status: 400 });
  }

  const outcome = await completeMyTask(guard.member, taskId, done);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, message: outcome.message });
}
