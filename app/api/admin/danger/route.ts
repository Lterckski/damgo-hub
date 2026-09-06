import { entityVisibilityWhere } from "@/lib/hub/context";
import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { recordAuditEvent, requireReason } from "@/lib/audit-log";
import { getOrgSettings } from "@/lib/org-settings";
import { removeMemberFromOrg } from "@/lib/organization-roles";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/danger — remove member, archive project, reset cycle.
 *
 * Each carries a `confirmation` string the caller must have typed to match
 * the target's own name. The dialog asks for it, but the check is here:
 * the confirmation is the only thing standing between a stray click and an
 * irreversible action, so it can't live only in a component that a request
 * doesn't have to come from.
 */

type DangerAction = "member.remove" | "project.archive" | "cycle.reset";

const DANGER_ACTIONS: DangerAction[] = [
  "member.remove",
  "project.archive",
  "cycle.reset",
];

function isDangerAction(value: unknown): value is DangerAction {
  return (
    typeof value === "string" && (DANGER_ACTIONS as string[]).includes(value)
  );
}

/** Case- and whitespace-insensitive, but otherwise exact. */
function confirmationMatches(typed: unknown, expected: string): boolean {
  return (
    typeof typed === "string" &&
    typed.trim().toLowerCase() === expected.trim().toLowerCase()
  );
}

export async function POST(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { actor } = guard.context;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { action, targetId, confirmation, reason } = body as Record<
    string,
    unknown
  >;
  if (!isDangerAction(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    const justification = requireReason(reason);

    if (action === "member.remove") {
      if (typeof targetId !== "string") {
        return NextResponse.json(
          { error: "targetId is required" },
          { status: 400 },
        );
      }
      const member = await prisma.member.findUnique({
        where: { id: targetId },
      });
      if (!member)
        return NextResponse.json(
          { error: "Member not found" },
          { status: 404 },
        );

      // Same two guards the existing DELETE /api/members/[memberId]
      // enforces — the Leader's seat is fixed, and an admin removing
      // themselves would lock the org out of its own console.
      if (member.isLeader) {
        return NextResponse.json(
          { error: "The Leader can't be removed" },
          { status: 400 },
        );
      }
      if (member.id === actor.id) {
        return NextResponse.json(
          { error: "You can't remove yourself" },
          { status: 400 },
        );
      }
      if (!confirmationMatches(confirmation, member.displayName)) {
        return NextResponse.json(
          { error: `Type “${member.displayName}” exactly to confirm` },
          { status: 400 },
        );
      }

      // Clerk first, same ordering and reasoning as the existing delete
      // route: revoking org access is the guarantee that actually matters,
      // and it stops getCurrentMember() re-creating the row on their next
      // visit. Tolerate a 404 — they may already be gone from Clerk, which
      // is precisely the orphan case the sync action surfaces.
      try {
        await removeMemberFromOrg(member.clerkUserId);
      } catch (error) {
        console.error("removeMemberFromOrg failed", error);
      }

      // Status change, not a row delete: Task/Doc/Transaction/Penalty all
      // reference Member with Restrict, and their authorship is worth more
      // than a tidy table. A real delete stays at DELETE
      // /api/members/[memberId], which reassigns that content first.
      await prisma.$transaction(async (tx) => {
        await tx.member.update({
          where: { id: targetId },
          data: { status: "REMOVED" },
        });
        await recordAuditEvent(
          {
            actor,
            action: "member.removed",
            entityType: "MEMBER",
            entityId: targetId,
            entityLabel: member.displayName,
            before: { status: member.status },
            after: { status: "REMOVED", clerkMembershipRevoked: true },
            reason: justification,
          },
          tx,
        );
      });

      return NextResponse.json({
        ok: true,
        message: `${member.displayName} removed from the organization`,
      });
    }

    if (action === "project.archive") {
      if (typeof targetId !== "string") {
        return NextResponse.json(
          { error: "targetId is required" },
          { status: 400 },
        );
      }
      const project = await prisma.project.findUnique({
        where: {
          ...{ id: targetId },
          AND: [await entityVisibilityWhere("project")],
        },
      });
      if (!project)
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 },
        );
      if (!confirmationMatches(confirmation, project.name)) {
        return NextResponse.json(
          { error: `Type “${project.name}” exactly to confirm` },
          { status: 400 },
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: targetId },
          data: { status: "ARCHIVED" },
        });
        await recordAuditEvent(
          {
            actor,
            action: "project.archived",
            entityType: "PROJECT",
            entityId: targetId,
            entityLabel: project.name,
            before: { status: project.status },
            after: { status: "ARCHIVED" },
            reason: justification,
          },
          tx,
        );
      });

      return NextResponse.json({
        ok: true,
        message: `${project.name} archived`,
      });
    }

    // cycle.reset — closes the books on the current cycle: every COMPLETED
    // project is archived and every OPEN penalty past its due date is
    // waived. Deliberately does NOT touch transactions; the ledger is
    // cumulative and has no cycle boundary (architecture-context.md).
    if (!confirmationMatches(confirmation, "reset cycle")) {
      return NextResponse.json(
        { error: "Type “reset cycle” exactly to confirm" },
        { status: 400 },
      );
    }

    const settings = await getOrgSettings();

    const summary = await prisma.$transaction(async (tx) => {
      const archived = await tx.project.updateMany({
        where: { status: "COMPLETED" },
        data: { status: "ARCHIVED" },
      });
      // Past due means the same thing here as everywhere else: an explicit
      // dueAt in the past, OR — for the many rows that predate that column
      // — an issue date older than the org's penaltyDueDays window. Keying
      // only off `dueAt` would silently skip every legacy penalty.
      const now = new Date();
      const fallbackCutoff = new Date(
        now.getTime() - settings.penaltyDueDays * 24 * 60 * 60 * 1000,
      );
      const waived = await tx.penalty.updateMany({
        where: {
          status: "OPEN",
          OR: [
            { dueAt: { lt: now } },
            { dueAt: null, createdAt: { lt: fallbackCutoff } },
          ],
        },
        data: { status: "WAIVED", resolvedAt: now },
      });

      await recordAuditEvent(
        {
          actor,
          action: "cycle.reset",
          entityType: "ORG_SETTINGS",
          entityId: "cycle",
          entityLabel: "Cycle reset",
          after: {
            projectsArchived: archived.count,
            penaltiesWaived: waived.count,
          },
          reason: justification,
        },
        tx,
      );

      return {
        projectsArchived: archived.count,
        penaltiesWaived: waived.count,
      };
    });

    return NextResponse.json({
      ok: true,
      ...summary,
      message: `Cycle reset — ${summary.projectsArchived} project(s) archived, ${summary.penaltiesWaived} penalty(ies) waived`,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
