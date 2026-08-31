import { clerkClient } from "@clerk/nextjs/server";

/**
 * Resolves a member's Google OAuth access token via Clerk — Clerk stores
 * and refreshes it once the member has signed in with Google (or linked
 * it) with the `https://www.googleapis.com/auth/calendar.events` scope
 * configured on the Google connection in the Clerk Dashboard. Returns
 * `null` if the member hasn't connected Google — that's not an error,
 * just nothing to sync to yet. See 10-calendar.md's Google Calendar Sync
 * section for the one-time setup this depends on.
 */
export async function getMemberGoogleAccessToken(clerkUserId: string): Promise<string | null> {
  const client = await clerkClient();

  try {
    const { data } = await client.users.getUserOauthAccessToken(clerkUserId, "google");
    return data[0]?.token ?? null;
  } catch {
    // No Google connection for this user (or the scope isn't granted yet).
    return null;
  }
}
