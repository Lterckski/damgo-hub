import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/chrome/app-shell";
import { DevUserButton } from "@/components/chrome/dev-user-button";
import { isCurrentMemberAdmin, isDevViewingAsMember, isRealMemberAdmin } from "@/lib/current-member";

// The real protection boundary for every route under (app) — per
// proxy.ts, this is where "protect everything except sign-in/sign-up"
// actually happens now, not middleware path matching.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // isAdmin (effective, respects the dev "View as Member" toggle) drives
  // everything else in the shell — e.g. the dock's Admin icon — so the
  // whole app looks and behaves like a regular member's while simulating.
  // isRealAdmin (unsimulated) is only for the toggle itself, so a real
  // admin can always find their way back.
  const [isAdmin, isRealAdmin, isViewingAsMember] = await Promise.all([
    isCurrentMemberAdmin(),
    isRealMemberAdmin(),
    isDevViewingAsMember(),
  ]);

  return (
    <AppShell
      isAdmin={isAdmin}
      navbarRightSlot={<DevUserButton isRealAdmin={isRealAdmin} isViewingAsMember={isViewingAsMember} />}
    >
      {children}
    </AppShell>
  );
}
