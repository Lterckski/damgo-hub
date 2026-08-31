/**
 * Thin wrapper around the Google Calendar REST API — deliberately not the
 * `googleapis` SDK, since `events.insert`/`update`/`delete` on the
 * `primary` calendar is simple enough to do with plain `fetch` and doesn't
 * justify the extra dependency weight. Every call uses the member's own
 * OAuth token (see lib/google-oauth-token.ts), so events land on their own
 * "primary" calendar, not a shared one — see 10-calendar.md.
 */

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface GoogleCalendarEventPayload {
  summary: string;
  description?: string;
  start: { date: string } | { dateTime: string };
  end: { date: string } | { dateTime: string };
}

/** Creates or updates (if `existingEventId` is given) an event in the member's primary Google Calendar. Returns the Google event id. */
export async function upsertGoogleCalendarEvent(
  accessToken: string,
  existingEventId: string | null,
  payload: GoogleCalendarEventPayload,
): Promise<string> {
  const url = existingEventId ? `${EVENTS_URL}/${existingEventId}` : EVENTS_URL;
  const method = existingEventId ? "PATCH" : "POST";

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // A 404 on PATCH means the event was deleted on the Google side (by
    // the member, outside our control) — fall back to creating a new one.
    if (existingEventId && response.status === 404) {
      return upsertGoogleCalendarEvent(accessToken, null, payload);
    }
    const body = await response.text();
    throw new Error(`Google Calendar API ${method} ${url} failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/** Deletes an event from the member's primary Google Calendar. A 404/410 (already gone) is treated as success. */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  googleEventId: string,
): Promise<void> {
  const response = await fetch(`${EVENTS_URL}/${googleEventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const body = await response.text();
    throw new Error(`Google Calendar API DELETE failed: ${response.status} ${body}`);
  }
}
