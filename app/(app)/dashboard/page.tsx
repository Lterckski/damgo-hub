import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { getCurrentMember } from "@/lib/current-member";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { MyDashboardPanel } from "@/components/dashboard/my-dashboard-panel";
import { TeamOverviewPanel } from "@/components/dashboard/team-overview-panel";

function PanelFallback() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-copy-secondary" />
    </div>
  );
}

export default async function DashboardPage() {
  const member = await getCurrentMember();

  return (
    <div className="p-6">
      <h1 className="font-display text-3xl text-copy-primary">
        Welcome back, {member.displayName}
      </h1>
      <p className="mt-1 text-sm text-copy-secondary">
        Here&apos;s where things stand — for you, and for the team.
      </p>

      {/* Both panels are async Server Components — without a Suspense
          boundary around each, React can't flush anything until BOTH
          finish their own queries, so the initially-hidden "Team Overview"
          tab was silently blocking the page even though "My Dashboard" is
          the one shown by default. Suspense lets each stream in on its own
          as soon as its own data is ready. */}
      <DashboardTabs
        myDashboard={
          <Suspense fallback={<PanelFallback />}>
            <MyDashboardPanel memberId={member.id} />
          </Suspense>
        }
        teamOverview={
          <Suspense fallback={<PanelFallback />}>
            <TeamOverviewPanel />
          </Suspense>
        }
      />
    </div>
  );
}
