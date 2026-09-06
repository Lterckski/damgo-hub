/**
 * The team's wall clock.
 *
 * Damgo Hub's members are all in the Philippines, and
 * `lib/meeting-email-template.ts` already committed to Asia/Manila for
 * meeting times. Everything else in the app was still computing date
 * boundaries with `new Date(y, m, 1)` — server-local time, which on Vercel
 * is UTC. That put every month boundary 8 hours early: a transaction
 * recorded at 03:00 on the 1st in Manila counted toward the previous
 * month.
 *
 * These helpers are the single place that knows the offset. Nothing should
 * construct a month or day boundary by hand.
 */

export const TEAM_TIMEZONE = "Asia/Manila";

/** How far ahead of UTC the team's zone is at a given instant, in ms. */
function zoneOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TEAM_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  // Reading the zone's wall clock back as if it were UTC gives an instant
  // shifted by exactly the offset. `hour % 24` because hour12:false renders
  // midnight as "24" in some environments.
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
    parts.second,
  );
  return asIfUtc - instant.getTime();
}

/**
 * The team-local calendar parts of an instant. Uses Intl rather than
 * arithmetic on a fixed +8 offset — the offset is a property of the zone,
 * not a constant, and hardcoding it is how these bugs start.
 */
function teamParts(instant: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TEAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = formatter.format(instant).split("-").map(Number);
  return { year, month, day };
}

/**
 * The UTC instant at which a given Manila wall-clock time occurs.
 *
 * Measures the zone's actual offset near the target instant rather than
 * assuming +08:00 — correct even if the Philippines reintroduces DST,
 * which it has used before.
 */
function fromTeamWallClock(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Two passes: the first offset is measured at the wrong instant when the
  // target sits near a transition, the second at (almost exactly) the
  // right one.
  const firstPass = asUtc - zoneOffsetMs(new Date(asUtc));
  return new Date(asUtc - zoneOffsetMs(new Date(firstPass)));
}

/** Start of the current calendar month, in team time. */
export function teamMonthStart(now: Date = new Date()): Date {
  const { year, month } = teamParts(now);
  return fromTeamWallClock(year, month, 1);
}

/** Start of the *next* calendar month, in team time — an exclusive upper bound. */
export function teamNextMonthStart(now: Date = new Date()): Date {
  const { year, month } = teamParts(now);
  return month === 12 ? fromTeamWallClock(year + 1, 1, 1) : fromTeamWallClock(year, month + 1, 1);
}

/** Midnight today, in team time. */
export function teamDayStart(now: Date = new Date()): Date {
  const { year, month, day } = teamParts(now);
  return fromTeamWallClock(year, month, day);
}

/** Midnight N days from today, in team time. */
export function teamDayStartPlus(days: number, now: Date = new Date()): Date {
  const base = teamDayStart(now);
  // Re-derive from the shifted wall-clock date rather than adding 86400s
  // per day, so a DST transition can't drift the boundary by an hour.
  const shifted = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  const { year, month, day } = teamParts(shifted);
  return fromTeamWallClock(year, month, day);
}

/** "September 2026", in team time — the label for the current cycle. */
export function teamMonthLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TEAM_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(now);
}

/** "6:06 PM" in team time — for the "as of" stamp under qualified numbers. */
export function teamTimeLabel(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TEAM_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
}

/** Whether two instants fall on the same team-local calendar day. */
export function isSameTeamDay(a: Date, b: Date): boolean {
  const left = teamParts(a);
  const right = teamParts(b);
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

/** Whole team-local calendar days from `from` to `to`. Negative when `to` is earlier. */
export function teamCalendarDaysBetween(from: Date, to: Date): number {
  return Math.round((teamDayStart(to).getTime() - teamDayStart(from).getTime()) / (24 * 60 * 60 * 1000));
}
