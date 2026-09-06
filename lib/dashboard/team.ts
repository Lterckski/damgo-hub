import { activityVisibilityWhere } from "@/lib/hub/context";
import { entityVisibilityWhere } from "@/lib/hub/context";
import { taskVisibilityWhere } from "@/lib/hub/context";
import { getOrgSettings } from "@/lib/org-settings";
import { penaltyDueAt } from "@/lib/admin/queue";
import { listOrgRoles } from "@/lib/organization-roles";
import { getFinancialSnapshot } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import {
  teamDayStartPlus,
  teamMonthStart,
  teamNextMonthStart,
  teamTimeLabel,
} from "@/lib/team-time";
import type { ActivityRow } from "@/lib/dashboard/types";

/**
 * Team Overview's data layer. Read-mostly by design (Part 4): the only
 * mutations the tab exposes are upvoting an idea and dismissing an
 * announcement. Everything else that changes shared state lives in /admin.
 *
 * Member-scoped queries all filter to the Clerk org roster, the same way
 * lib/members.ts does — a local row for someone no longer in the org must
 * not appear in workload or dues.
 */

export interface TeamPulse {
  nextMeeting: {
    id: string;
    title: string;
    at: string;
    joinUrl: string | null;
  } | null;
  nearestDeadline: { title: string; at: string; kind: string } | null;
  activeProjectCount: number;
  /** Roster counts. See the note in getTeamPulse — this is not presence. */
  activeMemberCount: number;
  inactiveMemberCount: number;
}

export async function getTeamPulse(): Promise<TeamPulse> {
  const now = new Date();
  const horizon = teamDayStartPlus(30, now);
  const orgRoles = await listOrgRoles();
  const clerkUserIds = [...orgRoles.keys()];

  const [nextMeeting, nextTask, nextMilestone, activeProjectCount, members] =
    await Promise.all([
      prisma.meeting.findFirst({
        where: {
          ...{ scheduledAt: { gte: now } },
          AND: [await entityVisibilityWhere("meeting")],
        },
        orderBy: { scheduledAt: "asc" },
        select: { id: true, title: true, scheduledAt: true, meetingUrl: true },
      }),
      prisma.task.findFirst({
        where: {
          AND: [
            await taskVisibilityWhere(),
            { dueDate: { gte: now, lt: horizon }, status: { not: "DONE" } },
          ],
        },
        orderBy: { dueDate: "asc" },
        select: { title: true, dueDate: true },
      }),
      prisma.projectMilestone.findFirst({
        where: { completedAt: null, dueAt: { gte: now, lt: horizon } },
        orderBy: { dueAt: "asc" },
        select: { title: true, dueAt: true },
      }),
      prisma.project.count({ where: { status: "ACTIVE" } }),
      prisma.member.findMany({
        where: { clerkUserId: { in: clerkUserIds } },
        select: { status: true },
      }),
    ]);

  // Nearest deadline across kinds, not just tasks.
  const candidates = [
    nextTask
      ? { title: nextTask.title, at: nextTask.dueDate, kind: "Task" }
      : null,
    nextMilestone
      ? {
          title: nextMilestone.title,
          at: nextMilestone.dueAt,
          kind: "Milestone",
        }
      : null,
  ].filter(
    (candidate): candidate is { title: string; at: Date; kind: string } =>
      candidate !== null,
  );
  const nearest =
    candidates.sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null;

  return {
    nextMeeting: nextMeeting
      ? {
          id: nextMeeting.id,
          title: nextMeeting.title,
          at: nextMeeting.scheduledAt.toISOString(),
          joinUrl: nextMeeting.meetingUrl,
        }
      : null,
    nearestDeadline: nearest
      ? {
          title: nearest.title,
          at: nearest.at.toISOString(),
          kind: nearest.kind,
        }
      : null,
    activeProjectCount,
    // Roster status (MemberStatus), NOT live presence. Damgo Hub has no
    // presence signal outside Liveblocks board rooms, which only know who
    // has a canvas open. Labelled "active/inactive on the roster" in the UI
    // rather than "present/away", which would be a claim the data can't
    // support.
    activeMemberCount: members.filter((member) => member.status === "ACTIVE")
      .length,
    inactiveMemberCount: members.filter((member) => member.status !== "ACTIVE")
      .length,
  };
}

// ---------------------------------------------------------------------------
// Finance + dues
// ---------------------------------------------------------------------------

export interface TeamFinance {
  balanceCents: number;
  monthIncomeCents: number;
  monthExpenseCents: number;
  monthLabel: string;
  pendingCount: number;
  asOf: string;
  duesPeriodLabel: string | null;
  dues: {
    memberId: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
    amountCents: number;
  }[];
}

export async function getTeamFinance(): Promise<TeamFinance> {
  const now = new Date();

  const [snapshot, pendingCount, currentPeriod] = await Promise.all([
    getFinancialSnapshot(),
    prisma.transaction.count({ where: { status: "PENDING" } }),
    // The dues period covering today, if one has been set up.
    prisma.duesPeriod.findFirst({
      where: { periodStart: { lte: now }, periodEnd: { gte: now } },
      orderBy: { periodStart: "desc" },
      select: {
        label: true,
        assessments: {
          select: {
            memberId: true,
            status: true,
            amountCents: true,
            member: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    }),
  ]);

  return {
    balanceCents: snapshot.balanceCentavos,
    monthIncomeCents: snapshot.monthIncomeCentavos,
    monthExpenseCents: snapshot.monthExpenseCentavos,
    monthLabel: snapshot.monthLabel,
    pendingCount,
    asOf: teamTimeLabel(new Date(snapshot.asOf)),
    duesPeriodLabel: currentPeriod?.label ?? null,
    dues:
      currentPeriod?.assessments
        .map((assessment) => ({
          memberId: assessment.memberId,
          displayName: assessment.member.displayName,
          avatarUrl: assessment.member.avatarUrl,
          status: assessment.status,
          amountCents: assessment.amountCents,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Workload
// ---------------------------------------------------------------------------

export interface WorkloadRow {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  openTaskCount: number;
  overdueCount: number;
  /** Percent of this member's tasks due this month that they finished. */
  completionRate: number | null;
  completedThisMonth: number;
  dueThisMonth: number;
}

/**
 * Per-member load. "Completion rate this cycle" is a calendar month in
 * team time (the cycle definition confirmed for this build), measured with
 * `Task.completedAt` rather than `updatedAt` — editing a finished task
 * moves `updatedAt`, which would silently re-date the completion.
 *
 * The denominator is tasks *due* this month, not tasks completed: finishing
 * three of three due tasks is 100%, and finishing three of ten is not.
 */
export async function getWorkload(): Promise<WorkloadRow[]> {
  const now = new Date();
  const monthStart = teamMonthStart(now);
  const monthEnd = teamNextMonthStart(now);
  const orgRoles = await listOrgRoles();

  const members = await prisma.member.findMany({
    where: {
      clerkUserId: { in: [...orgRoles.keys()] },
      status: { not: "REMOVED" },
    },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      taskAssignments: {
        where: { task: await taskVisibilityWhere() },
        select: {
          task: { select: { status: true, dueDate: true, completedAt: true } },
        },
      },
    },
    orderBy: { displayName: "asc" },
  });

  return members.map((member) => {
    const tasks = member.taskAssignments.map((assignment) => assignment.task);
    const open = tasks.filter((task) => task.status !== "DONE");
    const dueThisMonth = tasks.filter(
      (task) => task.dueDate >= monthStart && task.dueDate < monthEnd,
    );
    const completedThisMonth = dueThisMonth.filter(
      (task) => task.completedAt !== null && task.completedAt < monthEnd,
    );

    return {
      memberId: member.id,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      openTaskCount: open.length,
      overdueCount: open.filter((task) => task.dueDate < now).length,
      // Null, not zero, when nothing was due — "0%" would read as a
      // failure where the honest answer is "nothing to measure".
      completionRate:
        dueThisMonth.length === 0
          ? null
          : Math.round((completedThisMonth.length / dueThisMonth.length) * 100),
      completedThisMonth: completedThisMonth.length,
      dueThisMonth: dueThisMonth.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface TeamProjectRow {
  id: string;
  name: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  status: string;
  priority: string;
  completedTaskCount: number;
  totalTaskCount: number;
  nextMilestone: { title: string; dueAt: string; isOverdue: boolean } | null;
  blockedReason: string | null;
}

export async function getTeamProjects(): Promise<TeamProjectRow[]> {
  const now = new Date();

  const projects = await prisma.project.findMany({
    where: {
      ...{ status: "ACTIVE" },
      AND: [await entityVisibilityWhere("project")],
    },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      blockedReason: true,
      owner: { select: { displayName: true, avatarUrl: true } },
      tasks: { where: await taskVisibilityWhere(), select: { status: true } },
      milestones: {
        where: { completedAt: null },
        orderBy: [{ dueAt: "asc" }, { position: "asc" }],
        take: 1,
        select: { title: true, dueAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return projects.map((project) => {
    const milestone = project.milestones[0] ?? null;
    return {
      id: project.id,
      name: project.name,
      ownerName: project.owner.displayName,
      ownerAvatarUrl: project.owner.avatarUrl,
      status: project.status,
      priority: project.priority,
      completedTaskCount: project.tasks.filter((task) => task.status === "DONE")
        .length,
      totalTaskCount: project.tasks.length,
      nextMilestone: milestone
        ? {
            title: milestone.title,
            dueAt: milestone.dueAt.toISOString(),
            isOverdue: milestone.dueAt < now,
          }
        : null,
      blockedReason: project.blockedReason,
    };
  });
}

// ---------------------------------------------------------------------------
// Hackathons
// ---------------------------------------------------------------------------

export interface HackathonRow {
  id: string;
  name: string;
  organizer: string | null;
  url: string | null;
  registrationDeadline: string | null;
  submissionDeadline: string | null;
  entryStatus: string;
  projectName: string | null;
  nextDeadline: string | null;
  isPastDue: boolean;
}

export async function getHackathonPipeline(): Promise<HackathonRow[]> {
  const now = new Date();

  const hackathons = await prisma.hackathon.findMany({
    where: { entryStatus: { notIn: ["SKIPPED", "ELIMINATED"] } },
    select: {
      id: true,
      name: true,
      organizer: true,
      url: true,
      registrationDeadline: true,
      submissionDeadline: true,
      entryStatus: true,
      project: {
        where: await entityVisibilityWhere("project"),
        select: { name: true },
      },
    },
  });

  return hackathons
    .map((hackathon) => {
      // The next date that still matters: registration until it passes,
      // then submission.
      const upcoming =
        [hackathon.registrationDeadline, hackathon.submissionDeadline]
          .filter((date): date is Date => date !== null)
          .filter((date) => date >= now)
          .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

      const anyDeadline =
        hackathon.submissionDeadline ?? hackathon.registrationDeadline;

      return {
        id: hackathon.id,
        name: hackathon.name,
        organizer: hackathon.organizer,
        url: hackathon.url,
        registrationDeadline:
          hackathon.registrationDeadline?.toISOString() ?? null,
        submissionDeadline: hackathon.submissionDeadline?.toISOString() ?? null,
        entryStatus: hackathon.entryStatus,
        projectName: hackathon.project?.name ?? null,
        nextDeadline: upcoming?.toISOString() ?? null,
        isPastDue:
          upcoming === null && anyDeadline !== null && anyDeadline < now,
      };
    })
    .sort((a, b) => {
      if (a.nextDeadline && b.nextDeadline)
        return a.nextDeadline.localeCompare(b.nextDeadline);
      if (a.nextDeadline) return -1;
      if (b.nextDeadline) return 1;
      return a.name.localeCompare(b.name);
    });
}

// ---------------------------------------------------------------------------
// Penalty ledger (team-wide, OPEN only)
// ---------------------------------------------------------------------------

export interface LedgerRow {
  id: string;
  memberName: string;
  memberAvatarUrl: string | null;
  reason: string;
  amountCents: number | null;
  dueAt: string;
  isPastDue: boolean;
  isDisputed: boolean;
}

export async function getPenaltyLedger(): Promise<LedgerRow[]> {
  const now = new Date();
  const settings = await getOrgSettings();

  const penalties = await prisma.penalty.findMany({
    where: {
      ...{ status: "OPEN" },
      AND: [await entityVisibilityWhere("penalty")],
    },
    select: {
      id: true,
      reason: true,
      amountCents: true,
      dueAt: true,
      createdAt: true,
      member: { select: { displayName: true, avatarUrl: true } },
      dispute: { select: { status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return penalties.map((penalty) => {
    const due = penaltyDueAt(penalty, settings.penaltyDueDays);
    return {
      id: penalty.id,
      memberName: penalty.member.displayName,
      memberAvatarUrl: penalty.member.avatarUrl,
      reason: penalty.reason,
      amountCents: penalty.amountCents,
      dueAt: due.toISOString(),
      isPastDue: due <= now,
      isDisputed: penalty.dispute?.status === "OPEN",
    };
  });
}

// ---------------------------------------------------------------------------
// Activity feed (global)
// ---------------------------------------------------------------------------

export async function getTeamActivity(limit = 30): Promise<ActivityRow[]> {
  const events = await prisma.activityEvent.findMany({
    where: await activityVisibilityWhere(),
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return events.map((event) => ({
    id: event.id,
    type: event.type,
    actorName: event.actorName,
    summary: event.summary,
    entityLabel: event.entityLabel,
    createdAt: event.createdAt.toISOString(),
    isForYou: false,
  }));
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
}

/** Pinned, unexpired, and not yet dismissed by this member. */
export async function getAnnouncements(
  memberId: string,
): Promise<AnnouncementRow[]> {
  const now = new Date();

  const announcements = await prisma.announcement.findMany({
    where: {
      ...{
        pinned: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        dismissals: { none: { memberId } },
      },
      AND: [await entityVisibilityWhere("announcement")],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      body: true,
      authorName: true,
      createdAt: true,
    },
  });

  return announcements.map((announcement) => ({
    ...announcement,
    createdAt: announcement.createdAt.toISOString(),
  }));
}
