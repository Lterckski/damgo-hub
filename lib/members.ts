import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";

export interface MemberPickerOption {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * id/displayName/avatarUrl for every member, used to populate the
 * assignee/collaborator pickers on tasks, calendar, and projects — four
 * separate page loads were each independently querying this exact shape.
 * Cached indefinitely rather than on a timer, since displayName/avatarUrl
 * are only ever written once, at first sign-in (see getCurrentMember() in
 * lib/current-member.ts) — nothing else in the app updates them. That's
 * also the only place that calls revalidateTag("members"), so this can
 * never actually go stale; caching it just skips the repeat query when
 * nothing has changed. If an "edit profile" feature is ever added, its
 * write path needs the same revalidateTag call.
 */
export const getMemberPickerOptions = unstable_cache(
  async (): Promise<MemberPickerOption[]> => {
    return prisma.member.findMany({
      select: { id: true, displayName: true, avatarUrl: true },
      orderBy: { displayName: "asc" },
    });
  },
  ["member-picker-options"],
  { tags: ["members"] },
);
