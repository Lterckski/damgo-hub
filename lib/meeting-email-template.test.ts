import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { meetingEmailHtml, meetingEmailSubject, meetingEmailText } from "./meeting-email-template";

const ORIGINAL_APP_URL = process.env.APP_URL;

const details = {
  meetingId: "meeting_123",
  title: "Project <Kickoff>",
  description: "Review goals & responsibilities.",
  scheduledAt: new Date("2026-09-05T01:00:00.000Z"),
  endsAt: null,
  organizerName: "Ada & Grace",
  location: "Room <204>",
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  agendaItems: ["Introductions", "Review <milestones>"],
};

beforeEach(() => {
  process.env.APP_URL = "https://damgo-hub.vercel.app";
});

afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = ORIGINAL_APP_URL;
});

describe("meeting email format", () => {
  it("includes the subject, description, logistics, ordered agenda, and links", () => {
    const html = meetingEmailHtml("INVITATION", details);
    const text = meetingEmailText("INVITATION", details);

    expect(meetingEmailSubject("INVITATION", details.title)).toBe("You're invited: Project <Kickoff>");
    expect(html).toContain("Project &lt;Kickoff&gt;");
    expect(html).toContain("Review goals &amp; responsibilities.");
    expect(html).toContain("Review &lt;milestones&gt;");
    expect(html).toContain(details.meetingUrl);
    expect(html).toContain("https://damgo-hub.vercel.app/meetings/meeting_123");
    expect(text).toContain("1. Introductions");
    expect(text).toContain("2. Review <milestones>");
    expect(text).toContain(`Join: ${details.meetingUrl}`);
  });

  it("does not offer inaccessible join or app links after cancellation", () => {
    const html = meetingEmailHtml("MEETING_CANCELLED", details);
    const text = meetingEmailText("MEETING_CANCELLED", details);

    expect(html).not.toContain("Join the meeting");
    expect(html).not.toContain("View meeting details");
    expect(text).not.toContain("Join:");
    expect(text).not.toContain("View details:");
  });
});
