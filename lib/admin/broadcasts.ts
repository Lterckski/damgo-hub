import type { BroadcastAudience, Prisma } from "@/app/generated/prisma/client";

import { listOrgRoles } from "@/lib/organization-roles";
import { prisma } from "@/lib/prisma";
import type { AuditActor } from "@/lib/audit-log";

/**
 * Part 2's broadcast composer, and the notification substrate the Action
 * Queue's "Request receipt" also uses.
 *
 * Resolving an audience to concrete recipients happens here rather than in
 * the route so the queue's one-person nudge and the composer's org-wide
 * send produce identical records — one Broadcast row plus one
 * BroadcastRecipient per person, which is what makes an in-app inbox
 * possible later without re-modelling anything.
 */

export interface BroadcastInput {
  subject: string;
  body: string;
  audience: BroadcastAudience;
  audienceRole?: string | null;
  projectId?: string | null;
  audienceMemberId?: string | null;
}

export interface BroadcastResult {
  id: string;
  recipientCount: number;
}

/** Member ids the audience resolves to. Excludes REMOVED members always. */
async function resolveRecipients(input: BroadcastInput): Promise<string[]> {
  switch (input.audience) {
    case "MEMBER": {
      if (!input.audienceMemberId) return [];
      const member = await prisma.member.findUnique({
        where: { id: input.audienceMemberId },
        select: { id: true },
      });
      return member ? [member.id] : [];
    }
    case "PROJECT": {
      if (!input.projectId) return [];
      const links = await prisma.projectMember.findMany({
        where: { projectId: input.projectId, member: { status: { not: "REMOVED" } } },
        select: { memberId: true },
      });
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: { ownerId: true },
      });
      // The owner is always a recipient even when they hold no
      // ProjectMember row of their own — they're the Team Lead.
      return [...new Set([...links.map((link) => link.memberId), ...(project ? [project.ownerId] : [])])];
    }
    case "ROLE": {
      if (!input.audienceRole) return [];
      const orgRoles = await listOrgRoles();
      const clerkUserIds = [...orgRoles.entries()]
        .filter(([, role]) => role === input.audienceRole)
        .map(([clerkUserId]) => clerkUserId);
      const members = await prisma.member.findMany({
        where: { clerkUserId: { in: clerkUserIds }, status: { not: "REMOVED" } },
        select: { id: true },
      });
      return members.map((member) => member.id);
    }
    case "ALL_MEMBERS":
    default: {
      // Scoped to the Clerk org, not every local row — the same scoping
      // fix the member count needed. A broadcast to "all members" must not
      // include someone who was removed from the org.
      const orgRoles = await listOrgRoles();
      const members = await prisma.member.findMany({
        where: { clerkUserId: { in: [...orgRoles.keys()] }, status: { not: "REMOVED" } },
        select: { id: true },
      });
      return members.map((member) => member.id);
    }
  }
}

export async function sendBroadcast(
  actor: AuditActor,
  input: BroadcastInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<BroadcastResult> {
  const recipientIds = await resolveRecipients(input);

  const broadcast = await tx.broadcast.create({
    data: {
      subject: input.subject,
      body: input.body,
      audience: input.audience,
      audienceRole: input.audienceRole ?? null,
      projectId: input.projectId ?? null,
      audienceMemberId: input.audienceMemberId ?? null,
      sentById: actor.id,
      sentByName: actor.displayName,
      recipients: {
        createMany: {
          data: recipientIds.map((memberId) => ({ memberId })),
          skipDuplicates: true,
        },
      },
    },
    select: { id: true },
  });

  return { id: broadcast.id, recipientCount: recipientIds.length };
}
