import { taskVisibilityWhere } from "@/lib/hub/context";
import { differenceInCalendarDays } from "date-fns";
import { get } from "@vercel/blob";

import { prisma } from "@/lib/prisma";
import { FunctionalRole } from "@/app/generated/prisma/enums";
import type { IdeaNode } from "@/types/roadmap";

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
      where: {
        AND: [
          await taskVisibilityWhere(),
          { dueDate: { gte: now, lte: weekOut }, status: { not: "DONE" } },
        ],
      },
      select: { id: true, title: true, dueDate: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const items: UpcomingItem[] = [
    ...events.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startAt.toISOString(),
    })),
    ...tasks.map((t) => ({
      id: t.id,
      title: `${t.title} (${dueInLabel(t.dueDate, now)})`,
      startsAt: t.dueDate.toISOString(),
    })),
  ];

  return items
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, limit);
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

export interface RecentIdea {
  id: string;
  text: string;
  authorName: string;
  colorIndex: number;
}

// The single IdeasBoard row's fixed, known id — see 19-ideas-board.md and
// its own migration's seed insert. Never generated, always this literal.
const IDEAS_BOARD_ID = "ideas-board";

/**
 * Latest few idea notes for the dashboard's Recent Ideas widget — see
 * 22-dashboard-data-wiring.md. Live board state lives in a Liveblocks room,
 * not the database, so this reads the same last-autosaved-snapshot Blob the
 * board itself loads from on open (GET /api/boards/ideas/snapshot's
 * counterpart, read directly here rather than over HTTP since this already
 * runs server-side) — a lag of at most one autosave interval behind the
 * live board, matching the spec's explicit fallback.
 *
 * `useLiveblocksFlow`'s "add" change appends to the end of the nodes array
 * (see components/ideas/ideas-canvas.tsx's `addIdea`), so the last N items
 * are the most recently created notes — there's no separate createdAt on
 * IdeaNodeData to sort by instead.
 */
export async function getRecentIdeas(limit = 5): Promise<RecentIdea[]> {
  const board = await prisma.ideasBoard.findUnique({
    where: { id: IDEAS_BOARD_ID },
    select: { snapshotPath: true },
  });
  if (!board?.snapshotPath) return [];

  // A Blob read/parse failure here shouldn't break the whole dashboard
  // panel — this call sits inside MyDashboardPanel's Promise.all, so a
  // thrown rejection would take every other widget down with it. Falls
  // back to the same "nothing to show" empty state a missing snapshot
  // already gets.
  let nodes: IdeaNode[];
  try {
    const blob = await get(board.snapshotPath, { access: "private" });
    if (!blob?.stream) return [];

    const text = await new Response(blob.stream).text();
    const snapshot: unknown = JSON.parse(text);
    const parsedNodes =
      snapshot &&
      typeof snapshot === "object" &&
      Array.isArray((snapshot as { nodes?: unknown }).nodes)
        ? (snapshot as { nodes: IdeaNode[] }).nodes
        : [];
    nodes = parsedNodes;
  } catch (error) {
    console.error("Failed to read ideas board snapshot for dashboard", error);
    return [];
  }

  const notes = nodes.filter((node) => node.data.text.trim() !== "");
  if (notes.length === 0) return [];

  const recent = notes.slice(-limit).reverse();
  const authorIds = [...new Set(recent.map((node) => node.data.authorId))];
  const authors = await prisma.member.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, displayName: true },
  });
  const nameById = new Map(
    authors.map((author) => [author.id, author.displayName]),
  );

  return recent.map((node) => ({
    id: node.id,
    text: node.data.text,
    authorName: nameById.get(node.data.authorId) ?? "Unknown member",
    colorIndex: node.data.colorIndex,
  }));
}
