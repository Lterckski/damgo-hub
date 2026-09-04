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
  agendaItems: string[];
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

  const isActiveMeeting = kind !== "PARTICIPANT_REMOVED" && kind !== "MEETING_CANCELLED";
  const rows: string[] = [
    `<p style="margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Damgo Hub meeting</p>`,
    `<h1 style="margin:0 0 12px;color:#0f172a;font-size:26px;line-height:1.25">${escapeHtml(details.title)}</h1>`,
    `<p style="margin:0 0 24px;color:#475569">${escapeHtml(INTRO_BY_KIND[kind])}</p>`,
  ];

  if (details.description) {
    rows.push(`<h2 style="margin:24px 0 8px;font-size:16px">Description</h2>`);
    rows.push(`<p style="margin:0;color:#334155;white-space:pre-line">${escapeHtml(details.description)}</p>`);
  }

  const when = details.endsAt
    ? `${escapeHtml(formatMeetingTime(details.scheduledAt))} – ${escapeHtml(formatMeetingTime(details.endsAt))}`
    : escapeHtml(formatMeetingTime(details.scheduledAt));
  rows.push(`<div style="margin:24px 0;padding:16px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc">`);
  rows.push(`<p style="margin:0 0 8px"><strong>When:</strong> ${when}</p>`);
  rows.push(`<p style="margin:0"><strong>Organizer:</strong> ${escapeHtml(details.organizerName)}</p>`);

  if (details.location) {
    rows.push(`<p style="margin:8px 0 0"><strong>Location:</strong> ${escapeHtml(details.location)}</p>`);
  }
  rows.push(`</div>`);

  if (details.agendaItems.length > 0) {
    rows.push(`<h2 style="margin:24px 0 8px;font-size:16px">Agenda</h2>`);
    rows.push(
      `<ol style="margin:0;padding-left:24px;color:#334155">${details.agendaItems
        .map((item) => `<li style="margin:0 0 8px">${escapeHtml(item)}</li>`)
        .join("")}</ol>`,
    );
  } else if (isActiveMeeting) {
    rows.push(`<p style="margin:24px 0;color:#64748b"><em>No agenda items have been added yet.</em></p>`);
  }

  if (isActiveMeeting && details.meetingUrl) {
    const url = escapeHtml(details.meetingUrl);
    rows.push(
      `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0d9488;color:#fff;font-weight:700;text-decoration:none">Join the meeting</a></p>`,
    );
  }

  if (isActiveMeeting) {
    const link = escapeHtml(meetingLink);
    rows.push(
      `<p style="margin:16px 0 0"><a href="${link}" style="color:#0f766e">View meeting details in Damgo Hub</a></p>`,
    );
  }

  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#0f172a">${rows.join("\n")}</div>`;
}

export function meetingEmailText(kind: MeetingEmailKind, details: MeetingEmailDetails): string {
  const isActiveMeeting = kind !== "PARTICIPANT_REMOVED" && kind !== "MEETING_CANCELLED";
  const lines = [
    "DAMGO HUB MEETING",
    details.title,
    "",
    INTRO_BY_KIND[kind],
  ];

  if (details.description) lines.push("", "DESCRIPTION", details.description);

  const when = details.endsAt
    ? `${formatMeetingTime(details.scheduledAt)} – ${formatMeetingTime(details.endsAt)}`
    : formatMeetingTime(details.scheduledAt);
  lines.push("", `When: ${when}`, `Organizer: ${details.organizerName}`);
  if (details.location) lines.push(`Location: ${details.location}`);

  if (details.agendaItems.length > 0) {
    lines.push("", "AGENDA", ...details.agendaItems.map((item, index) => `${index + 1}. ${item}`));
  } else if (isActiveMeeting) {
    lines.push("", "No agenda items have been added yet.");
  }

  if (isActiveMeeting && details.meetingUrl) lines.push("", `Join: ${details.meetingUrl}`);
  if (isActiveMeeting) lines.push("", `View details: ${process.env.APP_URL ?? ""}/meetings/${details.meetingId}`);

  return lines.join("\n");
}
