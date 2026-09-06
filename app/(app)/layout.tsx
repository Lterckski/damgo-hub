import { Rum } from "@/components/monitoring/rum";
import { AppShell } from "@/components/chrome/app-shell";
import { AppHeader } from "@/components/chrome/app-header";
import { getHubViewer, requireWorkspacePage } from "@/lib/hub/context";
import { getCurrentMember } from "@/lib/current-member";
import { isDevViewingAsMember } from "@/lib/current-member";

// The real protection boundary for every route under (app) — per
// proxy.ts, this is where "protect everything except sign-in/sign-up"
// actually happens now, not middleware path matching.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await requireWorkspacePage();
  const [viewer, member, isViewingAsMember] = await Promise.all([
    getHubViewer(),
    getCurrentMember(),
    isDevViewingAsMember(),
  ]);

  // isAdmin (effective, respects the dev "View as Member" toggle) drives
  // everything else in the shell — e.g. the dock's Admin icon — so the
  // whole app looks and behaves like a regular member's while simulating.
  // isRealAdmin (unsimulated) is only for the toggle itself, so a real
  // admin can always find their way back.
  const isRealAdmin = workspace.role === "org:admin";
  const isAdmin = isRealAdmin && !isViewingAsMember;

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
      <Rum />
      {children}
    </AppShell>
  );
}
