import { describe, expect, it } from "vitest";

import { organizationMemberProfile } from "./member-profile";

describe("organizationMemberProfile", () => {
  it("uses the Clerk member's complete name and identity", () => {
    expect(
      organizationMemberProfile({
        userId: "user_123",
        identifier: "member@example.com",
        firstName: "  Ada ",
        lastName: " Lovelace  ",
        imageUrl: "https://img.clerk.com/ada",
      }),
    ).toEqual({
      clerkUserId: "user_123",
      email: "member@example.com",
      displayName: "Ada Lovelace",
      avatarUrl: "https://img.clerk.com/ada",
    });
  });

  it("falls back to the identifier when Clerk has no name", () => {
    expect(
      organizationMemberProfile({
        userId: "user_456",
        identifier: "new-member@example.com",
        firstName: null,
        lastName: " ",
        imageUrl: "",
      }),
    ).toEqual({
      clerkUserId: "user_456",
      email: "new-member@example.com",
      displayName: "new-member@example.com",
      avatarUrl: null,
    });
  });
});
