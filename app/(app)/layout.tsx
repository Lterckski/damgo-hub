import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/chrome/app-shell";
import { AppHeader } from "@/components/chrome/app-header";
import { getHubViewer, requireWorkspacePage } from "@/lib/hub/context";
import { getCurrentMember } from "@/lib/current-member";
import {
  isCurrentMemberAdmin,
  isDevViewingAsMember,
  isRealMemberAdmin,
} from "@/lib/current-member";

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
  await requireWorkspacePage();
  const viewer = await getHubViewer();
  const member = await getCurrentMember();

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
      header={
        <AppHeader
          key={`${viewer.orgId}:${viewer.memberId}:${viewer.role}`}
          isAdmin={isAdmin}
          isRealAdmin={isRealAdmin}
          isViewingAsMember={isViewingAsMember}
          memberName={member.displayName}
        />
      }
    >
      {children}
    </AppShell>
  );
}
