"use client";

import { useState } from "react";
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
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HOURS_12, MINUTES_ALL, to12Hour, to24Hour } from "@/lib/time-of-day";
import { cn } from "@/lib/utils";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

interface DateTimePickerProps {
  id?: string;
  label: string;
  value: string; // ISO string, or "" if unset
  onChange: (iso: string) => void;
  includeTime?: boolean;
  required?: boolean;
}

/**
 * A custom date (and optionally time) picker with an explicit "Select"
 * button — replaces the native `<input type="date"/"datetime-local">`
 * picker, whose "Today" shortcut sits right next to the calendar and is
 * easy to hit by mistake thinking it confirms the highlighted day (it
 * doesn't — it jumps to today instead). That's native browser chrome we
 * can't restyle or add a button to (same category of problem as a file
 * input's "No file chosen" text — see ui-context.md's Contrast rule), so
 * this replaces it outright rather than trying to work around it.
 */
export function DateTimePicker({
  id,
  label,
  value,
  onChange,
  includeTime = true,
  required = false,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(value ? new Date(value) : new Date()));
  const [pendingDate, setPendingDate] = useState<Date | null>(value ? new Date(value) : null);
  const [pendingTime, setPendingTime] = useState(value ? format(new Date(value), "HH:mm") : "09:00");

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(visibleMonth)),
    end: endOfWeek(endOfMonth(visibleMonth)),
  });

  function openPicker() {
    const base = value ? new Date(value) : new Date();
    setPendingDate(value ? new Date(value) : null);
    setPendingTime(value ? format(new Date(value), "HH:mm") : "09:00");
    setVisibleMonth(startOfMonth(base));
    setIsOpen(true);
  }

  function confirm() {
    if (!pendingDate) return;
    const final = new Date(pendingDate);
    if (includeTime) {
      const [hours, minutes] = pendingTime.split(":").map(Number);
      final.setHours(hours, minutes, 0, 0);
    } else {
      final.setHours(0, 0, 0, 0);
    }
    onChange(final.toISOString());
    setIsOpen(false);
  }

  const displayValue = value
    ? includeTime
      ? format(new Date(value), "MMM d, yyyy 'at' h:mm a")
      : format(new Date(value), "MMM d, yyyy")
    : "";

  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label} {required && <span className="text-error">*</span>}
      </label>
      <button
        id={id}
        type="button"
        onClick={openPicker}
        aria-haspopup="dialog"
        className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-sm text-copy-primary transition-colors hover:border-ring"
      >
        <span className={displayValue ? "" : "text-copy-faint"}>{displayValue || "Select a date…"}</span>
        <CalendarDays className="h-4 w-4 text-copy-secondary" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-copy-primary">{label}</DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-copy-primary">{format(visibleMonth, "MMMM yyyy")}</p>
            <div className="flex gap-1">
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
                size="icon-sm"
                onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-copy-secondary uppercase">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {days.map((day) => {
              const selected = pendingDate && isSameDay(day, pendingDate);
              const inMonth = isSameMonth(day, visibleMonth);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setPendingDate(day)}
                  className={cn(
                    "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    selected
                      ? "bg-brand font-bold text-base"
                      : inMonth
                        ? "text-copy-primary hover:bg-subtle"
                        : "text-copy-faint hover:bg-subtle",
                    !selected && isToday(day) && "ring-1 ring-brand",
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          {includeTime && (
            <div>
              <label className={FIELD_LABEL_CLASS}>Time</label>
              <div className="grid grid-cols-3 gap-2">
                <Select
                  value={String(to12Hour(pendingTime).hour12)}
                  onValueChange={(v) => {
                    if (!v) return;
                    const { minute, period } = to12Hour(pendingTime);
                    setPendingTime(to24Hour(Number(v), minute, period));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS_12.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(to12Hour(pendingTime).minute).padStart(2, "0")}
                  onValueChange={(v) => {
                    if (!v) return;
                    const { hour12, period } = to12Hour(pendingTime);
                    setPendingTime(to24Hour(hour12, Number(v), period));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MINUTES_ALL.map((m) => (
                      <SelectItem key={m} value={String(m).padStart(2, "0")}>
                        {String(m).padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={to12Hour(pendingTime).period}
                  onValueChange={(v) => {
                    if (!v) return;
                    const { hour12, minute } = to12Hour(pendingTime);
                    setPendingTime(to24Hour(hour12, minute, v as "AM" | "PM"));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={!pendingDate}>
              Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
