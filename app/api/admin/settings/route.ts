import { NextResponse } from "next/server";

import type { Prisma } from "@/app/generated/prisma/client";

import { requireAdmin, toErrorResponse } from "@/lib/admin/guard";
import { recordAuditEvent } from "@/lib/audit-log";
import { ORG_SETTINGS_ID, getOrgSettings, parsePenaltyRules } from "@/lib/org-settings";
import { prisma } from "@/lib/prisma";

const CADENCES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "AD_HOC"] as const;
const INVITE_POLICIES = ["ADMIN_ONLY", "ANY_MEMBER"] as const;

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : null;
}

function positiveInt(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) return null;
  return value;
}

// PATCH /api/admin/settings — the org settings block. Partial: only the
// keys present in the body are written, so each sub-form can save on its
// own without round-tripping the whole settings object.
export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  if ("penaltyRules" in input) {
    if (!Array.isArray(input.penaltyRules)) errors.push("penaltyRules must be a list");
    else data.penaltyRules = parsePenaltyRules(input.penaltyRules);
  }
  if ("penaltyDueDays" in input) {
    const days = positiveInt(input.penaltyDueDays, 365);
    if (days === null) errors.push("penaltyDueDays must be 1–365");
    else data.penaltyDueDays = days;
  }
  if ("projectStaleDays" in input) {
    const days = positiveInt(input.projectStaleDays, 365);
    if (days === null) errors.push("projectStaleDays must be 1–365");
    else data.projectStaleDays = days;
  }
  if ("financeCategories" in input) {
    const categories = Array.isArray(input.financeCategories)
      ? input.financeCategories
          .filter((c): c is string => typeof c === "string")
          .map((c) => c.trim())
          .filter((c) => c !== "")
      : null;
    if (!categories || categories.length === 0) errors.push("At least one finance category is required");
    else data.financeCategories = [...new Set(categories)];
  }
  if ("meetingCadence" in input) {
    const cadence = oneOf(CADENCES, input.meetingCadence);
    if (!cadence) errors.push("Unknown meeting cadence");
    else data.meetingCadence = cadence;
  }
  if ("invitePolicy" in input) {
    const policy = oneOf(INVITE_POLICIES, input.invitePolicy);
    if (!policy) errors.push("Unknown invite policy");
    else data.invitePolicy = policy;
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const before = await getOrgSettings();

    await prisma.$transaction(async (tx) => {
      await tx.orgSettings.upsert({
        where: { id: ORG_SETTINGS_ID },
        // The row may not exist yet — getOrgSettings() serves defaults
        // rather than requiring a seed, so the first save is the create.
        create: { id: ORG_SETTINGS_ID, ...data, updatedById: guard.context.actor.id },
        update: { ...data, updatedById: guard.context.actor.id },
      });

      await recordAuditEvent(
        {
          actor: guard.context.actor,
          action: "org_settings.updated",
          entityType: "ORG_SETTINGS",
          entityId: ORG_SETTINGS_ID,
          entityLabel: "Organization settings",
          before: Object.fromEntries(
            Object.keys(data).map((key) => [key, before[key as keyof typeof before] ?? null]),
          ) as Prisma.InputJsonObject,
          after: data as Prisma.InputJsonObject,
          reason: null,
        },
        tx,
      );
    });

    return NextResponse.json({ ok: true, settings: await getOrgSettings(), message: "Settings saved" });
  } catch (error) {
    return toErrorResponse(error);
  }
}
