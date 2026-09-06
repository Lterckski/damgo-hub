// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { refreshRumP75, storeRumBatch } from "./store";
import type { RumSample } from "./shared";
const enabled =
  process.env.RUM_INTEGRATION_TESTS === "1" &&
  /127\.0\.0\.1:55432\/damgo_rum_/.test(process.env.DATABASE_URL ?? "");
const orgId = `rum-test-${Date.now()}`;
const base: RumSample = {
  kind: "vital",
  name: "INP",
  sampleId: "metric",
  pageId: "page",
  revision: 1,
  value: 100,
  route: "/tasks",
  pageRoute: "/dashboard",
  device: "mobile",
  target: "button",
  eventType: "click",
  inputDelay: 10,
  processingDuration: 50,
  presentationDelay: 40,
};
describe.skipIf(!enabled)("RUM PostgreSQL persistence and percentiles", () => {
  afterAll(async () => {
    await prisma.rumVitalP75.deleteMany({ where: { orgId } });
    await prisma.rumSample.deleteMany({ where: { orgId } });
    await prisma.$disconnect();
  });
  it("deduplicates, accepts a newer lower INP, rejects stale reports, and keeps each longest slow event", async () => {
    await storeRumBatch(orgId, [base], "fixture");
    await storeRumBatch(
      orgId,
      [{ ...base, revision: 3, value: 80 }],
      "fixture",
    );
    await storeRumBatch(
      orgId,
      [{ ...base, revision: 2, value: 300 }],
      "fixture",
    );
    expect(
      (
        await prisma.rumSample.findMany({ where: { orgId, kind: "vital" } })
      ).map((s) => s.value),
    ).toEqual([80]);
    const slow = { ...base, kind: "interaction" as const, value: 400 };
    await storeRumBatch(
      orgId,
      [slow, { ...slow, revision: 2, value: 240 }],
      "fixture",
    );
    expect(
      (
        await prisma.rumSample.findFirstOrThrow({
          where: { orgId, kind: "interaction" },
        })
      ).value,
    ).toBe(400);
  });
  it("logs exact seven-day p75 from all latest page values, not slow events or averages of percentiles", async () => {
    await storeRumBatch(
      orgId,
      [100, 200, 300].map((value, i) => ({
        ...base,
        pageId: `page-${i}`,
        value,
      })),
      "fixture",
    );
    const end = new Date("2026-09-07T00:00:00Z");
    await prisma.rumSample.updateMany({
      where: { orgId },
      data: { recordedAt: new Date("2026-09-06T23:00:00Z") },
    });
    await storeRumBatch(
      orgId,
      [{ ...base, pageId: "too-old", value: 9999 }],
      "fixture",
    );
    await prisma.rumSample.updateMany({
      where: { orgId, pageId: "too-old" },
      data: { recordedAt: new Date("2026-08-01T00:00:00Z") },
    });
    await refreshRumP75(end);
    await refreshRumP75(end);
    const rows = await prisma.rumVitalP75.findMany({ where: { orgId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sampleCount === 4 && r.p75 === 225)).toBe(true);
    expect(rows.find((r) => r.route !== "ALL")?.route).toBe("/dashboard");
  });
});
