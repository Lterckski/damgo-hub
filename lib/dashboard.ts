import { differenceInCalendarDays } from "date-fns";

import { prisma } from "@/lib/prisma";
import { FunctionalRole } from "@/app/generated/prisma/enums";

export interface UpcomingItem {
  id: string;
  title: string;
  startsAt: string;
}

/** "due today" / "due tomorrow" / "due in N days" — calendar-day
 * difference, not a raw 24h split, so a task due at 1am tomorrow reads as
 * "due tomorrow" even if it's less than 24 hours from right now. */
function dueInLabel(dueDate: Date, now: Date): string {
  const days = differenceInCalendarDays(dueDate, now);
  if (days <= 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

const FUNCTIONAL_ROLE_LABELS: Record<string, string> = {
  PITCHING: "Pitching",
  DOCUMENTS: "Documents",
  CREATIVES: "Creatives",
  PRODUCTION: "Production",
  QUALITY_ASSURANCE: "Quality Assurance",
  MARKETING: "Marketing",
  MODEL: "Model",
};

/**
 * Calendar events + not-yet-done task due dates landing in the next 7
 * days, merged and sorted by date — the same kind of events-plus-tasks
 * merge /api/calendar/events already does for the calendar view (see
 * lib/calendar.ts), scoped to a short window and capped for the
 * dashboard's Upcoming/Team Upcoming widgets.
 *
 * Damgo Hub has no per-member calendar visibility split — every event and
 * task is visible to everyone already (see the calendar page) — so both
 * the personal and team-wide widgets intentionally share this one query
 * rather than inventing a "personal" filter that doesn't exist anywhere
 * else in the app.
 */
export async function getUpcomingItems(limit = 5): Promise<UpcomingItem[]> {
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [events, tasks] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { startAt: { gte: now, lte: weekOut } },
      select: { id: true, title: true, startAt: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.task.findMany({
      where: { dueDate: { gte: now, lte: weekOut }, status: { not: "DONE" } },
      select: { id: true, title: true, dueDate: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const items: UpcomingItem[] = [
    ...events.map((e) => ({ id: e.id, title: e.title, startsAt: e.startAt.toISOString() })),
    ...tasks.map((t) => ({
      id: t.id,
      title: `${t.title} (${dueInLabel(t.dueDate, now)})`,
      startsAt: t.dueDate.toISOString(),
    })),
  ];

  return items.sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, limit);
}

export interface RoleCoverageEntry {
  role: string;
  label: string;
  members: string[];
}

/**
 * Every FunctionalRole, paired with the display names of whoever currently
 * holds it — including roles nobody holds yet ("Unstaffed" in the UI),
 * which is the whole point of a coverage widget. Iterates the enum itself
 * (not a hardcoded list) so a schema change here doesn't silently drop out
 * of sync with the widget.
 */
export async function getRoleCoverage(): Promise<RoleCoverageEntry[]> {
  const assignments = await prisma.memberFunctionalRole.findMany({
    select: { role: true, member: { select: { displayName: true } } },
  });

  const byRole = new Map<string, string[]>();
  for (const role of Object.values(FunctionalRole)) byRole.set(role, []);
  for (const a of assignments) byRole.get(a.role)?.push(a.member.displayName);

  return Object.values(FunctionalRole).map((role) => ({
    role,
    label: FUNCTIONAL_ROLE_LABELS[role] ?? role,
    members: byRole.get(role) ?? [],
  }));
}
