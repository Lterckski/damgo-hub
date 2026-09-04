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
    const known = KNOWN_MEETING_SERVICES.find(
      (service) => host === service.match || host.endsWith(`.${service.match}`),
    );
    return known?.label ?? "External meeting";
  } catch {
    return "External meeting";
  }
}

/**
 * Combines a date-only ISO string (from the "Meeting date" field, always
 * midnight local time) with an "HH:mm" 24-hour time (from "Meeting time")
 * into one full ISO datetime — same math date-time-picker.tsx's own
 * `confirm()` uses for its combined date+time mode, extracted here since
 * meeting-form-dialog.tsx now keeps date and time as two separate fields
 * per 16-meeting-scheduling.md's split. Returns `""` if either input is
 * missing/unparseable, so a caller can treat that as "not ready to submit"
 * without needing its own separate validity check.
 */
export function combineDateAndTime(dateIso: string, hhmm: string): string {
  if (!dateIso) return "";
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "";
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return "";
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

/**
 * Trims and drops empty agenda-item drafts before they're submitted — see
 * 16-meeting-scheduling.md's "Do not submit empty agenda items."
 */
export function normalizeAgendaItemDrafts(drafts: string[]): string[] {
  return drafts.map((draft) => draft.trim()).filter((draft) => draft !== "");
}

/**
 * What `endsAt` should actually be written on a `PATCH` — the Schedule/
 * Edit Meeting form no longer has an "Ends" field and never sends the key
 * at all, so an existing meeting's already-set `endsAt` must survive an
 * edit that has nothing to do with it (backward compatibility for old
 * records). A caller that *does* send the key — explicitly setting or
 * clearing it — is still honored; only a genuinely absent key means
 * "leave it alone." Lives here, not lib/meetings.ts, so it's testable
 * without that module's top-level `lib/prisma.ts` import needing a real
 * `DATABASE_URL` in the test environment.
 */
export function resolveEffectiveEndsAt(
  endsAtProvided: boolean,
  submittedEndsAt: Date | null,
  currentEndsAt: Date | null,
): Date | null {
  return endsAtProvided ? submittedEndsAt : currentEndsAt;
}
