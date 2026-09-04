"use client";

import { Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilterMultiSelect, type FilterOption } from "@/components/shared/filter-multi-select";
import { TASK_PRIORITY_OPTIONS } from "@/lib/tasks";

// Sentinel for "no project" — same pattern as NO_PROJECT in the task
// dialogs, just calendar-scoped since a project id can never collide with
// this string.
export const STANDALONE_PROJECT_KEY = "__standalone__";

export interface CalendarFilterState {
  assigneeIds: string[];
  projectKeys: string[]; // project ids, or STANDALONE_PROJECT_KEY
  priorities: string[]; // TaskPriority values: LOW | MEDIUM | HIGH
  myTasksOnly: boolean;
}

export const DEFAULT_CALENDAR_FILTERS: CalendarFilterState = {
  assigneeIds: [],
  projectKeys: [],
  priorities: [],
  myTasksOnly: false,
};

export function isDefaultFilterState(filters: CalendarFilterState): boolean {
  return (
    filters.assigneeIds.length === 0 &&
    filters.projectKeys.length === 0 &&
    filters.priorities.length === 0 &&
    !filters.myTasksOnly
  );
}

// The task priority system that actually exists in the schema is
// LOW/MEDIUM/HIGH (see lib/tasks.ts's TASK_PRIORITY_OPTIONS) — there's no
// separate Urgent/Moderate/Complete tier anywhere in the app. Filtering
// against real values here rather than inventing new labels that don't
// correspond to anything a task can actually have.
const PRIORITY_OPTIONS: FilterOption[] = TASK_PRIORITY_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

interface CalendarFiltersProps {
  filters: CalendarFilterState;
  onChange: (filters: CalendarFilterState) => void;
  memberOptions: FilterOption[];
  projectOptions: FilterOption[];
}

/**
 * Filter bar for /calendar — Assignee/Project/Priority multi-selects plus
 * a one-click "My Tasks Only" toggle, per the user's explicit spec. Each
 * dropdown carries its own active-count badge, and "Clear Filters" shows
 * the combined count — that's this app's take on requirement #4's "small
 * badge on the filter button," rather than one extra wrapping button
 * nobody would need to open just to see the count.
 *
 * Purely presentational — CalendarView owns the actual filter state (it's
 * also what does the filtering) and passes it down, same pattern as every
 * other piece of view state in that component.
 */
export function CalendarFilters({ filters, onChange, memberOptions, projectOptions }: CalendarFiltersProps) {
  const activeCount =
    filters.assigneeIds.length +
    filters.projectKeys.length +
    filters.priorities.length +
    (filters.myTasksOnly ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-3.5 w-3.5 shrink-0 text-copy-secondary" />
      <Button
        type="button"
        variant={filters.myTasksOnly ? "default" : "outline"}
        size="sm"
        onClick={() => onChange({ ...filters, myTasksOnly: !filters.myTasksOnly })}
      >
        My Tasks Only
      </Button>
      <FilterMultiSelect
        label="Assignee"
        options={memberOptions}
        selected={filters.assigneeIds}
        onChange={(assigneeIds) => onChange({ ...filters, assigneeIds })}
      />
      <FilterMultiSelect
        label="Project"
        options={projectOptions}
        selected={filters.projectKeys}
        onChange={(projectKeys) => onChange({ ...filters, projectKeys })}
      />
      <FilterMultiSelect
        label="Priority"
        options={PRIORITY_OPTIONS}
        selected={filters.priorities}
        onChange={(priorities) => onChange({ ...filters, priorities })}
      />
      {activeCount > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(DEFAULT_CALENDAR_FILTERS)}>
          <X className="h-3.5 w-3.5" /> Clear Filters ({activeCount})
        </Button>
      )}
    </div>
  );
}
