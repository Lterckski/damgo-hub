import type { InvitePolicy, MeetingCadence } from "@/app/generated/prisma/client";
import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * The single OrgSettings row, read through defaults so nothing has to seed
 * it first. Every consumer goes through `getOrgSettings()` rather than
 * querying the table, so "no row yet" is handled in exactly one place.
 */

export interface PenaltyRule {
  label: string;
  amountCents: number;
}

export interface OrgSettingsValues {
  penaltyRules: PenaltyRule[];
  penaltyDueDays: number;
  financeCategories: string[];
  meetingCadence: MeetingCadence;
  invitePolicy: InvitePolicy;
  projectStaleDays: number;
}

export const ORG_SETTINGS_ID = "singleton";

export const DEFAULT_ORG_SETTINGS: OrgSettingsValues = {
  penaltyRules: [],
  penaltyDueDays: 14,
  financeCategories: ["Dues", "Sponsorship", "Supplies", "Travel", "Registration", "Penalty", "Other"],
  meetingCadence: "WEEKLY",
  invitePolicy: "ADMIN_ONLY",
  projectStaleDays: 14,
};

/**
 * Narrows the untyped Json column into PenaltyRule[], dropping malformed
 * entries.
 *
 * Also drops two things that would break the Issue Penalty dropdown, where
 * a rule's label is the option's value:
 *
 * - a rule labelled "Other" (any casing), which is reserved for the
 *   free-text escape hatch — keeping it would render two options with the
 *   same value, one of which silently enables the custom fields
 * - a later rule whose label duplicates an earlier one, case-insensitively,
 *   which would render two indistinguishable options
 *
 * Applied on read as well as on save, so a configuration written before
 * this rule existed cannot break the dialog either.
 */
export function parsePenaltyRules(value: unknown): PenaltyRule[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { label, amountCents } = entry as Record<string, unknown>;
    if (typeof label !== "string" || label.trim() === "") return [];
    if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents < 0) return [];
    const trimmed = label.trim();
    const key = trimmed.toLowerCase();
    if (key === RESERVED_PENALTY_RULE_LABEL) return [];
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ label: trimmed, amountCents }];
  });
}

/**
 * Lowercase form of the reserved dropdown option. Lives here rather than
 * importing lib/penalties.ts, which pulls in Prisma types this module's
 * client-side consumers do not need.
 */
const RESERVED_PENALTY_RULE_LABEL = "other";

export const getOrgSettings = cache(async (): Promise<OrgSettingsValues> => {
  const row = await prisma.orgSettings.findUnique({ where: { id: ORG_SETTINGS_ID } });
  if (!row) return DEFAULT_ORG_SETTINGS;

  return {
    penaltyRules: parsePenaltyRules(row.penaltyRules),
    penaltyDueDays: row.penaltyDueDays,
    financeCategories: row.financeCategories,
    meetingCadence: row.meetingCadence,
    invitePolicy: row.invitePolicy,
    projectStaleDays: row.projectStaleDays,
  };
});
