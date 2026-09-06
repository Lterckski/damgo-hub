import { prisma } from "@/lib/prisma";
import { audienceGrants, recordWhere, canSee, type Viewer } from "./visibility";

export function notificationWhere(viewer: Viewer) {
  return {
    orgId: viewer.orgId,
    OR: audienceGrants(viewer),
    record: recordWhere(viewer),
    states: {
      some: { memberId: viewer.memberId, suppressed: false, dismissedAt: null },
    },
  };
}

/** Preserves each legacy broadcast recipient's read timestamp. Historical
 * backfill cannot send email or make a new role/project member a recipient. */
export async function importBroadcasts(viewer: Viewer) {
  const broadcasts = await prisma.broadcastRecipient.findMany({
    where: { memberId: viewer.memberId },
    include: { broadcast: true },
  });
  if (broadcasts.length === 0) return;

  const recordIds = broadcasts.map(
    (receipt) => `broadcast:${receipt.broadcastId}`,
  );
  const eventKeys = broadcasts.map((receipt) => `legacy:${receipt.id}`);
  const [visibleRecords, imported, native] = await Promise.all([
    prisma.hubRecord.findMany({
      where: { id: { in: recordIds }, ...recordWhere(viewer) },
      select: { id: true },
    }),
    prisma.hubNotification.findMany({
      where: { eventKey: { in: eventKeys } },
      select: { eventKey: true },
    }),
    prisma.hubNotification.findMany({
      where: {
        recordId: { in: recordIds },
        recipientId: viewer.memberId,
        eventKey: { not: { startsWith: "legacy:" } },
      },
      select: { recordId: true },
    }),
  ]);
  const visibleIds = new Set(visibleRecords.map((record) => record.id));
  const importedKeys = new Set(imported.map((row) => row.eventKey));
  const nativeRecordIds = new Set(native.map((row) => row.recordId));
  const missing = broadcasts.filter((receipt) => {
    const recordId = `broadcast:${receipt.broadcastId}`;
    return (
      visibleIds.has(recordId) &&
      !importedKeys.has(`legacy:${receipt.id}`) &&
      !nativeRecordIds.has(recordId)
    );
  });
  if (missing.length === 0) return;

  await prisma.$transaction(
    missing.map((receipt) => {
      const recordId = `broadcast:${receipt.broadcastId}`;
      const eventKey = `legacy:${receipt.id}`;
      return prisma.hubNotification.upsert({
        where: { eventKey },
        update: {},
        create: {
          orgId: viewer.orgId,
          recordId,
          visibilityScope: "user",
          recipientId: viewer.memberId,
          actorId: receipt.broadcast.sentById,
          action: "broadcast.posted",
          title: receipt.broadcast.subject,
          body: receipt.broadcast.body,
          url: `/records/${recordId}`,
          eventKey,
          createdAt: receipt.broadcast.createdAt,
          states: {
            create: { memberId: viewer.memberId, readAt: receipt.readAt },
          },
        },
      });
    }),
  );
}

export async function notifications(viewer: Viewer, filter: string) {
  await importBroadcasts(viewer);
  const where = notificationWhere(viewer);
  const [rows, unread] = await Promise.all([
    prisma.hubNotification.findMany({
      where: {
        AND: [
          where,
          ...(filter === "mentions"
            ? [{ action: { startsWith: "mention." } }]
            : []),
          ...(filter === "unread"
            ? [
                {
                  states: { some: { memberId: viewer.memberId, readAt: null } },
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      include: {
        states: { where: { memberId: viewer.memberId } },
        record: { include: { grants: true } },
      },
    }),
    prisma.hubNotification.count({
      where: {
        AND: [
          where,
          { states: { some: { memberId: viewer.memberId, readAt: null } } },
        ],
      },
    }),
  ]);
  const actors = await prisma.member.findMany({
    where: { id: { in: rows.flatMap((n) => (n.actorId ? [n.actorId] : [])) } },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  return {
    unread,
    items: rows
      .filter(
        (n) =>
          canSee(viewer, n.orgId, [n]) &&
          canSee(viewer, n.record.orgId, n.record.grants),
      )
      .map((n) => ({
        id: n.id,
        recordId: n.recordId,
        title: n.title,
        body: n.body.slice(0, 180),
        action: n.action,
        url: n.url,
        createdAt: n.createdAt.toISOString(),
        read: !!n.states[0]?.readAt,
        actor: actors.find((a) => a.id === n.actorId) ?? null,
        inline:
          n.record.entityType === "task" && n.record.status !== "DONE"
            ? "accept"
            : n.record.entityType === "penalty" &&
                n.record.ownerId === viewer.memberId &&
                n.record.status === "OPEN"
              ? "claim_paid"
              : n.action === "transaction.pending" &&
                  viewer.role === "org:admin" &&
                  n.record.status === "PENDING"
                ? "approve"
                : n.record.entityType === "meeting"
                  ? "join"
                  : null,
      })),
  };
}

export async function changeNotification(
  viewer: Viewer,
  id: string | null,
  action: "read" | "dismiss",
) {
  const visible = await prisma.hubNotification.findMany({
    where: { ...notificationWhere(viewer), ...(id ? { id } : {}) },
    select: { id: true },
  });
  if (id && !visible.length) throw new Error("Notification unavailable");
  await prisma.hubNotificationState.updateMany({
    where: {
      memberId: viewer.memberId,
      notificationId: { in: visible.map((n) => n.id) },
    },
    data:
      action === "read" ? { readAt: new Date() } : { dismissedAt: new Date() },
  });
}
