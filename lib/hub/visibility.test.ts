import { describe, expect, it } from "vitest";
import { canSee, audienceGrants, recordWhere, type Viewer } from "./visibility";
const alice: Viewer = {
  orgId: "org-a",
  memberId: "alice",
  role: "org:member",
  projectIds: ["project-a"],
};
describe("shared visibility policy", () => {
  it("does not give an admin a personal-recipient bypass", () => {
    expect(
      canSee({ ...alice, role: "org:admin" }, "org-a", [
        { visibilityScope: "user", recipientId: "bob" },
      ]),
    ).toBe(false);
  });
  it("fails closed across organizations for every audience", () => {
    for (const grant of audienceGrants(alice))
      expect(canSee(alice, "org-b", [grant])).toBe(false);
  });
  it("uses the exact same grants for query and response checks", () => {
    const grants = recordWhere(alice).grants.some.OR;
    expect(grants).toEqual(audienceGrants(alice));
    for (const grant of grants)
      expect(canSee(alice, "org-a", [grant])).toBe(true);
  });
  it("rejects invalid scopes, malformed org grants and unknown projects", () => {
    for (const grant of [
      { visibilityScope: "unknown", recipientId: "" },
      { visibilityScope: "org", recipientId: "alice" },
      { visibilityScope: "project", recipientId: "project-b" },
    ])
      expect(canSee(alice, "org-a", [grant])).toBe(false);
  });
  it("revokes project and role grants as the viewer changes", () => {
    expect(
      canSee({ ...alice, projectIds: [] }, "org-a", [
        { visibilityScope: "project", recipientId: "project-a" },
      ]),
    ).toBe(false);
    expect(
      canSee(alice, "org-a", [
        { visibilityScope: "role", recipientId: "org:admin" },
      ]),
    ).toBe(false);
  });
});
