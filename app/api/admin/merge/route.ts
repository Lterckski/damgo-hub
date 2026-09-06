import { NextResponse } from "next/server";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { requireReason } from "@/lib/audit-log";
import { mergeMember } from "@/lib/admin/merge-members";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/merge — folds a duplicate Member row into the person's
 * real record.
 *
 * Behind the same two guards as the Danger Zone: a typed confirmation
 * matching the source's own name, and a required reason. Both are checked
 * here, not only in the dialog — a merge re-points authorship across a
 * dozen tables and is not reversible by clicking something.
 */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { sourceId, targetId, confirmation, reason } = body as Record<string, unknown>;
  if (typeof sourceId !== "string" || typeof targetId !== "string") {
    return NextResponse.json({ error: "sourceId and targetId are required" }, { status: 400 });
  }

  try {
    const justification = requireReason(reason);

    const source = await prisma.member.findUnique({
      where: { id: sourceId },
      select: { displayName: true },
    });
    if (!source) return NextResponse.json({ error: "Source member not found" }, { status: 404 });

    if (
      typeof confirmation !== "string" ||
      confirmation.trim().toLowerCase() !== source.displayName.trim().toLowerCase()
    ) {
      return NextResponse.json(
        { error: `Type “${source.displayName}” exactly to confirm` },
        { status: 400 },
      );
    }

    const outcome = await mergeMember(guard.context.actor, sourceId, targetId, justification);
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

    return NextResponse.json({
      ok: true,
      ...outcome.result,
      message:
        `Merged ${outcome.sourceName} into ${outcome.targetName} — ` +
        `${outcome.result.moved} record${outcome.result.moved === 1 ? "" : "s"} moved` +
        (outcome.result.deduplicated > 0
          ? `, ${outcome.result.deduplicated} duplicate link${outcome.result.deduplicated === 1 ? "" : "s"} dropped`
          : ""),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
