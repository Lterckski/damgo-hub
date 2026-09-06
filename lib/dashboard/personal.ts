import { getOrgSettings } from "@/lib/org-settings";
import { penaltyDueAt } from "@/lib/admin/queue";
import { prisma } from "@/lib/prisma";
import {
  isSameTeamDay,
  teamCalendarDaysBetween,
  teamDayStart,
  teamDayStartPlus,
  teamMonthLabel,
  teamMonthStart,
  teamNextMonthStart,
  teamTimeLabel,
} from "@/lib/team-time";
import type {
  ActivityRow,
  MyMoney,
  MyPenaltyRow,
  MyProjectRow,
  MyTaskRow,
  TaskBucket,
  TimelineItem,
  UrgentItem,
} from "@/lib/dashboard/types";

/**
 * My Dashboard's data layer. Every function here takes the signed-in
 * member's id and filters in the database — Part 4's rule that personal
 * scoping is server-side, never a client-side filter over a team-wide
 * fetch.
 *
 * Nothing in this module reads or returns admin-only data. A member with
 * no elevated permissions sees exactly what these queries return, which is
 * why My Dashboard can be built without ever consulting the Clerk role.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Row 1 — Needs You Today
// ---------------------------------------------------------------------------

/**
 * Everything genuinely demanding this member's attention right now, merged
 * into one list. The strip is the tab's only red-capable zone, so the bar
 * for inclusion is deliberately high: something is overdue, owed, or
 * starting within a day.
 */
export async function getNeedsYouToday(memberId: string): Promise<UrgentItem[]> {
  const now = new Date();
  const settings = await getOrgSettings();
  const in24h = new Date(now.getTime() + DAY_MS);

  const [overdueTasks, openPenalties, soonMeetings, myPendingProposals] = await Promise.all([
    prisma.task.findMany({
      where: { assignees: { some: { memberId } }, status: { not: "DONE" }, dueDate: { lt: now } },
      select: { id: true, title: true, dueDate: true, project: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.penalty.findMany({
      where: { memberId, status: "OPEN" },
      select: { id: true, reason: true, amountCents: true, dueAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.meeting.findMany({
      where: {
        scheduledAt: { gte: now, lte: in24h },
        participants: { some: { memberId } },
      },
      select: { id: true, title: true, scheduledAt: true, meetingUrl: true, location: true },
      orderBy: { scheduledAt: "asc" },
    }),
    // Agenda proposals this member submitted that an admin hasn't decided.
    // "Awaiting your reply" in the other direction — they're waiting on
    // someone else — so it's informational, never red.
    prisma.agendaProposal.findMany({
      where: { proposedById: memberId, status: "PENDING" },
      select: { id: true, text: true, createdAt: true, meeting: { select: { title: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const items: UrgentItem[] = [];

  for (const task of overdueTasks) {
    const daysLate = Math.abs(teamCalendarDaysBetween(task.dueDate, now));
    items.push({
      id: `task:${task.id}`,
      kind: "OVERDUE_TASK",
      title: task.title,
      detail: [
        `${daysLate} day${daysLate === 1 ? "" : "s"} overdue`,
        task.project?.name ?? null,
      ]
        .filter(Boolean)
        .join(" · "),
      amountCents: null,
      tone: daysLate >= 7 ? "critical" : "warning",
      at: task.dueDate.toISOString(),
      action: { label: "Mark done", kind: "COMPLETE_TASK" },
    });
  }

  for (const penalty of openPenalties) {
    const due = penaltyDueAt(penalty, settings.penaltyDueDays);
    const isPastDue = due <= now;
    items.push({
      id: `penalty:${penalty.id}`,
      kind: "UNPAID_PENALTY",
      title: penalty.reason,
      detail: isPastDue
        ? `Past due ${Math.abs(teamCalendarDaysBetween(due, now))} day(s)`
        : `Due in ${teamCalendarDaysBetween(now, due)} day(s)`,
      amountCents: penalty.amountCents,
      tone: isPastDue ? "critical" : "warning",
      at: due.toISOString(),
      action: { label: "Mark as paid", kind: "PAY_PENALTY" },
    });
  }

  for (const meeting of soonMeetings) {
    items.push({
      id: `meeting:${meeting.id}`,
      kind: "MEETING_SOON",
      title: meeting.title,
      detail: meeting.location,
      amountCents: null,
      // A meeting that hasn't happened yet isn't a failure state — amber at
      // most, never red. Red is reserved for overdue and owed.
      tone: "warning",
      at: meeting.scheduledAt.toISOString(),
      action: meeting.meetingUrl
        ? { label: "Join", kind: "JOIN_MEETING", href: meeting.meetingUrl }
        : { label: "Open", kind: "OPEN", href: `/meetings/${meeting.id}` },
    });
  }

  for (const proposal of myPendingProposals) {
    items.push({
      id: `proposal:${proposal.id}`,
      kind: "AWAITING_YOU",
      title: `Your agenda proposal is awaiting review`,
      detail: `${proposal.text} · ${proposal.meeting.title}`,
      amountCents: null,
      tone: "neutral",
      at: proposal.createdAt.toISOString(),
      action: null,
    });
  }

  // Most pressing first: critical, then warning, then by time.
  const toneRank = { critical: 0, warning: 1, neutral: 2 } as const;
  return items.sort(
    (a, b) => toneRank[a.tone] - toneRank[b.tone] || a.at.localeCompare(b.at),
  );
}

// ---------------------------------------------------------------------------
// Row 2 — My Tasks
// ---------------------------------------------------------------------------

function bucketFor(dueDate: Date, now: Date): TaskBucket {
  if (dueDate < teamDayStart(now)) return "OVERDUE";
  if (isSameTeamDay(dueDate, now)) return "TODAY";
  return dueDate < teamDayStartPlus(7, now) ? "THIS_WEEK" : "LATER";
}

export async function getMyTasks(memberId: string): Promise<MyTaskRow[]> {
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: { assignees: { some: { memberId } }, status: { not: "DONE" } },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      project: { select: { name: true } },
      createdBy: { select: { displayName: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueDate.toISOString(),
    bucket: bucketFor(task.dueDate, now),
    projectName: task.project?.name ?? null,
    assignedByName: task.createdBy.displayName,
  }));
}

// ---------------------------------------------------------------------------
// Row 3 — Upcoming (next 7 days, one timeline)
// ---------------------------------------------------------------------------

/**
 * Meetings, task deadlines, calendar events, hackathon dates and dues
 * deadlines on one axis.
 *
 * Unlike the old `getUpcomingItems()` — which the personal and team widgets
 * shared, so "my" upcoming showed everyone's — this marks each row with
 * `isMine` and the caller decides. Nothing is silently team-wide.
 */
export async function getUpcomingTimeline(memberId: string): Promise<TimelineItem[]> {
  const now = new Date();
  const weekOut = teamDayStartPlus(8, now);

  const [meetings, tasks, events, hackathons, dues] = await Promise.all([
    prisma.meeting.findMany({
      where: { scheduledAt: { gte: now, lt: weekOut } },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        meetingUrl: true,
        location: true,
        participants: { where: { memberId }, select: { id: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.task.findMany({
      where: { dueDate: { gte: now, lt: weekOut }, status: { not: "DONE" } },
      select: {
        id: true,
        title: true,
        dueDate: true,
        project: { select: { name: true } },
        assignees: { where: { memberId }, select: { id: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.calendarEvent.findMany({
      where: { startAt: { gte: now, lt: weekOut } },
      select: { id: true, title: true, startAt: true, createdById: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.hackathon.findMany({
      where: {
        OR: [
          { registrationDeadline: { gte: now, lt: weekOut } },
          { submissionDeadline: { gte: now, lt: weekOut } },
        ],
      },
      select: {
        id: true,
        name: true,
        registrationDeadline: true,
        submissionDeadline: true,
        entryStatus: true,
      },
    }),
    prisma.duesAssessment.findMany({
      where: { memberId, status: "UNPAID", period: { periodEnd: { gte: now, lt: weekOut } } },
      select: { id: true, amountCents: true, period: { select: { label: true, periodEnd: true } } },
    }),
  ]);

  const items: TimelineItem[] = [
    ...meetings.map((meeting) => ({
      id: `meeting:${meeting.id}`,
      kind: "MEETING" as const,
      title: meeting.title,
      detail: meeting.location,
      at: meeting.scheduledAt.toISOString(),
      joinUrl: meeting.meetingUrl,
      isMine: meeting.participants.length > 0,
    })),
    ...tasks.map((task) => ({
      id: `task:${task.id}`,
      kind: "TASK_DUE" as const,
      title: task.title,
      detail: task.project?.name ?? null,
      at: task.dueDate.toISOString(),
      joinUrl: null,
      isMine: task.assignees.length > 0,
    })),
    ...events.map((event) => ({
      id: `event:${event.id}`,
      kind: "EVENT" as const,
      title: event.title,
      detail: null,
      at: event.startAt.toISOString(),
      joinUrl: null,
      isMine: event.createdById === memberId,
    })),
    ...hackathons.flatMap((hackathon) => {
      const rows: TimelineItem[] = [];
      if (hackathon.registrationDeadline && hackathon.registrationDeadline >= now) {
        rows.push({
          id: `hackathon-reg:${hackathon.id}`,
          kind: "HACKATHON",
          title: `${hackathon.name} — registration closes`,
          detail: hackathon.entryStatus,
          at: hackathon.registrationDeadline.toISOString(),
          joinUrl: null,
          isMine: false,
        });
      }
      if (hackathon.submissionDeadline && hackathon.submissionDeadline >= now) {
        rows.push({
          id: `hackathon-sub:${hackathon.id}`,
          kind: "HACKATHON",
          title: `${hackathon.name} — submission due`,
          detail: hackathon.entryStatus,
          at: hackathon.submissionDeadline.toISOString(),
          joinUrl: null,
          isMine: false,
        });
      }
      return rows;
    }),
    ...dues.map((assessment) => ({
      id: `dues:${assessment.id}`,
      kind: "DUES" as const,
      title: `${assessment.period.label} dues due`,
      detail: null,
      at: assessment.period.periodEnd.toISOString(),
      joinUrl: null,
      isMine: true,
    })),
  ];

  return items.sort((a, b) => a.at.localeCompare(b.at));
}

// ---------------------------------------------------------------------------
// Row 4 — My Penalties
// ---------------------------------------------------------------------------

export async function getMyPenalties(memberId: string): Promise<MyPenaltyRow[]> {
  const now = new Date();
  const settings = await getOrgSettings();

  const penalties = await prisma.penalty.findMany({
    where: { memberId },
    select: {
      id: true,
      reason: true,
      amountCents: true,
      status: true,
      dueAt: true,
      createdAt: true,
      resolvedAt: true,
      dispute: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return penalties.map((penalty) => {
    const due = penaltyDueAt(penalty, settings.penaltyDueDays);
    return {
      id: penalty.id,
      reason: penalty.reason,
      amountCents: penalty.amountCents,
      status: penalty.status,
      incurredAt: penalty.createdAt.toISOString(),
      dueAt: due.toISOString(),
      dueAtIsInferred: penalty.dueAt === null,
      isPastDue: penalty.status === "OPEN" && due <= now,
      resolvedAt: penalty.resolvedAt?.toISOString() ?? null,
      disputeStatus: penalty.dispute?.status ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Row 5 — My Money
// ---------------------------------------------------------------------------

/**
 * This member's own position only — never the team balance. The team
 * figures moved to Team Overview, because a personal card showing the
 * org's balance told four of five members something they can't act on.
 */
export async function getMyMoney(memberId: string): Promise<MyMoney> {
  const now = new Date();
  const monthStart = teamMonthStart(now);
  const monthEnd = teamNextMonthStart(now);

  const [openPenalties, unpaidDues, pendingReimbursements, contributions] = await Promise.all([
    prisma.penalty.findMany({
      where: { memberId, status: "OPEN" },
      select: { amountCents: true },
    }),
    prisma.duesAssessment.findMany({
      where: { memberId, status: "UNPAID" },
      select: { amountCents: true },
    }),
    // An expense this member submitted that hasn't been approved yet is
    // money they are out of pocket for — "you're owed".
    prisma.transaction.findMany({
      where: { memberId, type: "EXPENSE", status: "PENDING" },
      select: { amount: true },
    }),
    prisma.transaction.findMany({
      where: {
        memberId,
        type: "INCOME",
        status: "APPROVED",
        createdAt: { gte: monthStart, lt: monthEnd },
      },
      select: { amount: true },
    }),
  ]);

  const penaltiesCents = openPenalties.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
  const duesCents = unpaidDues.reduce((sum, d) => sum + d.amountCents, 0);

  return {
    owedCents: penaltiesCents + duesCents,
    owedBreakdown: { penaltiesCents, duesCents },
    owedToYouCents: pendingReimbursements.reduce((sum, t) => sum + t.amount, 0),
    owedToYouCount: pendingReimbursements.length,
    contributedCents: contributions.reduce((sum, t) => sum + t.amount, 0),
    monthLabel: teamMonthLabel(now),
    asOf: teamTimeLabel(now),
  };
}

// ---------------------------------------------------------------------------
// Row 6 — My Projects
// ---------------------------------------------------------------------------

export async function getMyProjects(memberId: string): Promise<MyProjectRow[]> {
  const now = new Date();

  const projects = await prisma.project.findMany({
    where: {
      status: { in: ["PROPOSED", "ACTIVE"] },
      OR: [{ ownerId: memberId }, { members: { some: { memberId } } }],
    },
    select: {
      id: true,
      name: true,
      status: true,
      ownerId: true,
      blockedReason: true,
      tasks: { select: { id: true, status: true } },
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
    const completed = project.tasks.filter((task) => task.status === "DONE").length;
    const milestone = project.milestones[0] ?? null;

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      role: project.ownerId === memberId ? "Owner" : "Collaborator",
      openTaskCount: project.tasks.length - completed,
      totalTaskCount: project.tasks.length,
      completedTaskCount: completed,
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
// Row 7 — My Activity
// ---------------------------------------------------------------------------

/**
 * Only events aimed at this member — things addressed to them, or that
 * they did. Explicitly not the global feed with a filter applied: the
 * `audienceMemberId` index is what makes this a different query rather
 * than a different rendering.
 */
export async function getMyActivity(memberId: string, limit = 12): Promise<ActivityRow[]> {
  const events = await prisma.activityEvent.findMany({
    where: { OR: [{ audienceMemberId: memberId }, { actorId: memberId }] },
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
    isForYou: event.audienceMemberId === memberId,
  }));
}
