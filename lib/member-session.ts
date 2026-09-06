import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";

import type { Member } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Resolve the signed-in Clerk identity to its local member profile. */
export const getCurrentMember = cache(async (): Promise<Member> => {
  const { userId } = await auth();
  if (!userId) {
    throw new Error(
      "getCurrentMember() called without an authenticated Clerk session",
    );
  }

  const existing = await prisma.member.findUnique({
    where: { clerkUserId: userId },
  });
  if (existing) return existing;

  const user = await currentUser();
  const primaryEmail = user?.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  )?.emailAddress;
  return prisma.member.upsert({
    where: { clerkUserId: userId },
    update: {},
    create: {
      clerkUserId: userId,
      email: primaryEmail ?? "",
      displayName: user?.fullName ?? user?.username ?? "New Member",
      avatarUrl: user?.imageUrl,
      status: "ACTIVE",
    },
  });
});
