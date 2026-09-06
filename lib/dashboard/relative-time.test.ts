import { describe, expect, it } from "vitest";

import { agoLabel, countdownLabel, dueLabel, relativeDateTimeLabel, relativeDayLabel } from "./relative-time";

// 2026-09-06T05:00:00Z = 2026-09-06 13:00 Manila (a Sunday).
const NOW = new Date("2026-09-06T05:00:00.000Z");

describe("relativeDayLabel", () => {
  it("names today, tomorrow and yesterday", () => {
    expect(relativeDayLabel("2026-09-06T09:00:00.000Z", NOW)).toBe("Today");
    expect(relativeDayLabel("2026-09-07T02:00:00.000Z", NOW)).toBe("Tomorrow");
    expect(relativeDayLabel("2026-09-05T02:00:00.000Z", NOW)).toBe("Yesterday");
  });

  it("counts calendar days, not 24h blocks", () => {
    // 2026-09-06T17:00Z = 2026-09-07 01:00 Manila — 12 hours away, but
    // tomorrow, which is how a deadline actually reads.
    expect(relativeDayLabel("2026-09-06T17:00:00.000Z", NOW)).toBe("Tomorrow");
  });

  it("uses a weekday name inside the coming week", () => {
    expect(relativeDayLabel("2026-09-10T02:00:00.000Z", NOW)).toBe("Thursday");
  });

  it("falls back to a date beyond a week", () => {
    expect(relativeDayLabel("2026-09-24T02:00:00.000Z", NOW)).toBe("Sep 24");
  });

  it("includes the year when it differs", () => {
    expect(relativeDayLabel("2027-02-02T02:00:00.000Z", NOW)).toBe("Feb 2, 2027");
  });
});

describe("relativeDateTimeLabel", () => {
  it("renders the day and the Manila clock time", () => {
    // 2026-09-07T04:00Z = 2026-09-07 12:00 PM Manila.
    expect(relativeDateTimeLabel("2026-09-07T04:00:00.000Z", NOW)).toBe("Tomorrow, 12:00 PM");
  });
});

describe("dueLabel", () => {
  it("covers due and overdue", () => {
    expect(dueLabel("2026-09-06T09:00:00.000Z", NOW)).toBe("Due today");
    expect(dueLabel("2026-09-07T02:00:00.000Z", NOW)).toBe("Due tomorrow");
    expect(dueLabel("2026-09-11T02:00:00.000Z", NOW)).toBe("Due in 5 days");
    expect(dueLabel("2026-09-05T02:00:00.000Z", NOW)).toBe("1 day overdue");
    expect(dueLabel("2026-09-01T02:00:00.000Z", NOW)).toBe("5 days overdue");
  });
});

describe("countdownLabel", () => {
  it("uses elapsed time, not calendar days", () => {
    expect(countdownLabel("2026-09-06T05:30:00.000Z", NOW)).toBe("in 30m");
    expect(countdownLabel("2026-09-06T07:15:00.000Z", NOW)).toBe("in 2h 15m");
    expect(countdownLabel("2026-09-06T09:00:00.000Z", NOW)).toBe("in 4h");
    expect(countdownLabel("2026-09-09T05:00:00.000Z", NOW)).toBe("in 3d");
  });

  it("collapses to 'now' once the moment has passed", () => {
    expect(countdownLabel("2026-09-06T04:00:00.000Z", NOW)).toBe("now");
  });
});

describe("agoLabel", () => {
  it("reads backwards", () => {
    expect(agoLabel("2026-09-06T04:59:30.000Z", NOW)).toBe("just now");
    expect(agoLabel("2026-09-06T04:58:00.000Z", NOW)).toBe("2m ago");
    expect(agoLabel("2026-09-06T04:30:00.000Z", NOW)).toBe("30m ago");
    expect(agoLabel("2026-09-06T01:00:00.000Z", NOW)).toBe("4h ago");
    expect(agoLabel("2026-09-03T05:00:00.000Z", NOW)).toBe("3d ago");
  });
});
