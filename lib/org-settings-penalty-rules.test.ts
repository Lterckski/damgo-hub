import { describe, expect, it } from "vitest";

import { parsePenaltyRules } from "./org-settings";

describe("parsePenaltyRules", () => {
  it("keeps well-formed rules and trims labels", () => {
    expect(
      parsePenaltyRules([{ label: "  Late  ", amountCents: 5000 }]),
    ).toEqual([{ label: "Late", amountCents: 5000 }]);
  });

  it("drops a rule using the reserved Other label, in any casing", () => {
    // Otherwise the dropdown renders two options with the same value, and
    // picking the wrong one silently opens the free-text fields.
    expect(
      parsePenaltyRules([
        { label: "Other", amountCents: 100 },
        { label: "other", amountCents: 200 },
        { label: "  OTHER  ", amountCents: 300 },
        { label: "Late", amountCents: 5000 },
      ]),
    ).toEqual([{ label: "Late", amountCents: 5000 }]);
  });

  it("keeps the first of two labels that differ only by case or padding", () => {
    expect(
      parsePenaltyRules([
        { label: "Late", amountCents: 5000 },
        { label: "  late ", amountCents: 9999 },
      ]),
    ).toEqual([{ label: "Late", amountCents: 5000 }]);
  });

  it("still drops malformed entries", () => {
    expect(
      parsePenaltyRules([
        { label: "", amountCents: 100 },
        { label: "No amount" },
        { label: "Negative", amountCents: -1 },
        { label: "Fractional", amountCents: 1.5 },
        null,
        "nope",
        { label: "Good", amountCents: 0 },
      ]),
    ).toEqual([{ label: "Good", amountCents: 0 }]);
  });

  it("returns an empty list for non-array input", () => {
    expect(parsePenaltyRules(null)).toEqual([]);
    expect(parsePenaltyRules({})).toEqual([]);
    expect(parsePenaltyRules(undefined)).toEqual([]);
  });
});
