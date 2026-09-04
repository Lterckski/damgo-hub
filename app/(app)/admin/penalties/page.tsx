import { PENALTY_INCLUDE, serializePenalty } from "@/lib/penalties";
import { getMemberPickerOptions } from "@/lib/members";
import { prisma } from "@/lib/prisma";
import { BackButton } from "@/components/shared/back-button";
import { PenaltiesView } from "@/components/penalties/penalties-view";

// Deep link into the Admin view already built in 18-penalty-tracker.md —
// see 20-admin-dashboard.md. Same PenaltiesView the /penalties page uses,
// forced into its Admin branch (always true here, this route is
// admin-gated by app/(app)/admin/layout.tsx).
export default async function AdminPenaltiesPage() {
  const [penaltyRecords, memberOptions] = await Promise.all([
    prisma.penalty.findMany({ include: PENALTY_INCLUDE, orderBy: { createdAt: "desc" } }),
    getMemberPickerOptions(),
  ]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Penalties</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">Issue and track penalties across the team.</p>

      <div className="mt-6">
        <PenaltiesView penalties={penaltyRecords.map(serializePenalty)} isAdmin members={memberOptions} />
      </div>
    </div>
  );
}
