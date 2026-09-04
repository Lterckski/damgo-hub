"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HOURS_12, MINUTES_ALL, to12Hour, to24Hour, type MeridiemPeriod } from "@/lib/time-of-day";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

interface TimeOfDaySelectProps {
  id?: string;
  label: string;
  /** "HH:mm", 24-hour. */
  value: string;
  onChange: (hhmm: string) => void;
  required?: boolean;
}

/**
 * Standalone "Hour / Minute / AM-PM" time field — the same three
 * dropdowns date-time-picker.tsx already embeds inside its popup, but
 * rendered directly inline as its own field rather than behind a second
 * click. Split out for 16-meeting-scheduling.md's "Meeting date" /
 * "Meeting time" requirement: two separate required fields side by side,
 * not one combined date+time control.
 *
 * No native `<input type="time">` — this app deliberately replaced every
 * native date/time input with custom pickers (see date-time-picker.tsx's
 * own comment) after a real "Today shortcut mistaken for confirm" bug
 * report; three accessible `Select`s keep that same policy rather than
 * reintroducing native picker chrome.
 */
export function TimeOfDaySelect({ id, label, value, onChange, required = false }: TimeOfDaySelectProps) {
  const { hour12, minute, period } = to12Hour(value || "09:00");

  function update(nextHour12: number, nextMinute: number, nextPeriod: MeridiemPeriod) {
    onChange(to24Hour(nextHour12, nextMinute, nextPeriod));
  }

  return (
    <div>
      <label id={id ? `${id}-label` : undefined} className={FIELD_LABEL_CLASS}>
        {label} {required && <span className="text-error">*</span>}
      </label>
      <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby={id ? `${id}-label` : undefined}>
        <Select value={String(hour12)} onValueChange={(v) => v && update(Number(v), minute, period)}>
          <SelectTrigger id={id} className="w-full" aria-label={`${label} — hour`}>
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
          value={String(minute).padStart(2, "0")}
          onValueChange={(v) => v && update(hour12, Number(v), period)}
        >
          <SelectTrigger className="w-full" aria-label={`${label} — minute`}>
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
        <Select value={period} onValueChange={(v) => v && update(hour12, minute, v as MeridiemPeriod)}>
          <SelectTrigger className="w-full" aria-label={`${label} — AM or PM`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
