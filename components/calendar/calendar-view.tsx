"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CalendarFilters,
  isDefaultFilterState,
  STANDALONE_PROJECT_KEY,
  type CalendarFilterState,
} from "@/components/calendar/calendar-filters";
import { NewEventDialog } from "@/components/calendar/new-event-dialog";
import { EventDetailDialog } from "@/components/calendar/event-detail-dialog";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TaskPriorityBadge, type TaskPriorityValue } from "@/components/tasks/task-priority-badge";
import { cn } from "@/lib/utils";
import type { SerializedCalendarEvent, UnifiedCalendarItem } from "@/lib/calendar";
import type { SerializedTask, TaskDocOption, TaskMemberOption, TaskProjectOption } from "@/lib/tasks";

const TYPE_DOT: Record<UnifiedCalendarItem["type"], string> = {
  event: "bg-brand",
  task: "bg-warning",
  meeting: "bg-collab",
};

const TYPE_BAR: Record<UnifiedCalendarItem["type"], string> = {
  event: "bg-accent-dim text-brand hover:bg-accent-dim/70",
  task: "bg-warning/20 text-copy-primary",
  meeting: "bg-collab/15 text-collab hover:bg-collab/25",
};

const TYPE_LABEL: Record<UnifiedCalendarItem["type"], string> = {
  event: "Event",
  task: "Task",
  meeting: "Meeting",
};

// How many stacked lanes a week shows before collapsing the rest into a
// per-day "+N more".
const MAX_LANES_PER_WEEK = 3;

// The agenda (right side) only looks this many calendar days ahead,
// starting today — a hard date window, not a count of populated days, per
// the user's explicit "just 5 days from now" call.
const AGENDA_WINDOW_DAYS = 5;

function truncateToDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayIndexInWeek(weekStart: Date, day: Date): number {
  return Math.round((truncateToDay(day).getTime() - weekStart.getTime()) / 86_400_000);
}

interface CalendarBar {
  key: string;
  itemId: string;
  title: string;
  type: UnifiedCalendarItem["type"];
  start: Date;
  end: Date;
}

interface PlacedBar extends CalendarBar {
  lane: number;
}

/**
 * Assigns each bar the lowest lane number that doesn't overlap another bar
 * already in that lane — the standard greedy interval-scheduling approach,
 * computed once across the whole visible month so a multi-week item keeps
 * the same lane on every row it spans, instead of jumping around.
 */
function assignLanes(bars: CalendarBar[]): PlacedBar[] {
  const sorted = [...bars].sort((a, b) => {
    const byStart = a.start.getTime() - b.start.getTime();
    if (byStart !== 0) return byStart;
    return b.end.getTime() - b.start.getTime() - (a.end.getTime() - a.start.getTime());
  });

  const laneEndDates: Date[] = [];
  return sorted.map((bar) => {
    let lane = laneEndDates.findIndex((endDate) => endDate.getTime() < bar.start.getTime());
    if (lane === -1) lane = laneEndDates.length;
    laneEndDates[lane] = bar.end;
    return { ...bar, lane };
  });
}

interface CalendarViewProps {
  items: UnifiedCalendarItem[];
  events: SerializedCalendarEvent[];
  tasks: SerializedTask[];
  members: TaskMemberOption[];
  projects: TaskProjectOption[];
  docs: TaskDocOption[];
  currentMemberId: string;
  isAdmin: boolean;
}

function parseListParam(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return raw.split(",").filter(Boolean);
}

function filtersFromSearchParams(params: URLSearchParams): CalendarFilterState {
  return {
    assigneeIds: parseListParam(params, "assignee"),
    projectKeys: parseListParam(params, "project"),
    priorities: parseListParam(params, "priority"),
    myTasksOnly: params.get("mine") === "1",
  };
}

// Order doesn't carry meaning for any of these lists, so compare sorted —
// two filter states built from equivalent-but-differently-ordered URLs
// should count as equal, not trigger a redundant setFilters.
function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

function calendarFiltersEqual(a: CalendarFilterState, b: CalendarFilterState): boolean {
  return (
    a.myTasksOnly === b.myTasksOnly &&
    sameList(a.assigneeIds, b.assigneeIds) &&
    sameList(a.projectKeys, b.projectKeys) &&
    sameList(a.priorities, b.priorities)
  );
}

export function CalendarView({
  items,
  events,
  tasks,
  members,
  projects,
  docs,
  currentMemberId,
  isAdmin,
}: CalendarViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Read once, on mount, from the URL — a filtered view is shareable/
  // bookmarkable (requirement 5), but the filters themselves are *not*
  // otherwise persisted (no localStorage, no per-user DB row): a fresh
  // /calendar visit with no query params always starts at "All". DECISION
  // POINT (flagged per the user's explicit call): if the team later wants
  // "remember my last filters" across sessions, that's a deliberate
  // addition, not something this implementation does implicitly.
  const [filters, setFilters] = useState<CalendarFilterState>(() => filtersFromSearchParams(searchParams));
  // Tracks the last searchParams string `filters` was derived from, so the
  // render-time adjustment below can tell "the URL changed from outside"
  // apart from "nothing changed" — see that block for why this isn't a
  // useEffect.
  const [syncedSearchParams, setSyncedSearchParams] = useState(() => searchParams.toString());

  // URL -> filters, adjusted during render rather than in a useEffect —
  // this is React's own recommended pattern for "sync state to a changed
  // prop/external value" (react-hooks/set-state-in-effect flags the
  // effect-based version: an extra render+commit+effect cycle where this
  // needs none). CalendarView can stay mounted across a same-route
  // navigation that only changes searchParams (Next.js preserves Client
  // Component state across those), so reading the URL solely in the
  // useState initializer above would leave `filters` stuck on stale
  // values if something outside this component (a Link to
  // "/calendar?priority=HIGH" while already on /calendar, browser back/
  // forward) changes the query string without remounting the component.
  const currentSearchParams = searchParams.toString();
  if (currentSearchParams !== syncedSearchParams) {
    setSyncedSearchParams(currentSearchParams);
    const next = filtersFromSearchParams(searchParams);
    if (!calendarFiltersEqual(filters, next)) setFilters(next);
  }

  // Filters -> URL, not the other way after mount — replace (not push) so
  // tweaking a filter doesn't spam the back button with history entries,
  // and scroll:false so it doesn't jump the page. The write here also
  // updates `syncedSearchParams` (once the resulting navigation lands and
  // `searchParams` changes to match) so the render-time block above
  // doesn't mistake this effect's own write for an external one and loop.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.assigneeIds.length > 0) params.set("assignee", filters.assigneeIds.join(","));
    if (filters.projectKeys.length > 0) params.set("project", filters.projectKeys.join(","));
    if (filters.priorities.length > 0) params.set("priority", filters.priorities.join(","));
    if (filters.myTasksOnly) params.set("mine", "1");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router/pathname are stable; re-running on them would fight the URL write this effect itself performs.
  }, [filters]);

  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const memberOptions = useMemo(
    () => members.map((m) => ({ value: m.id, label: m.displayName })),
    [members],
  );
  const projectOptions = useMemo(
    () => [
      { value: STANDALONE_PROJECT_KEY, label: "Standalone (no project)" },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects],
  );

  // Assignee/Project/Priority describe a *task* — an event has none of
  // them, so those three filters never hide events (there's nothing on an
  // event for them to match or fail to match). "My Tasks Only" is
  // different: read literally ("filters to the current logged-in user's
  // assigned tasks"), it narrows the whole view to just that, so events
  // drop out too while it's active.
  function taskMatchesFilters(task: SerializedTask): boolean {
    if (filters.myTasksOnly && !task.assignees.some((a) => a.id === currentMemberId)) return false;
    if (filters.assigneeIds.length > 0 && !task.assignees.some((a) => filters.assigneeIds.includes(a.id))) {
      return false;
    }
    if (filters.projectKeys.length > 0) {
      const key = task.projectId ?? STANDALONE_PROJECT_KEY;
      if (!filters.projectKeys.includes(key)) return false;
    }
    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false;
    return true;
  }

  const filteredItems = useMemo(() => {
    if (isDefaultFilterState(filters)) return items;
    return items.filter((item) => {
      // Events and meetings have none of Assignee/Project/Priority — only
      // "My Tasks Only" (read literally) narrows the view to just tasks,
      // so both drop out while it's active and are otherwise unaffected.
      if (item.type !== "task") return !filters.myTasksOnly;
      const task = tasksById.get(item.id);
      return task ? taskMatchesFilters(task) : false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- taskMatchesFilters closes over `filters`/`currentMemberId`, already listed.
  }, [items, tasksById, filters, currentMemberId]);

  const bars = useMemo<CalendarBar[]>(
    () =>
      filteredItems.map((item) => {
        const start = truncateToDay(new Date(item.startAt));
        const rawEnd = item.endAt ? truncateToDay(new Date(item.endAt)) : start;
        return {
          key: `${item.type}-${item.id}`,
          itemId: item.id,
          title: item.title,
          type: item.type,
          start,
          end: rawEnd < start ? start : rawEnd,
        };
      }),
    [filteredItems],
  );

  const placedBars = useMemo(() => assignLanes(bars), [bars]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(visibleMonth));
    const gridEnd = endOfWeek(endOfMonth(visibleMonth));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [visibleMonth]);

  const weeks = useMemo(() => {
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [days]);

  // Per-day totals (independent of any one week) — how many bars touch
  // this day at all vs. how many are within the visible lane cap, so
  // overflow can be reported per day even though bars are stacked per week.
  const dayCounts = useMemo(() => {
    const map = new Map<string, { total: number; visible: number }>();
    for (const day of days) {
      const key = day.toDateString();
      const touching = placedBars.filter((bar) => bar.start <= day && bar.end >= day);
      map.set(key, {
        total: touching.length,
        visible: touching.filter((bar) => bar.lane < MAX_LANES_PER_WEEK).length,
      });
    }
    return map;
  }, [placedBars, days]);

  // Agenda — today plus the next AGENDA_WINDOW_DAYS days (a hard date
  // window, not a count of populated days), each item repeated under every
  // day it spans within that window (schedule-view style). A day with
  // nothing on it just doesn't get a section — the window still stops at
  // the same date regardless.
  const agendaDays = useMemo(() => {
    const today = truncateToDay(new Date());
    const windowEnd = new Date(today.getTime() + AGENDA_WINDOW_DAYS * 86_400_000); // exclusive
    const byDay = new Map<string, { date: Date; bars: PlacedBar[] }>();
    for (const bar of placedBars) {
      if (bar.end < today) continue;
      let cursor = bar.start < today ? today : bar.start;
      while (cursor < windowEnd && cursor <= bar.end) {
        const key = cursor.toDateString();
        if (!byDay.has(key)) byDay.set(key, { date: new Date(cursor), bars: [] });
        byDay.get(key)!.bars.push(bar);
        cursor = new Date(cursor.getTime() + 86_400_000);
      }
    }
    return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [placedBars]);

  const openEvent = openEventId ? eventsById.get(openEventId) : null;
  const openTask = openTaskId ? tasksById.get(openTaskId) : null;

  function openItem(bar: CalendarBar) {
    if (bar.type === "event") setOpenEventId(bar.itemId);
    else if (bar.type === "meeting") router.push(`/meetings/${bar.itemId}`);
    else setOpenTaskId(bar.itemId);
  }

  return (
    <div className="flex flex-col gap-4">
      <CalendarFilters
        filters={filters}
        onChange={setFilters}
        memberOptions={memberOptions}
        projectOptions={projectOptions}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Month grid — half the page, natural height so it scrolls with the page, not on its own */}
      <div className="sticky top-4 flex w-full flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface lg:w-1/2">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <p className="text-sm font-bold text-copy-primary">{format(visibleMonth, "MMMM yyyy")}</p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setVisibleMonth((m) => subMonths(m, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setVisibleMonth(startOfMonth(new Date()));
                setSelectedDate(new Date());
              }}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-surface-border">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
            <div
              key={day}
              className="px-2 py-2 text-center text-xs font-bold tracking-wide text-copy-secondary uppercase"
            >
              {day}
            </div>
          ))}
        </div>

        <div>
          {weeks.map((week) => {
            const weekStart = week[0];
            const weekEnd = week[6];
            const segments = placedBars
              .filter((bar) => bar.end >= weekStart && bar.start <= weekEnd && bar.lane < MAX_LANES_PER_WEEK)
              .map((bar) => {
                const segStart = bar.start < weekStart ? weekStart : bar.start;
                const segEnd = bar.end > weekEnd ? weekEnd : bar.end;
                const startCol = dayIndexInWeek(weekStart, segStart);
                const endCol = dayIndexInWeek(weekStart, segEnd);
                return {
                  bar,
                  startCol,
                  span: endCol - startCol + 1,
                  continuesBefore: bar.start < weekStart,
                  continuesAfter: bar.end > weekEnd,
                };
              });

            return (
              <div key={weekStart.toISOString()} className="relative grid grid-cols-7">
                {/* Day-number row — min-h sets this whole week's height */}
                {week.map((day) => {
                  const inMonth = isSameMonth(day, visibleMonth);
                  const selected = isSameDay(day, selectedDate);
                  const today = isToday(day);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "flex min-h-24 justify-end border-t border-l border-surface-border-subtle p-1 last:border-r transition-colors hover:bg-subtle",
                        !inMonth && "bg-base/60",
                        selected && "bg-accent-dim",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                          today ? "bg-brand text-base" : inMonth ? "text-copy-primary" : "text-copy-faint",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                    </button>
                  );
                })}

                {/* Bar lanes — absolutely positioned over the day columns below the numbers */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-6 bottom-3.5 grid gap-0.5 px-0.5"
                  style={{
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gridTemplateRows: `repeat(${MAX_LANES_PER_WEEK}, minmax(0, 1fr))`,
                  }}
                >
                  {segments.map(({ bar, startCol, span, continuesBefore, continuesAfter }) => (
                    <div
                      key={bar.key}
                      role="button"
                      onClick={() => openItem(bar)}
                      className={cn(
                        "pointer-events-auto flex cursor-pointer items-center truncate px-1.5 py-0.5 text-[11px] font-semibold",
                        TYPE_BAR[bar.type],
                        !continuesBefore && "rounded-l",
                        !continuesAfter && "rounded-r",
                      )}
                      style={{
                        gridColumn: `${startCol + 1} / span ${span}`,
                        gridRow: bar.lane + 1,
                      }}
                    >
                      {bar.title}
                    </div>
                  ))}
                </div>

                {/* Per-day "+N more" overflow, anchored to the bottom of each column */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0.5 grid grid-cols-7 px-0.5">
                  {week.map((day) => {
                    const counts = dayCounts.get(day.toDateString());
                    const overflow = counts ? counts.total - counts.visible : 0;
                    return (
                      <span
                        key={day.toISOString()}
                        className="truncate text-right text-[10px] font-semibold text-copy-secondary"
                      >
                        {overflow > 0 ? `+${overflow} more` : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda — the next few days and what's on them, the other half */}
      <div className="w-full space-y-4 lg:w-1/2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold tracking-wide text-copy-primary uppercase">Next 5 Days</p>
          <div className="flex items-center gap-2">
            <NewTaskDialog
              members={members}
              projects={projects}
              docs={docs}
              currentMemberId={currentMemberId}
              isAdmin={isAdmin}
            />
            {isAdmin && <NewEventDialog />}
          </div>
        </div>

        {agendaDays.length === 0 && (
          <p className="rounded-xl border border-surface-border bg-surface px-3 py-6 text-center text-sm text-copy-secondary">
            Nothing coming up in the next {AGENDA_WINDOW_DAYS} days.
          </p>
        )}

        {agendaDays.map(({ date, bars: dayBars }) => (
          <div key={date.toISOString()}>
            <p
              className={cn(
                "mb-2 text-xs font-bold tracking-wide uppercase",
                isToday(date) ? "text-brand" : "text-copy-secondary",
              )}
            >
              {isToday(date) ? "Today · " : ""}
              {format(date, "EEEE, MMMM d")}
            </p>
            <ul className="space-y-2">
              {dayBars.map((bar) => {
                const multiDay = bar.start.getTime() !== bar.end.getTime();
                // Priority + who it's assigned to, for task bars only —
                // events have neither. See the user's explicit call for
                // this format.
                const task = bar.type === "task" ? tasksById.get(bar.itemId) : undefined;
                const assignedTo = task
                  ? task.assignees.length > 0
                    ? task.assignees.map((a) => a.displayName).join(", ")
                    : "Unassigned"
                  : null;
                return (
                  <li
                    key={bar.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => openItem(bar)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-surface-border bg-surface px-3 py-2.5 transition-colors hover:border-brand/40"
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPE_DOT[bar.type])} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium text-copy-primary">{bar.title}</p>
                        {task && <TaskPriorityBadge priority={task.priority as TaskPriorityValue} />}
                      </div>
                      <p className="text-xs font-medium text-copy-secondary">
                        {TYPE_LABEL[bar.type]}
                        {multiDay
                          ? ` · ${format(bar.start, "MMM d")} – ${format(bar.end, "MMM d")}`
                          : ""}
                        {assignedTo ? ` · Assigned to ${assignedTo}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      </div>

      {openEvent && (
        <EventDetailDialog
          event={openEvent}
          canEdit={openEvent.createdById === currentMemberId || isAdmin}
          onClose={() => setOpenEventId(null)}
        />
      )}

      {openTask && (
        <TaskDetailDialog
          task={openTask}
          members={members}
          projects={projects}
          docs={docs}
          currentMemberId={currentMemberId}
          isAdmin={isAdmin}
          onClose={() => setOpenTaskId(null)}
          readOnly
        />
      )}
    </div>
  );
}
