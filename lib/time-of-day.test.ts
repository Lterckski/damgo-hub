import { describe, expect, it } from "vitest";

import { to12Hour, to24Hour } from "./time-of-day";

describe("to12Hour", () => {
  it("converts midnight and noon boundaries correctly", () => {
    expect(to12Hour("00:00")).toEqual({ hour12: 12, minute: 0, period: "AM" });
    expect(to12Hour("12:00")).toEqual({ hour12: 12, minute: 0, period: "PM" });
  });

  it("converts a regular afternoon time", () => {
    expect(to12Hour("14:05")).toEqual({ hour12: 2, minute: 5, period: "PM" });
  });

  it("converts a regular morning time", () => {
    expect(to12Hour("09:30")).toEqual({ hour12: 9, minute: 30, period: "AM" });
  });
});

describe("to24Hour", () => {
  it("converts midnight and noon boundaries correctly", () => {
    expect(to24Hour(12, 0, "AM")).toBe("00:00");
    expect(to24Hour(12, 0, "PM")).toBe("12:00");
  });

  it("converts a regular afternoon time", () => {
    expect(to24Hour(2, 5, "PM")).toBe("14:05");
  });

  it("round-trips through to12Hour for every hour/period combination", () => {
    for (const hour12 of Array.from({ length: 12 }, (_, i) => i + 1)) {
      for (const period of ["AM", "PM"] as const) {
        const hhmm = to24Hour(hour12, 30, period);
        expect(to12Hour(hhmm)).toEqual({ hour12, minute: 30, period });
      }
    }
  });
});
