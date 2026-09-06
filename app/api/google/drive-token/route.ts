import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getMemberGoogleAccessToken } from "@/lib/google-oauth-token";

// GET /api/google/drive-token — any authenticated member; returns their
// Google OAuth access token so the Google Picker (which runs entirely
// client-side, per Google's own design — there's no server-side Picker API)
// can browse their Drive. Handing an OAuth token to the browser is exactly
// how Google's own Picker integration guide does this — the token is
// short-lived and scoped only to `drive.file` (see 09-documentation.md's
// Google Drive Integration section), so it can only touch files the member
// explicitly opens through the Picker, not their whole Drive.
export async function GET() {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getMemberGoogleAccessToken(userId);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Google not connected" },
      { status: 404 },
    );
  }

  return NextResponse.json({ accessToken });
}
