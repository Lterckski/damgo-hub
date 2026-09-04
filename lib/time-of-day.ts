/**
 * Pure 12h/24h time-of-day conversion helpers — shared by
 * components/shared/date-time-picker.tsx (its embedded time-of-day
 * selects) and components/shared/time-of-day-select.tsx (a standalone
 * time-only field, added for 16-meeting-scheduling.md's "Meeting date" /
 * "Meeting time" split). Kept dependency-free and framework-free so both
 * components share one implementation instead of two copies drifting
 * apart, and so it's directly unit-testable without rendering anything.
 */

export const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
export const MINUTES_ALL = Array.from({ length: 60 }, (_, i) => i); // 0..59

export type MeridiemPeriod = "AM" | "PM";

export interface TwelveHourTime {
  hour12: number;
  minute: number;
  period: MeridiemPeriod;
}

/** "14:05" -> { hour12: 2, minute: 5, period: "PM" } */
export function to12Hour(hhmm: string): TwelveHourTime {
  const [h, m] = hhmm.split(":").map(Number);
  const period: MeridiemPeriod = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute: m, period };
}

/** { hour12: 2, minute: 5, period: "PM" } -> "14:05" */
export function to24Hour(hour12: number, minute: number, period: MeridiemPeriod): string {
  const hour = period === "PM" ? (hour12 % 12) + 12 : hour12 % 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
