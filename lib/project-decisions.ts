/**
 * The one place a project proposal is approved or rejected.
 *
 * Both entry points go through `decideProject`: `/admin`'s Action Queue
 * (`lib/admin/mutations.ts`) and the Approve/Reject controls on `/projects`
 * (`app/api/projects/[projectId]/decision`). Keeping a single implementation
 * is what stops the two surfaces from drifting into different rules about
 * which transitions are legal, what gets audited, and when a repeat click
 * conflicts instead of applying twice.
 *
 * Callers are responsible for proving the actor is an `org:admin` before
 * calling — this module assumes that check already happened and does not
 * repeat it, the same division of labour `lib/admin/mutations.ts` already
 * uses with `requireAdmin()`.
 *
 * See context/feature-specs/11-project-proposals.md — Proposal Approval Flow.
 */
import type { Prisma } from "@/app/generated/prisma/client";

import { recordAuditEvent, requireReason } from "@/lib/audit-log";
import type { AuditActor } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";

export type ProjectDecision = "APPROVE" | "REJECT";

export type ProjectDecisionOutcome =
  | { ok: true; message: string; status: "ACTIVE" | "REJECTED" }
  | { ok: false; status: number; error: string };

/** The status a decision moves the proposal to. */
const DECISION_STATUS = {
  APPROVE: "ACTIVE",
  REJECT: "REJECTED",
} as const;

/**
 * Approve or reject a proposal.
 *
 * Only `PROPOSED` can be decided. Deciding anything else is a `409`, not a
 * silent overwrite — that is what makes the Approve/Reject buttons safe
 * against a double click, a replayed request, or two admins pressing at the
 * same moment: the second one loses cleanly and says why. It matches the
 * "already decided" behaviour finance transactions and agenda proposals
 * already have.
 *
 * A rejection requires a reason (enforced server-side by `requireReason`,
 * not merely collected by a dialog). An approval does not: "yes, go ahead"
 * needs no justification, while "no" is the thing someone will ask about
 * later.
 */
export async function decideProject(
  actor: AuditActor,
  projectId: string,
  decision: ProjectDecision,
  rawReason: unknown,
): Promise<ProjectDecisionOutcome> {
  const status = DECISION_STATUS[decision];

  // A rejection's reason is validated before anything is read or written,
  // so an invalid one can never leave a half-applied decision behind.
  let reason: string | null;
  try {
    reason =
      decision === "REJECT"
        ? requireReason(rawReason)
        : typeof rawReason === "string" && rawReason.trim()
          ? rawReason.trim()
          : null;
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : "A reason is required",
    };
  }

  // Deliberately NOT filtered by entityVisibilityWhere("project"). A project
  // record carries only a `project` grant (its owner and collaborators) —
  // unlike penalties and transactions, it gets no `role: org:admin` grant —
  // so the visibility filter would 404 for any admin who is not on the
  // project, which is precisely the reviewer this flow exists for. Callers
  // prove `org:admin` before reaching here, and that role is the authority
  // for deciding a proposal.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, status: true, ownerId: true },
  });
  if (!project) {
    return { ok: false, status: 404, error: "Project not found" };
  }
  if (project.status !== "PROPOSED") {
    return {
      ok: false,
      status: 409,
      error:
        project.status === "ACTIVE"
          ? "This proposal has already been approved"
          : project.status === "REJECTED"
            ? "This proposal has already been rejected"
            : `This project is ${project.status.toLowerCase()} and is no longer a pending proposal`,
    };
  }

  // The status guard is repeated inside the write so two concurrent
  // decisions cannot both pass the read above and both apply. The second
  // update matches zero rows and is reported as the same conflict.
  const applied = await prisma.$transaction(async (tx) => {
    const result = await tx.project.updateMany({
      where: { id: projectId, status: "PROPOSED" },
      data: { status },
    });
    if (result.count === 0) return false;

    await recordAuditEvent(
      {
        actor,
        action: decision === "APPROVE" ? "project.approved" : "project.rejected",
        entityType: "PROJECT",
        entityId: projectId,
        entityLabel: project.name,
        before: { status: project.status },
        after: { status } as Prisma.InputJsonValue,
        reason,
      },
      tx,
    );
    return true;
  });

  if (!applied) {
    return {
      ok: false,
      status: 409,
      error: "This proposal has already been decided",
    };
  }

  return {
    ok: true,
    status,
    message:
      decision === "APPROVE"
        ? `${project.name} is now active`
        : `${project.name} was rejected`,
  };
}
