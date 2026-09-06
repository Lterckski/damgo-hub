import { describe, expect, it } from "vitest";

import { MissingReasonError, requireReason } from "./audit-log";

describe("requireReason", () => {
  it("returns the trimmed reason when one is given", () => {
    expect(requireReason("  Approved out of band by the Leader  ")).toBe(
      "Approved out of band by the Leader",
    );
  });

  it("throws on anything that isn't a real justification", () => {
    // Every override route funnels through this, so an empty or
    // whitespace-only reason has to fail loudly rather than log a blank.
    expect(() => requireReason("")).toThrow(MissingReasonError);
    expect(() => requireReason("   ")).toThrow(MissingReasonError);
    expect(() => requireReason("ok")).toThrow(MissingReasonError);
    expect(() => requireReason(null)).toThrow(MissingReasonError);
    expect(() => requireReason(undefined)).toThrow(MissingReasonError);
    expect(() => requireReason(123)).toThrow(MissingReasonError);
  });

  it("accepts exactly three characters", () => {
    expect(requireReason("N/A")).toBe("N/A");
  });
});
