import { TEAM_TIMEZONE, teamCalendarDaysBetween, teamTimeLabel } from "@/lib/team-time";

/**
 * Human-relative date labels — "Tomorrow, 12:00 PM" rather than
 * "Sep 5, 12:00 PM".
 *
 * All differences are counted in **team-local calendar days**, not 24-hour
 * blocks. Something due at 1am tomorrow is "Tomorrow", not "in 7 hours",
 * because that is how people talk about deadlines. This is the same
 * reasoning the old `dueInLabel` in lib/dashboard.ts used, generalised and
 * moved onto Manila time.
 */

function weekdayLabel(instant: Date): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: TEAM_TIMEZONE, weekday: "long" }).format(instant);
}

function dateLabel(instant: Date, now: Date): string {
  const sameYear =
    new Intl.DateTimeFormat("en-PH", { timeZone: TEAM_TIMEZONE, year: "numeric" }).format(instant) ===
    new Intl.DateTimeFormat("en-PH", { timeZone: TEAM_TIMEZONE, year: "numeric" }).format(now);

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TEAM_TIMEZONE,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(instant);
}

/** "Today" / "Tomorrow" / "Friday" / "Sep 24" — the day part only. */
export function relativeDayLabel(iso: string | Date, now: Date = new Date()): string {
  const instant = typeof iso === "string" ? new Date(iso) : iso;
  const days = teamCalendarDaysBetween(now, instant);

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  // Inside the coming week a weekday name is more useful than a date;
  // beyond that it's ambiguous ("Friday" — which one?).
  if (days > 1 && days <= 6) return weekdayLabel(instant);
  if (days < -1 && days >= -6) return `${weekdayLabel(instant)} (${Math.abs(days)}d ago)`;
  return dateLabel(instant, now);
}

/** "Tomorrow, 12:00 PM" — day plus time, for anything with a real clock time. */
export function relativeDateTimeLabel(iso: string | Date, now: Date = new Date()): string {
  const instant = typeof iso === "string" ? new Date(iso) : iso;
  return `${relativeDayLabel(instant, now)}, ${teamTimeLabel(instant)}`;
}

/** "3 days overdue" / "Due today" / "Due in 5 days" — for deadlines. */
export function dueLabel(iso: string | Date, now: Date = new Date()): string {
  const instant = typeof iso === "string" ? new Date(iso) : iso;
  const days = teamCalendarDaysBetween(now, instant);

  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return "1 day overdue";
  return `${Math.abs(days)} days overdue`;
}

/**
 * Short countdown for the Team Pulse strip — "in 2h 15m", "in 3d".
 * Genuinely elapsed time here, not calendar days: a countdown to a meeting
 * starting soon is about hours, not dates.
 */
export function countdownLabel(iso: string | Date, now: Date = new Date()): string {
  const instant = typeof iso === "string" ? new Date(iso) : iso;
  const ms = instant.getTime() - now.getTime();
  if (ms <= 0) return "now";

  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `in ${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `in ${hours}h` : `in ${hours}h ${rest}m`;
  }

  return `in ${Math.floor(hours / 24)}d`;
}

/** "2h ago", "3d ago" — for activity feed timestamps. */
export function agoLabel(iso: string | Date, now: Date = new Date()): string {
  const instant = typeof iso === "string" ? new Date(iso) : iso;
  const ms = now.getTime() - instant.getTime();
  if (ms < 60_000) return "just now";

  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dateLabel(instant, now);
}
