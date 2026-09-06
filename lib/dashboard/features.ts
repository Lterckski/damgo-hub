import { prisma } from "@/lib/prisma";

/**
 * What the dashboard is allowed to render.
 *
 * The rule from this rebuild: never show a card advertising a hole. The
 * old dashboard shipped a "Recent Ideas" widget that reads the ideas
 * board's autosaved Blob snapshot — but `BLOB_READ_WRITE_TOKEN` has never
 * been configured, so it could only ever render its empty state. A card
 * that is structurally incapable of showing data is worse than no card:
 * it reads as "nobody has posted ideas" when the truth is "this doesn't
 * work yet".
 *
 * Two kinds of flag here, and they mean different things:
 *
 *  - **Capability flags** (`ideasSnapshot`) — an integration isn't
 *    configured. Nothing an admin does in the app fixes it; it needs an
 *    environment variable.
 *  - **Content flags** (`hackathons`, `announcements`) — the feature works,
 *    but nothing has been created yet. These hide the card until there's
 *    something in it, rather than showing a permanently empty shell.
 */

export interface DashboardFeatures {
  /** Vercel Blob is configured, so the ideas board snapshot is readable. */
  ideasSnapshot: boolean;
  /** At least one hackathon has been recorded. */
  hackathons: boolean;
  /** At least one pinned announcement exists (before per-member dismissal). */
  announcements: boolean;
  /** A dues period covers today, so per-member dues status is meaningful. */
  dues: boolean;
}

/**
 * Reading the token rather than attempting a Blob call: this runs on every
 * dashboard render, and a network round-trip to discover a missing
 * environment variable is the wrong trade. `lib/dashboard.ts`'s
 * `getRecentIdeas` still fails safe on its own if the token is present but
 * the read fails.
 */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function getDashboardFeatures(): Promise<DashboardFeatures> {
  const now = new Date();

  const [hackathonCount, announcementCount, duesPeriodCount] = await Promise.all([
    prisma.hackathon.count(),
    prisma.announcement.count({
      where: { pinned: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
    prisma.duesPeriod.count({ where: { periodStart: { lte: now }, periodEnd: { gte: now } } }),
  ]);

  return {
    ideasSnapshot: isBlobConfigured(),
    hackathons: hackathonCount > 0,
    announcements: announcementCount > 0,
    dues: duesPeriodCount > 0,
  };
}
