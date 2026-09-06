import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { getRecordDetail } from "@/lib/admin/detail";
import { ADMIN_RECORD_KINDS, type AdminRecordKind } from "@/lib/admin/types";

// GET /api/admin/records/[kind]/[recordId] — the payload behind a drawer.
// Loaded on open rather than shipped with the table: Member 360 alone
// joins tasks, penalties, contributions, meetings and audit history, and
// nobody opens thirty drawers.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; recordId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { kind, recordId } = await params;
  if (!(ADMIN_RECORD_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Unknown record type" }, { status: 400 });
  }

  try {
    const detail = await getRecordDetail(kind as AdminRecordKind, recordId);
    if (!detail)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ detail });
  } catch (error) {
    return toErrorResponse(error);
  }
}
