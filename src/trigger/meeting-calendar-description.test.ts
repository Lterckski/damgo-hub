// @vitest-environment node
import { describe, expect, it } from "vitest";

import { meetingDescription } from "./sync-calendar-item";

describe("meetingDescription", () => {
  it("includes description, location and join link in order", () => {
    expect(
      meetingDescription({
        description: "Sprint planning",
        location: "Room 2",
        meetingUrl: "https://meet.example.com/abc",
      }),
    ).toBe(
      "Sprint planning\n\nLocation: Room 2\n\nJoin: https://meet.example.com/abc",
    );
  });

  it("omits the parts that are absent", () => {
    expect(
      meetingDescription({
        description: null,
        location: null,
        meetingUrl: "https://meet.example.com/abc",
      }),
    ).toBe("Join: https://meet.example.com/abc");
  });

  it("treats whitespace-only fields as absent", () => {
    expect(
      meetingDescription({ description: "   ", location: "\n", meetingUrl: " " }),
    ).toBeNull();
  });

  it("returns null when the meeting carries none of them", () => {
    expect(
      meetingDescription({ description: null, location: null, meetingUrl: null }),
    ).toBeNull();
  });
});
