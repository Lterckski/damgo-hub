import { NextResponse } from "next/server";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { applyInlineEdit } from "@/lib/admin/mutations";

// PATCH /api/admin/inline — one inline cell edit from Zone 4's table.
// Every field is allowlisted inside applyInlineEdit(); an unlisted
// kind/field pair is a 400, not a silent write.
export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { kind, recordId, field, value, reason } = body as Record<string, unknown>;
  if (typeof kind !== "string" || typeof recordId !== "string" || typeof field !== "string") {
    return NextResponse.json({ error: "kind, recordId and field are required" }, { status: 400 });
  }

  try {
    const outcome = await applyInlineEdit(guard.context, { kind, recordId, field, value, reason });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json({ ok: true, message: outcome.message });
  } catch (error) {
    return toErrorResponse(error);
  }
}
