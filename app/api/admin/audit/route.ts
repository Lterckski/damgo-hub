import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { getAuditLog } from "@/lib/audit-log";

// GET /api/admin/audit — the append-only feed, newest first. Read-only by
// construction: there is no POST/PATCH/DELETE counterpart anywhere, and
// entries are written only as part of the transaction that made the change
// they describe (lib/audit-log.ts).
export async function GET(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const limitParam = new URL(request.url).searchParams.get("limit");
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : 100;
  const limit = Number.isInteger(parsed)
    ? Math.min(Math.max(parsed, 1), 500)
    : 100;

  try {
    return NextResponse.json({ entries: await getAuditLog(limit) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
