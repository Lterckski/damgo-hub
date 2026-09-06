import type { AuditEntityType, Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Append-only admin action log — Zone 5 of the admin console.
 *
 * Deliberately has no update or delete counterpart: the only exported
 * mutation is `recordAuditEvent`. Everything that overrides normal
 * behavior (reassigning any task, closing any penalty, editing any
 * transaction) writes here with a required reason, and the routes that do
 * so reject the request outright when the reason is missing — see
 * `requireReason` below.
 */

export interface AuditActor {
  id: string;
  displayName: string;
  clerkUserId: string;
}

export interface AuditEventInput {
  actor: AuditActor;
  /** Dotted verb: "member.role.updated", "penalty.waived", "transaction.approved". */
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  /** How the entity should read in the feed forever, even after a rename or delete. */
  entityLabel: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  reason?: string | null;
}

/**
 * Writes one audit entry. Pass `tx` to make the entry part of the same
 * transaction as the change it describes — a logged change that rolled
 * back, or a change that committed without its log entry, are both worse
 * than either alone.
 */
export async function recordAuditEvent(
  input: AuditEventInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actor.id,
      actorName: input.actor.displayName,
      actorClerkUserId: input.actor.clerkUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      reason: input.reason?.trim() || null,
    },
  });
}

export class MissingReasonError extends Error {
  constructor() {
    super("This action requires a reason");
    this.name = "MissingReasonError";
  }
}

/**
 * Validates the reason field an override action must carry. Throws rather
 * than returning a default, so a route can't accidentally log an override
 * with an empty justification by forgetting to check the return value.
 */
export function requireReason(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 3) {
    throw new MissingReasonError();
  }
  return value.trim();
}

export interface AuditLogEntry {
  id: string;
  actorName: string;
  actorId: string | null;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function getAuditLog(limit = 100): Promise<AuditLogEntry[]> {
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return entries.map((entry) => ({
    id: entry.id,
    actorName: entry.actorName,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    before: asRecord(entry.before),
    after: asRecord(entry.after),
    reason: entry.reason,
    createdAt: entry.createdAt.toISOString(),
  }));
}
