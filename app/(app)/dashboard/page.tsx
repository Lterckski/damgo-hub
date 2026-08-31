import { getCurrentMember } from "@/lib/current-member";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { MyDashboardPanel } from "@/components/dashboard/my-dashboard-panel";
import { TeamOverviewPanel } from "@/components/dashboard/team-overview-panel";

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

      <DashboardTabs
        myDashboard={<MyDashboardPanel memberName={member.displayName} />}
        teamOverview={<TeamOverviewPanel />}
      />
    </div>
  );
}
