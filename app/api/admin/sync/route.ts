import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  applyReconciliation,
  reconcileMembers,
} from "@/lib/member-reconciliation";

// GET /api/admin/sync — the diff, without changing anything. This is what
// the "Sync with Clerk" panel shows first: an admin sees exactly what drift
// exists before deciding to repair it.
export async function GET() {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    return NextResponse.json({
      report: await reconcileMembers(guard.context.orgId),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// POST /api/admin/sync — applies the safe half of the diff: creates local
// rows for Clerk members missing one, and marks orphaned local rows
// REMOVED. Never hard-deletes; see applyReconciliation()'s own note on why
// that stays a deliberate Danger Zone action.
export async function POST() {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const repair = await applyReconciliation(guard.context.orgId);
    const report = await reconcileMembers(guard.context.orgId);

    await recordAuditEvent({
      actor: guard.context.actor,
      action: "members.synced_with_clerk",
      entityType: "MEMBER",
      entityId: guard.context.orgId,
      entityLabel: "Clerk organization roster",
      after: {
        created: repair.created,
        markedRemoved: repair.markedRemoved,
        activeAfter: report.counts.active,
      },
      reason: null,
    });

    return NextResponse.json({
      ok: true,
      repair,
      report,
      message:
        repair.created === 0 && repair.markedRemoved === 0
          ? "Already in sync with Clerk"
          : `${repair.created} added · ${repair.markedRemoved} marked removed`,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
