import { logger } from "@trigger.dev/sdk";

import { listOrgRoles } from "@/lib/organization-roles";
import { prisma } from "@/lib/prisma";

export interface AdminRecipient {
  id: string;
  email: string;
  displayName: string;
}

/** The Leader and Assistant Leader — Clerk `org:admin`, read live, never cached. */
export async function getAdminRecipients(): Promise<AdminRecipient[]> {
  const orgRoles = await listOrgRoles();
  const adminClerkIds = [...orgRoles.entries()]
    .filter(([, role]) => role === "org:admin")
    .map(([clerkUserId]) => clerkUserId);
  if (adminClerkIds.length === 0) return [];

  return prisma.member.findMany({
    where: { clerkUserId: { in: adminClerkIds } },
    select: { id: true, email: true, displayName: true },
  });
}

/**
 * The shared notification channel for every recurring/scheduled task in
 * 21-scheduled-reminders.md *except* meeting email, which already has a
 * real Resend-backed path (`lib/meeting-notifications.ts`, from
 * 16-meeting-scheduling.md). Calendar reminders, penalty escalation, and
 * financial summaries keep this one consistent typed shape — per that
 * spec's explicit "Their delivery channels remain deferred until
 * explicitly requested" — so wiring in a real channel later (Resend, an
 * in-app notification center, ...) is a contained change to just this
 * function, not to every task that calls it.
 */
export async function notifyAdmins(subject: string, details: Record<string, unknown>): Promise<void> {
  const admins = await getAdminRecipients();
  await logDeferredNotification(
    subject,
    admins.map((admin) => admin.email),
    details,
  );
}

/**
 * Same deferred-delivery contract as `notifyAdmins`, for a task whose
 * audience isn't "the Admins" — `calendar-reminder.ts` notifies an event's
 * creator, not every Admin. Both funnel through this one logging shape so
 * a future real channel only has to change here.
 */
export async function logDeferredNotification(
  subject: string,
  recipientEmails: string[],
  details: Record<string, unknown>,
): Promise<void> {
  logger.info(`[deferred notification] ${subject}`, { recipientEmails, ...details });
}
