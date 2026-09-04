import { describe, expect, it } from "vitest";

import {
  combineDateAndTime,
  meetingServiceLabel,
  normalizeAgendaItemDrafts,
  resolveEffectiveEndsAt,
} from "./meeting-format";

describe("meetingServiceLabel", () => {
  it("recognizes exact hosts and real subdomains", () => {
    expect(meetingServiceLabel("https://zoom.us/j/123")).toBe("Zoom");
    expect(meetingServiceLabel("https://team.zoom.us/j/123")).toBe("Zoom");
  });

  it("does not trust lookalike suffixes", () => {
    expect(meetingServiceLabel("https://evil-zoom.us/j/123")).toBe("External meeting");
    expect(meetingServiceLabel("https://notteams.live.com/meeting")).toBe("External meeting");
  });
});

describe("combineDateAndTime", () => {
  it("sets the given time onto the given date, in local time", () => {
    const dateIso = new Date(2026, 0, 15).toISOString(); // Jan 15, 2026, local midnight
    const combined = combineDateAndTime(dateIso, "14:30");
    const result = new Date(combined);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });

  it("returns an empty string when the date is missing", () => {
    expect(combineDateAndTime("", "14:30")).toBe("");
  });

  it("returns an empty string when either input is unparseable", () => {
    expect(combineDateAndTime("not-a-date", "14:30")).toBe("");
    expect(combineDateAndTime(new Date(2026, 0, 15).toISOString(), "not-a-time")).toBe("");
  });
});

describe("normalizeAgendaItemDrafts", () => {
  it("trims whitespace and drops empty/whitespace-only drafts", () => {
    expect(normalizeAgendaItemDrafts(["  Review budget  ", "", "   ", "Assign tasks"])).toEqual([
      "Review budget",
      "Assign tasks",
    ]);
  });

  it("returns an empty array when every draft is empty", () => {
    expect(normalizeAgendaItemDrafts(["", "  "])).toEqual([]);
  });
});

describe("resolveEffectiveEndsAt", () => {
  const current = new Date("2026-01-01T10:00:00.000Z");
  const submitted = new Date("2026-01-01T12:00:00.000Z");

  it("preserves the existing endsAt when the key wasn't sent at all", () => {
    expect(resolveEffectiveEndsAt(false, null, current)).toBe(current);
    expect(resolveEffectiveEndsAt(false, submitted, current)).toBe(current);
  });

  it("uses the submitted value (including null, to clear it) when the key was sent", () => {
    expect(resolveEffectiveEndsAt(true, submitted, current)).toBe(submitted);
    expect(resolveEffectiveEndsAt(true, null, current)).toBeNull();
  });
});
