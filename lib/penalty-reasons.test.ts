import { describe, expect, it } from "vitest";

import {
  isOtherPenaltyReason,
  OTHER_PENALTY_REASON,
  resolvePenaltyReason,
} from "./penalties";

const rules = [
  { label: "Late to a meeting", amountCents: 5000 },
  { label: "Missed a deadline", amountCents: 10000 },
  { label: "Verbal warning", amountCents: 0 },
];

describe("isOtherPenaltyReason", () => {
  it("matches the escape hatch regardless of case or padding", () => {
    expect(isOtherPenaltyReason("Other")).toBe(true);
    expect(isOtherPenaltyReason("other")).toBe(true);
    expect(isOtherPenaltyReason("  OTHER  ")).toBe(true);
  });

  it("does not match a configured rule", () => {
    expect(isOtherPenaltyReason("Late to a meeting")).toBe(false);
  });
});

describe("resolvePenaltyReason", () => {
  it("resolves a configured rule and carries its fixed amount", () => {
    const result = resolvePenaltyReason("Late to a meeting", rules);
    expect(result).toEqual({
      kind: "preset",
      rule: { label: "Late to a meeting", amountCents: 5000 },
    });
  });

  it("matches a rule case-insensitively", () => {
    const result = resolvePenaltyReason("late to A MEETING", rules);
    expect(result).toMatchObject({ kind: "preset" });
  });

  it("resolves the free-text option", () => {
    expect(resolvePenaltyReason(OTHER_PENALTY_REASON, rules)).toEqual({
      kind: "other",
    });
  });

  it("rejects a label that is neither a rule nor Other", () => {
    // The important case: a hand-crafted request must not be able to pass an
    // arbitrary reason off as a preset, and must not silently fall through
    // to free text either.
    expect(resolvePenaltyReason("Whatever I feel like", rules)).toBeNull();
  });

  it("rejects empty and non-string input", () => {
    expect(resolvePenaltyReason("", rules)).toBeNull();
    expect(resolvePenaltyReason("   ", rules)).toBeNull();
    expect(resolvePenaltyReason(undefined, rules)).toBeNull();
    expect(resolvePenaltyReason(42, rules)).toBeNull();
    expect(resolvePenaltyReason(null, rules)).toBeNull();
  });

  it("offers only Other when no rules are configured", () => {
    expect(resolvePenaltyReason(OTHER_PENALTY_REASON, [])).toEqual({
      kind: "other",
    });
    expect(resolvePenaltyReason("Late to a meeting", [])).toBeNull();
  });

  it("keeps a zero-amount rule as a preset, not a rejection", () => {
    // A non-monetary preset is legitimate — the route turns amountCents 0
    // into a null amount rather than a ₱0.00 fine.
    expect(resolvePenaltyReason("Verbal warning", rules)).toEqual({
      kind: "preset",
      rule: { label: "Verbal warning", amountCents: 0 },
    });
  });
});
