"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DashboardTabsProps {
  myDashboard: React.ReactNode;
  teamOverview: React.ReactNode;
}

/**
 * Switches `/dashboard` between the My Dashboard and Team Overview panels.
 * Holds no data of its own — both panels are Server Components rendered by
 * the page and passed in as children, so this only needs client
 * interactivity for which tab is active. See 06-dashboard-home.md.
 */
export function DashboardTabs({ myDashboard, teamOverview }: DashboardTabsProps) {
  return (
    <Tabs defaultValue="mine" className="mt-6">
      <TabsList className="h-10 gap-1 rounded-xl bg-subtle p-1">
        <TabsTrigger
          value="mine"
          className="rounded-lg px-4 text-sm font-semibold text-copy-secondary data-active:bg-elevated data-active:text-brand"
        >
          My Dashboard
        </TabsTrigger>
        <TabsTrigger
          value="team"
          className="rounded-lg px-4 text-sm font-semibold text-copy-secondary data-active:bg-elevated data-active:text-brand"
        >
          Team Overview
        </TabsTrigger>
      </TabsList>
      <TabsContent value="mine" className="mt-6">
        {myDashboard}
      </TabsContent>
      <TabsContent value="team" className="mt-6">
        {teamOverview}
      </TabsContent>
    </Tabs>
  );
}
