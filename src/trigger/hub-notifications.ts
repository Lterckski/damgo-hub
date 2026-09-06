import { schedules } from "@trigger.dev/sdk";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { recordWhere, canSee, type Viewer } from "@/lib/hub/visibility";

export const hubNotificationSweep = schedules.task({
  id: "hub-notification-sweep",
  cron: "* * * * *",
  run: async () => {
    const workspace = await prisma.hubWorkspace.findUnique({
      where: { id: "singleton" },
    });
    if (!workspace) return;
    // Refresh actual membership/roles before fan-out and sends, including
    // jobs that run while nobody has the app open.
    const clerk = await clerkClient();
    const roles = new Map<string, string>();
    for (let offset = 0; ; offset += 100) {
      const page = await clerk.organizations.getOrganizationMembershipList({
        organizationId: workspace.orgId,
        limit: 100,
        offset,
      });
      for (const m of page.data)
        if (m.publicUserData) roles.set(m.publicUserData.userId, m.role);
      if (page.data.length < 100) break;
    }
    const members = await prisma.member.findMany({
      where: {
        clerkUserId: { in: [...roles.keys()] },
        status: { not: "REMOVED" },
      },
    });
    await prisma.$transaction([
      prisma.hubMembership.deleteMany({
        where: {
          orgId: workspace.orgId,
          memberId: { notIn: members.map((m) => m.id) },
        },
      }),
      ...members.map((m) =>
        prisma.hubMembership.upsert({
          where: { memberId: m.id },
          create: {
            memberId: m.id,
            orgId: workspace.orgId,
            role: roles.get(m.clerkUserId)!,
          },
          update: { role: roles.get(m.clerkUserId)! },
        }),
      ),
    ]);
    // Source triggers keep relational text/audiences current. Time itself
    // doesn't issue UPDATEs, so reminders are the worker's responsibility.
    const due = await prisma.hubRecord.findMany({
      where: {
        orgId: workspace.orgId,
        dueAt: { lte: new Date(Date.now() + 86400000) },
        entityType: { in: ["task", "penalty", "meeting"] },
      },
    });
    for (const r of due) {
      const delta = r.dueAt!.getTime() - Date.now();
      const action =
        r.entityType === "task" && r.status !== "DONE" && delta < 0
          ? "task.overdue"
          : r.entityType === "penalty" && r.status === "OPEN"
            ? "penalty.due_soon"
            : r.entityType === "meeting" && delta > 0 && delta <= 15 * 60000
              ? "meeting.starting"
              : null;
      if (action)
        await prisma.$executeRaw`SELECT hub_emit(${r.id},${action},${r.dueAt!.toISOString()})`;
    }
    if (process.env.LIVEBLOCKS_SECRET_KEY) {
      const { syncIdeas } = await import("@/lib/hub/ideas");
      await syncIdeas({ orgId: workspace.orgId }).catch((error: unknown) =>
        console.error("Ideas search reconciliation failed", error),
      );
    }
    for (const member of members) {
      const projects = await prisma.project.findMany({
        where: {
          OR: [
            { ownerId: member.id },
            { members: { some: { memberId: member.id } } },
          ],
        },
        select: { id: true },
      });
      const viewer: Viewer = {
        orgId: workspace.orgId,
        memberId: member.id,
        role: roles.get(member.clerkUserId)!,
        projectIds: projects.map((p) => p.id),
      };
      const pending = await prisma.hubNotificationState.findMany({
        where: {
          memberId: member.id,
          emailPending: true,
          suppressed: false,
          emailSentAt: null,
          emailAttempts: { lt: 10 },
          notification: { orgId: workspace.orgId, record: recordWhere(viewer) },
        },
        include: { notification: { include: { record: true } } },
        take: 50,
      });
      for (const state of pending) {
        const n = state.notification;
        if (!canSee(viewer, n.orgId, [n])) continue;
        const isReminder = [
          "task.overdue",
          "penalty.due_soon",
          "meeting.starting",
        ].includes(n.action);
        if (
          isReminder &&
          (!n.record.dueAt ||
            !n.eventKey.includes(n.record.dueAt.toISOString()) ||
            ["DONE", "RESOLVED", "WAIVED"].includes(n.record.status) ||
            (n.action === "meeting.starting" &&
              n.record.dueAt.getTime() < Date.now()))
        ) {
          await prisma.hubNotificationState.update({
            where: {
              notificationId_memberId: {
                notificationId: n.id,
                memberId: member.id,
              },
            },
            data: { emailPending: false },
          });
          continue;
        }
        const pref = await prisma.hubPreference.findUnique({
          where: {
            orgId_memberId_type: {
              orgId: viewer.orgId,
              memberId: member.id,
              type: n.action.split(".")[0],
            },
          },
        });
        if (
          pref?.enabled === false ||
          !(pref?.email ?? n.action === "meeting.starting")
        ) {
          await prisma.hubNotificationState.update({
            where: {
              notificationId_memberId: {
                notificationId: n.id,
                memberId: member.id,
              },
            },
            data: { emailPending: false },
          });
          continue;
        }
        const claim = await prisma.hubNotificationState.updateMany({
          where: {
            notificationId: n.id,
            memberId: member.id,
            emailAttempts: state.emailAttempts,
            emailSentAt: null,
          },
          data: { emailAttempts: { increment: 1 } },
        });
        if (!claim.count) continue;
        const url = new URL(
          n.url,
          process.env.APP_URL ?? "https://damgo-hub.vercel.app",
        ).href;
        const escape = (text: string) =>
          text.replace(
            /[&<>"']/g,
            (c) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              })[c]!,
          );
        const result = await sendEmail({
          to: member.email,
          subject: `${n.title} — ${n.action.replaceAll(".", " ")}`,
          text: `${n.body}\n\n${url}`,
          html: `<h2>${escape(n.title)}</h2><p>${escape(n.body)}</p><p><a href="${escape(url)}">Open in Damgo Hub</a></p>`,
          idempotencyKey: `hub:${n.id}:${member.id}`,
        });
        if (result.ok)
          await prisma.hubNotificationState.update({
            where: {
              notificationId_memberId: {
                notificationId: n.id,
                memberId: member.id,
              },
            },
            data: { emailSentAt: new Date(), emailPending: false },
          });
      }
    }
  },
});
