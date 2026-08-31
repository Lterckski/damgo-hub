"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterMultiSelectProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

/**
 * Compact "Assignee (2)"-style filter dropdown for the calendar filter bar
 * (calendar-filters.tsx) — a lighter sibling to
 * components/tasks/document-multi-select.tsx: no search bar, no chips
 * below the trigger, since these lists (members, projects, 3 priority
 * levels) are always short enough to just scan. Stays a controlled,
 * teal-accented outline button so it reads as "filter," not "form field."
 */
export function FilterMultiSelect({ label, options, selected, onChange }: FilterMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(selected.length > 0 && "border-brand/50 bg-accent-dim text-brand")}
          />
        }
      >
        {label}
        {selected.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-56 p-1.5">
        <div className="max-h-64 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-2 py-2 text-xs text-copy-secondary">Nothing to filter by yet.</p>
          ) : (
            options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-copy-primary hover:bg-subtle"
              >
                <Checkbox checked={selected.includes(option.value)} onCheckedChange={() => toggle(option.value)} />
                <span className="truncate">{option.label}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
