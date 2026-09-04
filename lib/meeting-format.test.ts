import { describe, expect, it } from "vitest";

import { meetingServiceLabel } from "./meeting-format";

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
