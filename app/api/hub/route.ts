import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHubViewer, HubAccessError } from "@/lib/hub/context";
import {
  search,
  recommendations,
  visibleRecord,
  recordOpen,
} from "@/lib/hub/search";
import { changeNotification, notifications } from "@/lib/hub/notifications";
import { recordWhere, NOTIFICATION_TYPES } from "@/lib/hub/visibility";
import { getOrgSettings } from "@/lib/org-settings";
import { getCurrentMember } from "@/lib/current-member";
import { claimPenaltyPaid } from "@/lib/dashboard/mutations";
import { requireAdmin } from "@/lib/admin/guard";
import { applyQueueAction } from "@/lib/admin/mutations";

function failure(error: unknown) {
  if (error instanceof HubAccessError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error("Header request failed", error);
  return NextResponse.json(
    { error: "Unable to complete this request. Please try again." },
    { status: 500 },
  );
}
const json = (value: unknown) =>
  NextResponse.json(value, {
    headers: { "Cache-Control": "private, no-store" },
  });

export async function GET(request: Request) {
  try {
    const viewer = await getHubViewer();
    const params = new URL(request.url).searchParams;
    const mode = params.get("mode");
    if (mode === "search") {
      const q = params.get("q") ?? "";
      return json(
        q.trim()
          ? { results: await search(viewer, q) }
          : await recommendations(viewer),
      );
    }
    if (mode === "notifications")
      return json(await notifications(viewer, params.get("filter") ?? "all"));
    if (mode === "preferences")
      return json({
        preferences: await prisma.hubPreference.findMany({
          where: { orgId: viewer.orgId, memberId: viewer.memberId },
        }),
      });
    if (mode === "options") {
      const memberships = await prisma.hubMembership.findMany({
        where: { orgId: viewer.orgId },
      });
      const docs = await prisma.hubRecord.findMany({
        where: { ...recordWhere(viewer), entityType: "document" },
        select: { entityId: true, title: true, projectId: true },
      });
      const [members, projects, settings] = await Promise.all([
        prisma.member.findMany({
          where: { id: { in: memberships.map((m) => m.memberId) } },
          select: { id: true, displayName: true, avatarUrl: true },
        }),
        prisma.project.findMany({
          where: {
            id: { in: viewer.projectIds },
            status: { in: ["PROPOSED", "ACTIVE"] },
          },
          select: { id: true, name: true },
        }),
        getOrgSettings(),
      ]);
      return json({
        members,
        projects,
        docs: docs.map((d) => ({
          id: d.entityId,
          title: d.title,
          projectId: d.projectId,
        })),
        currentMemberId: viewer.memberId,
        isAdmin: viewer.role === "org:admin",
        financeCategories: settings.financeCategories,
      });
    }
    return json({ error: "Unknown request" });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await getHubViewer();
    const raw: unknown = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const body = raw as Record<string, unknown>;
    const action = body.action;
    const id = typeof body.id === "string" ? body.id : null;
    if (action === "read" || action === "dismiss") {
      if (!id && action === "dismiss")
        return NextResponse.json(
          { error: "Notification required" },
          { status: 400 },
        );
      await changeNotification(viewer, id, action);
      return json({ ok: true });
    }
    if (action === "clearRecents") {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${viewer.orgId + ":" + viewer.memberId},0))`;
        await tx.hubRecent.deleteMany({
          where: { orgId: viewer.orgId, memberId: viewer.memberId },
        });
      });
      return json({ ok: true });
    }
    if (action === "preference") {
      const type = body.type;
      if (
        typeof type !== "string" ||
        !NOTIFICATION_TYPES.some((t) => t === type) ||
        typeof body.enabled !== "boolean" ||
        typeof body.email !== "boolean"
      )
        return NextResponse.json(
          { error: "Invalid preference" },
          { status: 400 },
        );
      await prisma.hubPreference.upsert({
        where: {
          orgId_memberId_type: {
            orgId: viewer.orgId,
            memberId: viewer.memberId,
            type,
          },
        },
        create: {
          orgId: viewer.orgId,
          memberId: viewer.memberId,
          type,
          enabled: body.enabled,
          email: body.email,
        },
        update: { enabled: body.enabled, email: body.email },
      });
      return json({ ok: true });
    }
    if (action === "idea") {
      if (
        typeof body.text !== "string" ||
        !body.text.trim() ||
        body.text.length > 5000 ||
        !id ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(id)
      )
        return NextResponse.json(
          { error: "Enter an idea (up to 5,000 characters)" },
          { status: 400 },
        );
      const { syncIdeas } = await import("@/lib/hub/ideas");
      await syncIdeas(viewer, {
        id,
        text: body.text.trim(),
        memberId: viewer.memberId,
      });
      return json({ ok: true });
    }
    if (action === "announcement") {
      if (viewer.role !== "org:admin") throw new HubAccessError("Admins only");
      if (
        typeof body.title !== "string" ||
        !body.title.trim() ||
        body.title.length > 160 ||
        typeof body.text !== "string" ||
        body.text.length > 5000
      )
        return NextResponse.json(
          { error: "Enter a title and message" },
          { status: 400 },
        );
      const member = await getCurrentMember();
      await prisma.announcement.create({
        data: {
          title: body.title.trim(),
          body: body.text,
          authorId: member.id,
          authorName: member.displayName,
        },
      });
      return json({ ok: true });
    }
    if (!id)
      return NextResponse.json({ error: "Record required" }, { status: 400 });
    const record = await visibleRecord(viewer, id);
    if (!record)
      return NextResponse.json(
        { error: "Record unavailable" },
        { status: 404 },
      );
    if (action === "open") {
      await recordOpen(viewer, id);
      return json({ ok: true });
    }
    if (action === "accept" && record.entityType === "task") {
      // Org/project assignees acquire their own acceptance row, never a
      // shared 'accepted' flag or an implicit status change to DONE.
      await prisma.$transaction(async (tx) => {
        await tx.taskAssignee.upsert({
          where: {
            taskId_memberId: {
              taskId: record.entityId,
              memberId: viewer.memberId,
            },
          },
          create: {
            taskId: record.entityId,
            memberId: viewer.memberId,
            acceptedAt: new Date(),
          },
          update: {},
        });
        await tx.taskAssignee.updateMany({
          where: {
            taskId: record.entityId,
            memberId: viewer.memberId,
            acceptedAt: null,
          },
          data: { acceptedAt: new Date() },
        });
      });
      return json({ ok: true });
    }
    if (action === "claim_paid" && record.entityType === "penalty") {
      const result = await claimPenaltyPaid(
        await getCurrentMember(),
        record.entityId,
      );
      return result.ok
        ? json(result)
        : NextResponse.json(result, { status: result.status });
    }
    if (action === "approve" && record.entityType === "transaction") {
      const guard = await requireAdmin();
      if (!guard.ok) return guard.response;
      const result = await applyQueueAction(
        guard.context,
        "transaction.approve",
        record.entityId,
        null,
      );
      return result.ok
        ? json(result)
        : NextResponse.json(result, { status: result.status });
    }
    if (action === "join" && record.entityType === "meeting") {
      const meeting = await prisma.meeting.findUnique({
        where: { id: record.entityId },
        select: { meetingUrl: true },
      });
      if (!meeting?.meetingUrl || !/^https?:\/\//i.test(meeting.meetingUrl))
        return NextResponse.json(
          { error: "This meeting has no join link" },
          { status: 400 },
        );
      return json({ url: meeting.meetingUrl });
    }
    if (action === "comment") {
      if (
        typeof body.text !== "string" ||
        !body.text.trim() ||
        body.text.length > 5000 ||
        !Array.isArray(body.mentions) ||
        body.mentions.length > 20 ||
        body.mentions.some((m) => typeof m !== "string")
      )
        return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
      await prisma.hubComment.create({
        data: {
          recordId: id,
          authorId: viewer.memberId,
          body: body.text.trim(),
          mentions: [...new Set(body.mentions as string[])],
        },
      });
      return json({ ok: true });
    }
    if (action === "milestone" && record.entityType === "project") {
      if (!viewer.projectIds.includes(record.entityId))
        throw new HubAccessError("Project membership required");
      if (
        typeof body.title !== "string" ||
        !body.title.trim() ||
        body.title.length > 160 ||
        typeof body.dueAt !== "string" ||
        !Number.isFinite(Date.parse(body.dueAt))
      )
        return NextResponse.json(
          { error: "Title and due date required" },
          { status: 400 },
        );
      await prisma.projectMilestone.create({
        data: {
          projectId: record.entityId,
          title: body.title.trim(),
          dueAt: new Date(body.dueAt),
        },
      });
      return json({ ok: true });
    }
    if (
      (action === "milestoneComplete" || action === "milestoneBlock") &&
      record.entityType === "project" &&
      typeof body.milestoneId === "string"
    ) {
      if (!viewer.projectIds.includes(record.entityId))
        throw new HubAccessError("Project membership required");
      const reason =
        typeof body.reason === "string"
          ? body.reason.trim().slice(0, 1000)
          : "";
      if (action === "milestoneBlock" && !reason)
        return NextResponse.json(
          { error: "A blocked reason is required" },
          { status: 400 },
        );
      const milestone = await prisma.projectMilestone.findFirst({
        where: { id: body.milestoneId, projectId: record.entityId },
      });
      if (!milestone) throw new HubAccessError("Milestone unavailable", 404);
      await prisma.projectMilestone.updateMany({
        where: {
          id: milestone.id,
          projectId: record.entityId,
          ...(action === "milestoneComplete"
            ? { completedAt: null }
            : {
                OR: [
                  { blockedReason: null },
                  { blockedReason: { not: reason } },
                ],
              }),
        },
        data:
          action === "milestoneComplete"
            ? { completedAt: new Date(), blockedReason: null }
            : { blockedReason: reason },
      });
      return json({ ok: true });
    }
    return NextResponse.json({ error: "Action unavailable" }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
