/**
 * Shared, escaped HTML email template for every meeting notification type
 * — see 16-meeting-scheduling.md's Email Notifications section. Meeting
 * titles/descriptions/locations/organizer names are untrusted member text
 * and must never be interpolated as raw HTML, per that spec's explicit
 * instruction — everything user-supplied goes through `escapeHtml()`.
 */

import type { MeetingNotificationType } from "@/app/generated/prisma/enums";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type MeetingEmailKind = MeetingNotificationType;

export interface MeetingEmailDetails {
  meetingId: string;
  title: string;
  description: string | null;
  scheduledAt: Date;
  endsAt: Date | null;
  organizerName: string;
  location: string | null;
  meetingUrl: string | null;
}

const SUBJECT_BY_KIND: Record<MeetingEmailKind, (title: string) => string> = {
  INVITATION: (title) => `You're invited: ${title}`,
  UPDATED: (title) => `Updated: ${title}`,
  PARTICIPANT_REMOVED: (title) => `Removed from meeting: ${title}`,
  MEETING_CANCELLED: (title) => `Cancelled: ${title}`,
  REMINDER_24H: (title) => `Reminder: "${title}" is tomorrow`,
  REMINDER_1H: (title) => `Reminder: "${title}" starts in 1 hour`,
};

const INTRO_BY_KIND: Record<MeetingEmailKind, string> = {
  INVITATION: "You've been added as a participant to this meeting.",
  UPDATED: "This meeting's details have changed.",
  PARTICIPANT_REMOVED: "You've been removed from this meeting — you no longer need to attend.",
  MEETING_CANCELLED: "This meeting has been cancelled.",
  REMINDER_24H: "Reminder — this meeting is happening in about 24 hours.",
  REMINDER_1H: "Reminder — this meeting starts in about 1 hour.",
};

// No timezone is documented anywhere in context/*.md — inferred from the
// team being Philippines-based (PHP currency, architecture-context.md
// invariant 8; Filipino names throughout team-roster.md). Every email
// renders in this one fixed zone rather than the recipient's own unknown
// local one, since email has no way to detect that. Flagged here in case
// it's ever wrong — correcting it is a one-line change.
const TEAM_TIMEZONE = "Asia/Manila";

function formatMeetingTime(date: Date): string {
  return `${new Intl.DateTimeFormat("en-PH", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: TEAM_TIMEZONE,
  }).format(date)} (Philippine Time)`;
}

export function meetingEmailSubject(kind: MeetingEmailKind, title: string): string {
  return SUBJECT_BY_KIND[kind](title);
}

export function meetingEmailHtml(kind: MeetingEmailKind, details: MeetingEmailDetails): string {
  const appUrl = process.env.APP_URL ?? "";
  const meetingLink = `${appUrl}/meetings/${details.meetingId}`;

  const rows: string[] = [
    `<p>${escapeHtml(INTRO_BY_KIND[kind])}</p>`,
    `<h2 style="margin:0 0 8px">${escapeHtml(details.title)}</h2>`,
  ];

  if (details.description) {
    rows.push(`<p>${escapeHtml(details.description)}</p>`);
  }

  const when = details.endsAt
    ? `${escapeHtml(formatMeetingTime(details.scheduledAt))} – ${escapeHtml(formatMeetingTime(details.endsAt))}`
    : escapeHtml(formatMeetingTime(details.scheduledAt));
  rows.push(`<p><strong>When:</strong> ${when}</p>`);
  rows.push(`<p><strong>Organizer:</strong> ${escapeHtml(details.organizerName)}</p>`);

  if (details.location) {
    rows.push(`<p><strong>Location:</strong> ${escapeHtml(details.location)}</p>`);
  }
  if (details.meetingUrl) {
    // Validated as an http/https URL at the API boundary before it's ever
    // stored (see app/api/meetings/route.ts) — safe as an href; still run
    // through escapeHtml() as text content for defense in depth.
    const url = escapeHtml(details.meetingUrl);
    rows.push(`<p><strong>Join:</strong> <a href="${url}">${url}</a></p>`);
  }

  const link = escapeHtml(meetingLink);
  rows.push(`<p><a href="${link}">View this meeting in Damgo Hub</a> to see the current final agenda.</p>`);

  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0f172a">${rows.join("\n")}</div>`;
}
