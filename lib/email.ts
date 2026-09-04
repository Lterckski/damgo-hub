import { Resend } from "resend";

// Cached Resend client — same globalThis-singleton pattern as
// lib/prisma.ts/lib/liveblocks.ts, for the same reason (avoid a fresh
// client on every Next.js dev hot-reload). Same convention as
// lib/liveblocks.ts for keeping a secret-holding client server-only: no
// "server-only" package import (not a dependency this codebase uses),
// just the discipline of only ever calling this from server code — every
// caller is a Trigger.dev task, never a client component.
//
// Unlike lib/liveblocks.ts, construction is lazy (inside getResendClient(),
// not a top-level `const`) — RESEND_API_KEY genuinely isn't set until the
// external Resend setup this spec calls for is done, and `next build`
// imports every route module (including this one, transitively, through
// every meeting route) to collect its metadata. A top-level throw here —
// confirmed as a real build failure, not a theoretical one — would break
// `npm run build` entirely until that setup happens, for a feature that's
// supposed to degrade gracefully instead (see sendEmail's `{ ok: false }`
// path below).
const globalForResend = globalThis as unknown as { resendClient: Resend | undefined };

function getResendClient(): Resend {
  if (globalForResend.resendClient) return globalForResend.resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  const client = new Resend(apiKey);
  if (process.env.NODE_ENV !== "production") {
    globalForResend.resendClient = client;
  }
  return client;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Resend's own idempotency key — a secondary, short-window (24h)
   * safeguard per 16-meeting-scheduling.md. The durable dedup mechanism
   * is the caller claiming a MeetingEmailDelivery row first; this just
   * catches a raw retry of the same Resend API call within that window.
   */
  idempotencyKey: string;
}

export type SendEmailResult = { ok: true; providerMessageId: string } | { ok: false; error: string };

/**
 * The one place this app calls Resend. Always called from a Trigger.dev
 * task (src/trigger/meeting-notification.ts, meeting-reminder.ts) — never
 * inline from an API route or client component, per this app's
 * architecture-context.md invariant 1 and this spec's explicit
 * "meeting request handlers enqueue... and never call Resend inline."
 *
 * Never throws — a provider failure (including RESEND_API_KEY/
 * MEETING_EMAIL_FROM not being set yet) comes back as `{ ok: false, error }`
 * so the caller can record it on the MeetingEmailDelivery row and let
 * Trigger.dev's own retries handle the rest, per this spec's explicit
 * "do not roll back an already-valid meeting mutation."
 */
export async function sendEmail({ to, subject, html, text, idempotencyKey }: SendEmailParams): Promise<SendEmailResult> {
  const from = process.env.MEETING_EMAIL_FROM;
  if (!from) {
    return { ok: false, error: "MEETING_EMAIL_FROM is not set" };
  }
  if (!process.env.APP_URL) {
    return { ok: false, error: "APP_URL is not set" };
  }

  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({ from, to, subject, html, text }, { idempotencyKey });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, providerMessageId: data.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
