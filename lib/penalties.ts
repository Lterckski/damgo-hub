/** Shared serialization for Penalty API responses — see 18-penalty-tracker.md. */

export interface SerializedPenalty {
  id: string;
  memberId: string;
  memberName: string;
  issuedById: string;
  issuedByName: string;
  reason: string;
  amountCentavos: number | null;
  status: string;
  resolvedAt: string | null;
  transactionId: string | null;
  createdAt: string;
}

export const PENALTY_INCLUDE = {
  member: { select: { displayName: true } },
  issuedBy: { select: { displayName: true } },
  transaction: { select: { id: true } },
} as const;

export function serializePenalty(penalty: {
  id: string;
  memberId: string;
  member: { displayName: string };
  issuedById: string;
  issuedBy: { displayName: string };
  reason: string;
  amountCents: number | null;
  status: string;
  resolvedAt: Date | null;
  transaction: { id: string } | null;
  createdAt: Date;
}): SerializedPenalty {
  return {
    id: penalty.id,
    memberId: penalty.memberId,
    memberName: penalty.member.displayName,
    issuedById: penalty.issuedById,
    issuedByName: penalty.issuedBy.displayName,
    reason: penalty.reason,
    amountCentavos: penalty.amountCents,
    status: penalty.status,
    resolvedAt: penalty.resolvedAt ? penalty.resolvedAt.toISOString() : null,
    transactionId: penalty.transaction?.id ?? null,
    createdAt: penalty.createdAt.toISOString(),
  };
}
