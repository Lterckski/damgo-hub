# Real user monitoring: one-week observation

Status: implemented locally; production activation and the observation week have not started. This is instrumentation only. Do not optimize or refactor interaction behavior further until a full week of real traffic has been collected and reviewed. Earlier local performance changes are preserved, not deployed or reverted by this task.

## Collection

- `@vercel/speed-insights/next` is mounted in the root layout. Enable Speed Insights for the Vercel project. The wrapper strips query strings, fragments and record IDs before sending and uses 100% sampling.
- `web-vitals/attribution` collects CLS, LCP and INP after the authenticated workspace layout mounts. Buffered browser performance entries include earlier page events. The shared workspace guard protects `POST /api/rum`; custom PostgreSQL RUM therefore covers authenticated workspace usage, while Speed Insights also covers public pages.
- `onINP` uses `reportAllChanges` and `generateTarget` for a structural target selector. Each report includes the actual event name plus the library's input delay, processing duration and presentation delay. No element text, input values, aria-labels, classes, DOM IDs, URL queries, member IDs or email addresses are sent to our endpoint.
- A separate Event Timing observer records **every browser-reported interaction above 200 ms**, even if it is not a new INP candidate. Events sharing an interaction ID are deduplicated to their longest event. Those rows combine the observed same-interaction events in the dominant event's painted frame (including pointer/click processing); the official page INP row uses web-vitals' full frame attribution. The observer uses a 16 ms threshold to include shorter companion events, but persists only slow interactions above 200 ms. They are related but are not interchangeable populations.
- Targets are structural selectors up to five levels (including nth-of-type). Removed/detached elements can be `unknown`. Device buckets use initial viewport width, not user-agent fingerprinting. Release comes from the client build (`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, falling back to `NEXT_PUBLIC_RUM_RELEASE`), so an old tab remains associated with its original release after deployment.
- Routes are normalized to fixed paths and `/docs/[id]`, `/projects/[id]`, `/meetings/[id]`, `/records/[id]`. CWV rollups use the document's entry route (`pageRoute`). The diagnostic `route` uses the route at the interaction time. App Router transitions do not create new official CWV page samples; bfcache restores do.
- No field metric is fabricated when a browser lacks support or a visit has no interaction. INP/Event Timing coverage depends on browser support; a missing INP row is not a zero. The custom collector does not measure inside cross-origin iframes.

## Storage and aggregation

Migration: `20260906150000_real_user_monitoring` adds:

1. **RumSample:** `kind='vital'` retains the latest value per metric ID and document lifecycle. Revisions reject delayed/stale reports, even when a newer INP value is lower. `kind='interaction'` retains the longest slow event per interaction ID. Page IDs are random per document/bfcache lifecycle, not persistent user identifiers. Organization is supplied by the verified server session.
2. **RumVitalP75:** physical queryable table. Trigger.dev task `rum-vitals-p75-hourly` runs at minute 5 each hour. It stores an exact PostgreSQL `percentile_cont(0.75)` snapshot over the seven-day window ending on the most recent completed UTC hour, with sample count, window bounds and computation timestamp. There is an overall row per metric and rows per entry route/device/client release.

Rollups include **all collected latest page metrics**, including good values, not just slow interactions. They never average daily percentiles. CLS is unitless; LCP/INP and delay columns are milliseconds. Active visits can still update their latest metric. Windows use first server receipt time, avoiding untrusted client wall-clock timestamps. These are live RUM population snapshots, not immutable CrUX finalization.

The collector batches up to 20 samples every 15 seconds and flushes on hidden/pagehide using beacon with keepalive fallback. Buffers cap at 100 pending records; a `dropped` counter is included in the envelope for diagnostics. Delivery is best effort: browser termination, blockers, full beacon queues, failed ingestion or revoked sessions can lose reports. The server bounds streamed payloads to 30 KB and accepts only the validated schema from same-origin authenticated requests. Nothing is read back through a public telemetry API. Raw samples are retained for this observation; no automatic deletion is introduced during the week.

## Activation

1. Apply migrations through the normal production deployment (`vercel-build` already runs `prisma migrate deploy`). Do not point fixture tests at the production database.
2. Enable **Speed Insights** in the Damgo Hub Vercel dashboard, following [Vercel's setup guide](https://vercel.com/docs/speed-insights/quickstart).
3. Set `NEXT_PUBLIC_RUM_ENABLED=true` and `RUM_ENABLED=true` for the production app. Set the same server `RUM_ENABLED=true` and production database URL in Trigger.dev. Leave preview/local flags off to avoid mixing test traffic into the real observation.
4. Ensure Vercel exposes `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, or set `NEXT_PUBLIC_RUM_RELEASE` to the deployed commit SHA before building. Deploy the app and the Trigger.dev task. Public env flags are compiled at build time.
5. Verify the Speed Insights script loads, real signed-in navigation produces 204 responses from `/api/rum`, raw rows appear, and the hourly task creates p75 rows. Server ingestion failure logs are generic and omit payloads.
6. Record the first production sample timestamp and release below. Keep the observed release stable for seven full days before deciding optimizations. If a functional change is necessary, compare releases separately.

Observation started: **pending production activation**. First review: **seven days after activation**, not seven days after this local implementation.

## Queries

Latest overall rolling p75 (scope the organization when querying shared database tooling):

```sql
SELECT "name", "p75", "sampleCount", "sampleCount" < 20 AS "lowSampleCount",
       "windowStart", "windowEnd", "computedAt"
FROM "RumVitalP75"
WHERE "orgId" = :org_id AND "route" = 'ALL' AND "device" = 'ALL' AND "release" = 'ALL'
  AND "windowEnd" = (SELECT MAX("windowEnd") FROM "RumVitalP75" WHERE "orgId" = :org_id)
ORDER BY "name";
```

Latest per-route/device/release p75:

```sql
SELECT "route", "device", "release", "name", "p75", "sampleCount"
FROM "RumVitalP75"
WHERE "orgId" = :org_id AND "route" <> 'ALL'
  AND "windowEnd" = (SELECT MAX("windowEnd") FROM "RumVitalP75" WHERE "orgId" = :org_id)
ORDER BY "name", "p75" DESC;
```

Slow-interaction diagnosis (this p75 is explicitly the **slow-event subset**, not CWV INP):

```sql
SELECT "route", "device", "target", "eventType", COUNT(*) AS "slowInteractions",
       percentile_cont(.75) WITHIN GROUP (ORDER BY "value") AS "slowEventP75Ms",
       AVG("inputDelay") AS "meanInputDelayMs",
       AVG("processingDuration") AS "meanProcessingMs",
       AVG("presentationDelay") AS "meanPresentationMs"
FROM "RumSample"
WHERE "orgId" = :org_id AND "kind" = 'interaction'
  AND "recordedAt" >= NOW() - INTERVAL '7 days'
GROUP BY "route", "device", "target", "eventType"
ORDER BY "slowInteractions" DESC;
```

Check population coverage before interpreting percentiles:

```sql
SELECT "name", "device", "release", MIN("recordedAt") AS "firstSample",
       MAX("updatedAt") AS "lastUpdate", COUNT(*) AS "pageMetrics"
FROM "RumSample" WHERE "orgId" = :org_id AND "kind" = 'vital'
GROUP BY "name", "device", "release";
```

`:org_id` is a query-tool parameter; replace it with a bound parameter supported by your SQL client. Low-sample flags are a review aid, not a statistical confidence guarantee.

## Validation

Validation passed: 89 default unit/component tests (17 opt-in integration tests skipped); all eight targeted RUM tests including two isolated PostgreSQL tests; nine Chrome fixture/browser checks; production builds with RUM disabled and enabled; targeted lint and whitespace checks. See [progress](../progress-tracker.md). Database tests use an isolated PostgreSQL database. The browser fixture uses two deliberately slow handlers exclusively inside `tests/`; no application handler was modified. Production dashboard ingestion, authenticated real-device coverage and the scheduled worker still need activation verification.

Implementation references: [collector](../../lib/rum/client.ts), [validation](../../lib/rum/validate.ts), [ingestion](../../app/api/rum/route.ts), [storage/percentiles](../../lib/rum/store.ts), [hourly task](../../src/trigger/rum-rollup.ts). Library semantics follow the [official web-vitals documentation](https://github.com/GoogleChrome/web-vitals#readme).
