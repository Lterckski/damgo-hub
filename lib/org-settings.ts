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

/** Narrows the untyped Json column into PenaltyRule[], dropping malformed entries. */
export function parsePenaltyRules(value: unknown): PenaltyRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { label, amountCents } = entry as Record<string, unknown>;
    if (typeof label !== "string" || label.trim() === "") return [];
    if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents < 0) return [];
    return [{ label: label.trim(), amountCents }];
  });
}

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
