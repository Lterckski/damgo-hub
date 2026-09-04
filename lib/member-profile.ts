export interface ClerkOrganizationMemberProfile {
  clerkUserId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface ClerkOrganizationPublicUserData {
  userId: string;
  identifier: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
}

/** Converts Clerk's organization-membership identity into the local profile fields used by member pickers. */
export function organizationMemberProfile(
  publicUserData: ClerkOrganizationPublicUserData,
): ClerkOrganizationMemberProfile {
  const displayName = [publicUserData.firstName, publicUserData.lastName]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .map((part) => part.trim())
    .join(" ");

  return {
    clerkUserId: publicUserData.userId,
    email: publicUserData.identifier,
    displayName: displayName || publicUserData.identifier || "New Member",
    avatarUrl: publicUserData.imageUrl || null,
  };
}
