import { describe, expect, it } from "vitest";

import { DEFAULT_ORG_SETTINGS, parsePenaltyRules } from "./org-settings";

describe("parsePenaltyRules", () => {
  it("keeps well-formed rules and trims their labels", () => {
    expect(parsePenaltyRules([{ label: "  Late  ", amountCents: 5000 }])).toEqual([
      { label: "Late", amountCents: 5000 },
    ]);
  });

  it("drops malformed entries rather than trusting the Json column", () => {
    // penaltyRules is an untyped Json column, so anything could be in an
    // existing row — a bad entry must not crash the settings panel.
    expect(
      parsePenaltyRules([
        { label: "Valid", amountCents: 100 },
        { label: "", amountCents: 100 },
        { label: "No amount" },
        { label: "Float", amountCents: 10.5 },
        { label: "Negative", amountCents: -1 },
        "not an object",
        null,
      ]),
    ).toEqual([{ label: "Valid", amountCents: 100 }]);
  });

  it("returns an empty list for a non-array value", () => {
    expect(parsePenaltyRules(null)).toEqual([]);
    expect(parsePenaltyRules({ label: "x" })).toEqual([]);
    expect(parsePenaltyRules(undefined)).toEqual([]);
  });
});

describe("DEFAULT_ORG_SETTINGS", () => {
  it("matches the schema defaults, so an unseeded row and a seeded one agree", () => {
    expect(DEFAULT_ORG_SETTINGS.penaltyDueDays).toBe(14);
    expect(DEFAULT_ORG_SETTINGS.projectStaleDays).toBe(14);
    expect(DEFAULT_ORG_SETTINGS.invitePolicy).toBe("ADMIN_ONLY");
    expect(DEFAULT_ORG_SETTINGS.financeCategories).toContain("Penalty");
  });
});
