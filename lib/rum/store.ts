import { prisma } from "@/lib/prisma";
import type { RumSample } from "./shared";
export async function storeRumBatch(
  orgId: string,
  samples: RumSample[],
  release: string,
) {
  await prisma.$transaction(
    samples.map(
      (s) => prisma.$executeRaw`
    INSERT INTO "RumSample" ("orgId","pageId","kind","sampleId","revision","name","value","route","pageRoute","device","release","target","eventType","inputDelay","processingDuration","presentationDelay")
    VALUES (${orgId},${s.pageId},${s.kind},${s.sampleId},${s.revision},${s.name},${s.value},${s.route},${s.pageRoute},${s.device},${release},${s.target},${s.eventType},${s.inputDelay},${s.processingDuration},${s.presentationDelay})
    ON CONFLICT ("orgId","pageId","kind","sampleId") DO UPDATE SET
      "revision"=EXCLUDED."revision", "value"=EXCLUDED."value", "route"=EXCLUDED."route",
      "target"=EXCLUDED."target", "eventType"=EXCLUDED."eventType",
      "inputDelay"=EXCLUDED."inputDelay", "processingDuration"=EXCLUDED."processingDuration",
      "presentationDelay"=EXCLUDED."presentationDelay", "updatedAt"=CURRENT_TIMESTAMP
    WHERE (EXCLUDED."kind"='vital' AND EXCLUDED."revision">"RumSample"."revision")
       OR (EXCLUDED."kind"='interaction' AND (EXCLUDED."value">"RumSample"."value" OR (EXCLUDED."value"="RumSample"."value" AND EXCLUDED."revision">"RumSample"."revision")))
  `,
    ),
  );
}

export async function refreshRumP75(windowEnd = new Date()) {
  // Fixed hour makes retries idempotent and leaves comparable observation windows.
  const end = new Date(Math.floor(windowEnd.getTime() / 3600000) * 3600000);
  const start = new Date(end.getTime() - 7 * 86400000);
  return prisma.$executeRaw`
    INSERT INTO "RumVitalP75" ("orgId","windowEnd","windowStart","name","route","device","release","sampleCount","p75")
    SELECT "orgId", ${end}, ${start}, "name", COALESCE("pageRoute",'ALL'), COALESCE("device",'ALL'), COALESCE("release",'ALL'),
      COUNT(*)::int, percentile_cont(0.75) WITHIN GROUP (ORDER BY "value")
    FROM "RumSample" WHERE "kind"='vital' AND "recordedAt">=${start} AND "recordedAt"<${end}
    GROUP BY GROUPING SETS (("orgId","name"),("orgId","name","pageRoute","device","release"))
    ON CONFLICT ("orgId","windowEnd","name","route","device","release") DO UPDATE SET
      "sampleCount"=EXCLUDED."sampleCount", "p75"=EXCLUDED."p75", "computedAt"=CURRENT_TIMESTAMP
  `;
}
