import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { getMemberPickerOptions } from "@/lib/members";
import { PENALTY_INCLUDE, serializePenalty } from "@/lib/penalties";
import { prisma } from "@/lib/prisma";
import { BackButton } from "@/components/shared/back-button";
import { PenaltiesView } from "@/components/penalties/penalties-view";

export default async function PenaltiesPage() {
  const [member, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);

  const [penaltyRecords, memberOptions] = await Promise.all([
    prisma.penalty.findMany({
      where: isAdmin ? undefined : { memberId: member.id },
      include: PENALTY_INCLUDE,
      orderBy: { createdAt: "desc" },
    }),
    isAdmin ? getMemberPickerOptions() : Promise.resolve([]),
  ]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Penalties</h1>
      </div>
      <p className="mt-1 text-sm text-copy-secondary">
        {isAdmin
          ? "Issue and track penalties across the team."
          : "Penalties issued to you, and their current status."}
      </p>

      <div className="mt-6">
        <PenaltiesView
          penalties={penaltyRecords.map(serializePenalty)}
          isAdmin={isAdmin}
          members={memberOptions}
        />
      </div>
    </div>
  );
}
