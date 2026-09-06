CREATE TABLE "RumSample" (
  "orgId" TEXT NOT NULL, "pageId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "sampleId" TEXT NOT NULL, "revision" INTEGER NOT NULL, "name" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL, "route" TEXT NOT NULL, "pageRoute" TEXT NOT NULL,
  "device" TEXT NOT NULL, "release" TEXT NOT NULL, "target" TEXT, "eventType" TEXT,
  "inputDelay" DOUBLE PRECISION, "processingDuration" DOUBLE PRECISION, "presentationDelay" DOUBLE PRECISION,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RumSample_pkey" PRIMARY KEY ("orgId", "pageId", "kind", "sampleId"),
  CONSTRAINT "RumSample_kind_check" CHECK ("kind" IN ('vital','interaction')),
  CONSTRAINT "RumSample_name_check" CHECK ("name" IN ('CLS','LCP','INP'))
);
CREATE INDEX "RumSample_kind_recordedAt_idx" ON "RumSample"("kind", "recordedAt");
CREATE TABLE "RumVitalP75" (
  "orgId" TEXT NOT NULL, "windowEnd" TIMESTAMP(3) NOT NULL, "windowStart" TIMESTAMP(3) NOT NULL,
  "name" TEXT NOT NULL, "route" TEXT NOT NULL, "device" TEXT NOT NULL, "release" TEXT NOT NULL,
  "sampleCount" INTEGER NOT NULL, "p75" DOUBLE PRECISION NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RumVitalP75_pkey" PRIMARY KEY ("orgId", "windowEnd", "name", "route", "device", "release")
);
