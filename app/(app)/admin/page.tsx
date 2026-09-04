import { AlertTriangle, FolderKanban, ReceiptText, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { BackButton } from "@/components/shared/back-button";
import { DashboardWidget } from "@/components/dashboard/dashboard-widget";

// Admin overview — see 20-admin-dashboard.md. A thin aggregation layer:
// four real counts, each card linking to the detail tab that actually
// manages that data. No new domain model, no admin-only duplicate of
// anything already built.
export default async function AdminOverviewPage() {
  const [totalMembers, openPenalties, pendingTransactions, activeProjects] = await Promise.all([
    prisma.member.count(),
    prisma.penalty.count({ where: { status: "OPEN" } }),
    prisma.transaction.count({ where: { status: "PENDING" } }),
    prisma.project.count({ where: { status: "ACTIVE" } }),
  ]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Admin</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">Oversight across members, finance, penalties, and projects.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardWidget title="Total Members" icon={Users} viewAllHref="/admin/members">
          <p className="text-3xl font-bold text-copy-primary">{totalMembers}</p>
        </DashboardWidget>
        <DashboardWidget title="Open Penalties" icon={AlertTriangle} viewAllHref="/admin/penalties">
          <p className="text-3xl font-bold text-copy-primary">{openPenalties}</p>
        </DashboardWidget>
        <DashboardWidget title="Pending Transactions" icon={ReceiptText} viewAllHref="/admin/finance">
          <p className="text-3xl font-bold text-copy-primary">{pendingTransactions}</p>
        </DashboardWidget>
        <DashboardWidget title="Active Projects" icon={FolderKanban} viewAllHref="/admin/projects">
          <p className="text-3xl font-bold text-copy-primary">{activeProjects}</p>
        </DashboardWidget>
      </div>
    </div>
  );
}
