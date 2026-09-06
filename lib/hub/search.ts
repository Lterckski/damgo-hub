import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getNeedsYouToday } from "@/lib/dashboard/personal";
import {
  audienceGrants,
  canSee,
  recordWhere,
  recordUrl,
  type Viewer,
} from "./visibility";

export interface SearchRow {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  status: string;
  ownerId: string | null;
  dueAt: Date | null;
  updatedAt: Date;
  lastOpenedAt: Date | null;
  titleMatch: boolean;
  score: number;
}
export async function visibleRecord(viewer: Viewer, id: string) {
  const record = await prisma.hubRecord.findFirst({
    where: { id, ...recordWhere(viewer) },
    include: { grants: true },
  });
  if (
    record?.entityType === "member" &&
    !(await prisma.hubMembership.findFirst({
      where: { memberId: record.entityId, orgId: viewer.orgId },
    }))
  )
    return null;
  return record && canSee(viewer, record.orgId, record.grants) ? record : null;
}
/** The SQL audience list comes from the same definition as the handler check. */
export function visibilitySql(viewer: Viewer) {
  const clauses = audienceGrants(viewer).map(
    (g) =>
      Prisma.sql`(g."visibilityScope"=${g.visibilityScope} AND g."recipientId"=${g.recipientId})`,
  );
  return Prisma.sql`r."orgId"=${viewer.orgId} AND EXISTS (SELECT 1 FROM "HubGrant" g WHERE g."recordId"=r.id AND (${Prisma.join(clauses, " OR ")}))`;
}

export async function search(viewer: Viewer, input: string) {
  const query = input.trim().slice(0, 120).toLocaleLowerCase();
  const words = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!words.length) return [];
  const tsquery = words.map((word) => `${word}:*`).join(" & ");
  const titleMatch = Prisma.sql`(to_tsvector('simple',r.title) @@ to_tsquery('simple',${tsquery}) OR strpos(lower(r.title),${query})>0 OR lower(r.title) % ${query} OR EXISTS (SELECT 1 FROM regexp_split_to_table(lower(r.title), '[^[:alnum:]]+') word WHERE hub_one_edit(word,${query})))`;
  const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    WITH matches AS (
      SELECT r.id,r."entityType",r."entityId",r.title,left(r.body,240) body,r.status,r."ownerId",r."dueAt",r."updatedAt",h."lastOpenedAt",
      ${titleMatch} "titleMatch",
      (ts_rank(r."searchVector",to_tsquery('simple',${tsquery}))::float8 +
       CASE WHEN r."ownerId"=${viewer.memberId} OR EXISTS(SELECT 1 FROM "HubGrant" own WHERE own."recordId"=r.id AND own."visibilityScope"='user' AND own."recipientId"=${viewer.memberId}) THEN 2 ELSE 0 END +
       CASE WHEN r."dueAt"<now() AND r.status NOT IN ('DONE','RESOLVED','WAIVED') THEN 1 ELSE 0 END +
       CASE WHEN h."lastOpenedAt" IS NOT NULL THEN 1/(1+greatest(0,extract(epoch FROM now()-h."lastOpenedAt")/86400)) ELSE 0 END)::float8 score
      FROM "HubRecord" r LEFT JOIN "HubRecent" h ON h."recordId"=r.id AND h."memberId"=${viewer.memberId} AND h."orgId"=${viewer.orgId}
      WHERE ${visibilitySql(viewer)} AND r."entityType"<>'broadcast' AND (r."entityType"<>'member' OR EXISTS(SELECT 1 FROM "HubMembership" membership WHERE membership."orgId"=r."orgId" AND membership."memberId"=r."entityId")) AND (${titleMatch} OR r."searchVector" @@ to_tsquery('simple',${tsquery}))
    ), ranked AS (SELECT *,row_number() OVER (PARTITION BY "entityType" ORDER BY "titleMatch" DESC,score DESC,"updatedAt" DESC,id) rn FROM matches)
    SELECT * FROM ranked WHERE rn<=5 ORDER BY "entityType","titleMatch" DESC,score DESC,"updatedAt" DESC,id
  `);
  // Recheck at the response boundary, including any concurrent revocation.
  const visible = await prisma.hubRecord.findMany({
    where: { id: { in: rows.map((r) => r.id) }, ...recordWhere(viewer) },
    select: { id: true },
  });
  const ids = new Set(visible.map((r) => r.id));
  const owners = await prisma.member.findMany({
    where: { id: { in: rows.flatMap((r) => (r.ownerId ? [r.ownerId] : [])) } },
    select: { id: true, displayName: true },
  });
  return rows
    .filter((r) => ids.has(r.id))
    .map((r) => ({
      id: r.id,
      entityType: r.entityType,
      title: r.title,
      status: r.status,
      url: recordUrl(r.id),
      body: [
        owners.find((o) => o.id === r.ownerId)?.displayName,
        r.dueAt?.toLocaleDateString("en-PH", {
          timeZone: "Asia/Manila",
          month: "short",
          day: "numeric",
        }),
        r.body,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
}

export async function recommendations(viewer: Viewer) {
  const [recents, urgent] = await Promise.all([
    prisma.hubRecent.findMany({
      where: {
        orgId: viewer.orgId,
        memberId: viewer.memberId,
        record: recordWhere(viewer),
      },
      include: { record: true },
      orderBy: { lastOpenedAt: "desc" },
      take: 5,
    }),
    getNeedsYouToday(viewer.memberId),
  ]);
  const actionable = urgent.filter(
    (item) =>
      item.action &&
      (item.kind === "OVERDUE_TASK" ||
        item.kind === "UNPAID_PENALTY" ||
        item.kind === "MEETING_SOON"),
  );
  const visibleNeeds = await prisma.hubRecord.findMany({
    where: {
      id: { in: actionable.map((item) => item.id) },
      ...recordWhere(viewer),
    },
    include: { grants: true },
  });
  const recordsById = new Map(
    visibleNeeds
      .filter((record) => canSee(viewer, record.orgId, record.grants))
      .map((record) => [record.id, record]),
  );
  const needs = actionable.flatMap((item) => {
    const record = recordsById.get(item.id);
    return record
      ? [
          {
            id: record.id,
            title: record.title,
            body: item.detail,
            entityType: record.entityType,
            status: record.status,
            url: recordUrl(record.id),
          },
        ]
      : [];
  }).slice(0, 3);
  return {
    // The relation filter above evaluates visibility in the same database
    // statement that returns the records, so a per-row recheck only added an
    // N+1 query without closing a revocation window.
    recents: recents.map(({ record }) => ({
      id: record.id,
      title: record.title,
      body: record.body.slice(0, 160),
      status: record.status,
      entityType: record.entityType,
      url: recordUrl(record.id),
    })),
    needs,
  };
}

export async function recordOpen(viewer: Viewer, recordId: string) {
  if (!(await visibleRecord(viewer, recordId)))
    throw new Error("Record unavailable");
  await prisma.$transaction(async (tx) => {
    // Serializes concurrent opens for this user's history, including clear.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${viewer.orgId + ":" + viewer.memberId},0))`;
    await tx.hubRecent.upsert({
      where: {
        orgId_memberId_recordId: {
          orgId: viewer.orgId,
          memberId: viewer.memberId,
          recordId,
        },
      },
      create: { orgId: viewer.orgId, memberId: viewer.memberId, recordId },
      update: { lastOpenedAt: new Date() },
    });
    const old = await tx.hubRecent.findMany({
      where: { orgId: viewer.orgId, memberId: viewer.memberId },
      orderBy: [{ lastOpenedAt: "desc" }, { recordId: "asc" }],
      skip: 20,
    });
    await tx.hubRecent.deleteMany({
      where: {
        orgId: viewer.orgId,
        memberId: viewer.memberId,
        recordId: { in: old.map((r) => r.recordId) },
      },
    });
  });
}
