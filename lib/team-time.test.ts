import { describe, expect, it } from "vitest";

import {
  isSameTeamDay,
  teamCalendarDaysBetween,
  teamDayStart,
  teamDayStartPlus,
  teamMonthLabel,
  teamMonthStart,
  teamNextMonthStart,
} from "./team-time";

/**
 * Manila is UTC+8 with no DST currently observed, so a team-local midnight
 * is 16:00 UTC on the previous day. These assertions are written against
 * that absolute instant rather than against local formatting, so they hold
 * whatever timezone the test runner itself is in — which is the entire
 * point of the module.
 */
describe("teamMonthStart", () => {
  it("returns Manila's month boundary, not the server's", () => {
    // 2026-09-01T02:00 Manila = 2026-08-31T18:00Z. Naive server-local (UTC)
    // maths would call this August and exclude it from September's totals.
    const justAfterMidnightManila = new Date("2026-08-31T18:00:00.000Z");
    expect(teamMonthStart(justAfterMidnightManila).toISOString()).toBe("2026-08-31T16:00:00.000Z");
  });

  it("does not roll back a month for a late-UTC instant", () => {
    // 2026-09-01T07:00 Manila = 2026-08-31T23:00Z — still August in UTC.
    const instant = new Date("2026-08-31T23:00:00.000Z");
    expect(teamMonthStart(instant).toISOString()).toBe("2026-08-31T16:00:00.000Z");
  });

  it("handles mid-month instants", () => {
    expect(teamMonthStart(new Date("2026-09-15T05:00:00.000Z")).toISOString()).toBe(
      "2026-08-31T16:00:00.000Z",
    );
  });
});

describe("teamNextMonthStart", () => {
  it("is an exclusive upper bound one month on", () => {
    expect(teamNextMonthStart(new Date("2026-09-15T05:00:00.000Z")).toISOString()).toBe(
      "2026-09-30T16:00:00.000Z",
    );
  });

  it("rolls the year over in December", () => {
    expect(teamNextMonthStart(new Date("2026-12-15T05:00:00.000Z")).toISOString()).toBe(
      "2026-12-31T16:00:00.000Z",
    );
  });

  it("brackets the month exactly — no gap, no overlap", () => {
    const inside = new Date("2026-09-15T05:00:00.000Z");
    const start = teamMonthStart(inside);
    const end = teamNextMonthStart(inside);
    expect(start.getTime()).toBeLessThan(inside.getTime());
    expect(end.getTime()).toBeGreaterThan(inside.getTime());
    // The instant one millisecond before the end belongs to this month.
    expect(teamMonthStart(new Date(end.getTime() - 1)).toISOString()).toBe(start.toISOString());
  });
});

describe("teamDayStart", () => {
  it("is Manila midnight, i.e. 16:00Z the day before", () => {
    expect(teamDayStart(new Date("2026-09-06T05:00:00.000Z")).toISOString()).toBe(
      "2026-09-05T16:00:00.000Z",
    );
  });

  it("treats 23:00Z as already the next Manila day", () => {
    // 2026-09-06T23:00Z = 2026-09-07T07:00 Manila.
    expect(teamDayStart(new Date("2026-09-06T23:00:00.000Z")).toISOString()).toBe(
      "2026-09-06T16:00:00.000Z",
    );
  });
});

describe("teamDayStartPlus", () => {
  it("advances whole team-local days", () => {
    expect(teamDayStartPlus(7, new Date("2026-09-06T05:00:00.000Z")).toISOString()).toBe(
      "2026-09-12T16:00:00.000Z",
    );
  });

  it("goes backwards for a negative count", () => {
    expect(teamDayStartPlus(-1, new Date("2026-09-06T05:00:00.000Z")).toISOString()).toBe(
      "2026-09-04T16:00:00.000Z",
    );
  });

  it("crosses a month boundary correctly", () => {
    expect(teamDayStartPlus(1, new Date("2026-08-31T20:00:00.000Z")).toISOString()).toBe(
      "2026-09-01T16:00:00.000Z",
    );
  });
});

describe("isSameTeamDay", () => {
  it("groups instants by Manila's day, not UTC's", () => {
    // Both are 2026-09-06 in Manila, but straddle UTC midnight.
    expect(
      isSameTeamDay(new Date("2026-09-05T17:00:00.000Z"), new Date("2026-09-06T10:00:00.000Z")),
    ).toBe(true);
  });

  it("separates instants that are different Manila days", () => {
    expect(
      isSameTeamDay(new Date("2026-09-05T15:00:00.000Z"), new Date("2026-09-05T17:00:00.000Z")),
    ).toBe(false);
  });
});

describe("teamCalendarDaysBetween", () => {
  it("counts calendar days, not 24h blocks", () => {
    // 23:00 Manila to 01:00 Manila the next day is 2 hours but 1 day.
    const late = new Date("2026-09-05T15:00:00.000Z");
    const earlyNext = new Date("2026-09-05T17:00:00.000Z");
    expect(teamCalendarDaysBetween(late, earlyNext)).toBe(1);
  });

  it("is zero within one Manila day", () => {
    expect(
      teamCalendarDaysBetween(new Date("2026-09-06T00:00:00.000Z"), new Date("2026-09-06T10:00:00.000Z")),
    ).toBe(0);
  });

  it("is negative looking backwards", () => {
    expect(
      teamCalendarDaysBetween(new Date("2026-09-10T05:00:00.000Z"), new Date("2026-09-06T05:00:00.000Z")),
    ).toBe(-4);
  });
});

describe("teamMonthLabel", () => {
  it("names the Manila month", () => {
    expect(teamMonthLabel(new Date("2026-08-31T18:00:00.000Z"))).toBe("September 2026");
  });
});
