import { Liveblocks } from "@liveblocks/node";

/**
 * Cached Liveblocks Node client — same globalThis-singleton pattern as
 * lib/prisma.ts, for the same reason: Next.js dev's module hot-reload
 * would otherwise construct a fresh client (and, more importantly here,
 * exhaust nothing since Liveblocks has no connection pool to leak, but a
 * fresh client per reload is still wasteful) on every edit. Skipped in
 * production the same way lib/prisma.ts skips it — no hot-reload there.
 */
const globalForLiveblocks = globalThis as unknown as {
  liveblocksClient: Liveblocks | undefined;
};

function createLiveblocksClient(): Liveblocks {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    throw new Error("LIVEBLOCKS_SECRET_KEY is not set");
  }
  return new Liveblocks({ secret });
}

export const liveblocksClient = globalForLiveblocks.liveblocksClient ?? createLiveblocksClient();

if (process.env.NODE_ENV !== "production") {
  globalForLiveblocks.liveblocksClient = liveblocksClient;
}

// The same 7 accent hues ui-context.md's Node Color Palette uses for node
// text/accents (types/canvas.ts, added in 13-roadmap-board.md, draws from
// this identical list) — minus the neutral default (#F3F6FB reads as
// near-white, a poor cursor color against a light canvas) — so a member's
// live cursor and their own node accents read as one system, per this
// unit's explicit spec.
const CURSOR_COLORS = [
  "#45D9C5", // teal
  "#7FB0E0", // blue
  "#B79CE0", // purple
  "#E8B84B", // amber
  "#F0655C", // red
  "#D888AC", // rose
  "#52C77D", // green
] as const;

/**
 * Deterministically maps a member ID to one color from CURSOR_COLORS, so
 * the same member always gets the same cursor color across sessions and
 * rooms — not random-per-connection, which would make "whose cursor is
 * that" impossible to learn over time.
 */
export function cursorColorForMember(memberId: string): string {
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash * 31 + memberId.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}
