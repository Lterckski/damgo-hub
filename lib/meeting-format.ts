/**
 * Client-safe meeting display helpers — deliberately split out of
 * lib/meetings.ts, which imports lib/prisma.ts (and, through it, `pg`,
 * a Node-only package). A client component importing even one *value*
 * export from a module pulls that module's own top-level imports into the
 * browser bundle too, `pg`'s Node built-ins (`net`, `tls`, ...) included
 * — confirmed as a real build failure, not a theoretical one, the first
 * time components/meetings/meeting-detail.tsx imported
 * meetingServiceLabel straight from lib/meetings.ts. Type-only imports
 * (`import type {...}`) are fine either way — only functions/values
 * actually called at runtime need to live somewhere prisma-free like
 * this file.
 */

// Recognized external meeting services, by hostname — purely a display
// label for the meetings list (spec: "optional location or external-
// service label"). Anything else with a meetingUrl just reads as a
// generic "External meeting" rather than guessing at every possible host.
const KNOWN_MEETING_SERVICES: { match: string; label: string }[] = [
  { match: "meet.google.com", label: "Google Meet" },
  { match: "zoom.us", label: "Zoom" },
  { match: "teams.microsoft.com", label: "Microsoft Teams" },
  { match: "teams.live.com", label: "Microsoft Teams" },
];

export function meetingServiceLabel(meetingUrl: string): string {
  try {
    const host = new URL(meetingUrl).hostname;
    const known = KNOWN_MEETING_SERVICES.find((service) => host.endsWith(service.match));
    return known?.label ?? "External meeting";
  } catch {
    return "External meeting";
  }
}
