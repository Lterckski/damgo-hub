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

/**
 * The escape-hatch option in the Issue Penalty reason dropdown.
 *
 * Every other option comes from `OrgSettings.penaltyRules` and carries its
 * own fixed amount. "Other" is the only one that lets an admin type a
 * free-text reason and name an amount, so it is the only value the server
 * accepts a client-supplied `reason` or `amountPesos` alongside.
 *
 * Compared case-insensitively against rule labels so an admin who happens
 * to define a rule literally called "Other" cannot create two entries that
 * look identical in the dropdown.
 */
export const OTHER_PENALTY_REASON = "Other";

export function isOtherPenaltyReason(label: string): boolean {
  return label.trim().toLowerCase() === OTHER_PENALTY_REASON.toLowerCase();
}

/**
 * Resolve a submitted reason choice against the configured presets.
 *
 * Returns the preset when the label matches one, `"other"` for the
 * free-text option, or `null` when the label is neither — which the route
 * treats as a 400 rather than silently falling back to free text, so a
 * stale dropdown (rules edited in another tab) cannot smuggle an arbitrary
 * reason past the preset list.
 */
export function resolvePenaltyReason(
  label: unknown,
  rules: { label: string; amountCents: number }[],
): { kind: "preset"; rule: { label: string; amountCents: number } } | { kind: "other" } | null {
  if (typeof label !== "string" || label.trim() === "") return null;
  if (isOtherPenaltyReason(label)) return { kind: "other" };
  const rule = rules.find(
    (r) => r.label.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  return rule ? { kind: "preset", rule } : null;
}
