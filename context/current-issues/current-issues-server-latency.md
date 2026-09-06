# Server latency audit

**Audited:** 2026-09-06 on `feat/mobile-browser-usability`  
**Scope:** all 23 page files, 52 route-handler files, `proxy.ts`, shared Clerk/Prisma loaders, and Trigger.dev loops. The repository contains 615 `await` sites under `app`; the findings below separate independent work from authentication, transaction, and write-order dependencies that must stay sequential.

The millisecond ranges are engineering estimates, not production traces. They express round-trip/waterfall cost and should be replaced with Vercel function-duration and database-query measurements after deployment. The region diagnosis itself is measured from the live response headers and repository configuration.

## Ranked findings

| Rank | Finding | Evidence | Estimated wall time saved | Resolution |
| --- | --- | --- | ---: | --- |
| 1 | Vercel functions and PostgreSQL are on opposite sides of the world | `x-vercel-id: sin1::iad1::…` on the live `/dashboard` response means Singapore ingress and `iad1` execution. `prisma-composer.config.mjs` provisions `ap-southeast-1` (Singapore). There was no function-region config in the repo. | Roughly **180–260 ms per serial DB wave**; **0.5–2+ s** on loaders with several waves | Added `vercel.json` with `regions: ["sin1"]`. A production deployment is required before the live header changes. |
| 2 | The common API guard hydrated the full viewer on every request | All 69 guarded handler methods called `hubApiGuard()`, which fetched Clerk's whole roster, reconciled members, rewrote `HubMembership`, and loaded project membership before the handler's own auth/data work. | **100–400 ms** on ordinary API calls after region alignment; materially more with the old cross-region DB placement | `hubApiGuard()` now checks the workspace boundary plus one targeted live Clerk membership lookup so removal/role changes take effect immediately. `getHubViewer()` uses the signed-in member and project access directly. Full roster projection and project lookup run only for features that need them. |
| 3 | Admin rendered in two serial fan-out phases and fetched the same Clerk roster three times | `/admin` waited for tables/queue/audit/settings before starting stats and reconciliation. Tables, stats, reconciliation, and viewer hydration independently listed Clerk members. Every orphan then ran 13 count queries. | **100–500 ms**, plus about one extra Clerk RTT and **13 × orphan count** DB statements | Stats/reconciliation start with the first admin fan-out. Clerk roster/invitations are request-memoized and pagination after page one runs concurrently. Orphan ownership is counted with 13 grouped queries total, independent of orphan count. |
| 4 | Inline visibility awaits serialized supposedly parallel loaders | Calendar, Tasks, admin tables/queue/stats, and task includes evaluated several `entityVisibilityWhere()` calls before their Prisma promises were constructed. | **10–80 ms** in-region; formerly **0.2–1.2 s** where several visibility waves crossed regions | Added `entityVisibilityWheres()` and reused one scoped `HubRecord` query per loader. Calendar, Tasks, admin tables, queue, and stats now start source queries together after that single dependency. |
| 5 | Header recommendations/notifications and detail pages contained query waterfalls or N+1 checks | Empty-search recommendations called `visibleRecord()` once per urgent/recent result. Legacy broadcast import performed up to four queries per receipt on every notification poll. Project detail fetched the project for authorization and then again for rendering; record detail loaded comments → memberships → members → milestones. | **20–200 ms** in-region and proportional to recents/broadcasts; formerly **0.4–1+ s** on the cross-region deployment | Recommendations and broadcast visibility/existence checks are batched. Project access is derived from the one visible project payload. Record comments, roster options, and milestones run concurrently. |
| 6 | The root theme cookie makes every page dynamic | `app/layout.tsx` calls `cookies()`. The production build classifies every HTML route as `ƒ`, including sign-in, sign-up, and workspace-access. | Public-page cold start: typically **50–300 ms** | Not changed. Sign-in, sign-up, and workspace-access can become static shells by moving first-paint theme selection out of the root server layout. Authenticated pages still require dynamic personalized data. |
| 7 | Several lower-traffic page loaders still have avoidable prerequisite waves | Admin deep links, Docs, Finance, Meetings, Penalties, and Projects first resolve member/admin/visibility, then start the main query; some picker queries could begin earlier. | Usually **5–40 ms** in-region | Deferred below the top five. The data query itself cannot start before its visibility predicate exists. |
| 8 | Bulk mutation and provider-delivery loops are serial | Admin queue/bulk actions, meeting agenda reorder, notification email delivery, and Google Calendar sync await each item. | Scales with selected/recipient count | Kept serial where partial-result ordering, one-connection transactions, or provider rate isolation matters. Admin bulk mutation can later use a bounded concurrency pool after lock/contention measurement. |

Vercel documents `iad1` as the default function region and recommends placing functions close to the data source. Its region list maps `sin1` to Singapore. Prisma maps `ap-southeast-1` to Singapore: [Vercel function regions](https://vercel.com/docs/functions/configuring-functions/region), [Vercel regions](https://vercel.com/docs/regions), [Prisma Postgres regions](https://www.prisma.io/docs/postgres/faq).

## Clerk middleware coverage

`proxy.ts` uses `clerkMiddleware()` without a path-level protect callback. Authentication and authorization remain at the `(app)` layout and route/resource boundaries.

The matcher now:

- skips `/_next/*`, `/_vercel/*`, and ordinary static-file extensions;
- always covers `/api/*`, `/trpc/*`, and `/__clerk/*`;
- covers every extensionless document route, including `/`, `/sign-in`, `/sign-up`, `/workspace-access`, authenticated pages, and unknown extensionless paths that may render the not-found page.

The public auth pages are not protected, but they use Clerk UI/context, so middleware there is expected. There are no unauthenticated content pages or webhooks in the repository. The only clearly unnecessary middleware traffic was Vercel Speed Insights under `/_vercel/*`, which is now excluded. This follows Clerk's current recommended broad matcher and resource-level authorization model: [Clerk middleware reference](https://clerk.com/docs/reference/nextjs/clerk-middleware).

## Sequential await inventory

### Refactored independent work

| Paths | Previous sequence | Refactor |
| --- | --- | --- |
| `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx` | auth → workspace → viewer → member → three role helpers | One workspace check, then viewer/member/cookie concurrently; role booleans derive from the same verified session. Dashboard removed its redundant second `auth()`. |
| `app/(app)/admin/page.tsx` | first seven-result fan-out → stats/reconciliation/search fan-out | Stats and reconciliation start immediately; only search-index construction waits for tables. |
| `app/(app)/calendar/page.tsx`, `app/(app)/tasks/page.tsx` | member → admin → multiple visibility calls evaluated serially inside `Promise.all` → source queries | Member/admin/roster/one visibility batch run together, followed by one source-query fan-out. |
| `lib/admin/{tables,queue,stats}.ts` | settings → roster or multiple inline visibility awaits → data queries | Settings, request-cached roster, and one visibility batch overlap; data queries then fan out. |
| `app/(app)/projects/[projectId]/page.tsx` | params → member → access project query → visible project query | Params/member/visibility/roster overlap; one project query supplies both access and render data. |
| `app/(app)/records/[recordId]/page.tsx` | viewer → params → record → comments → memberships → members → optional milestones | Record remains the authorization dependency; comments, roster, and optional milestones then run together. |
| `lib/clerk-roster.ts` | Clerk membership/invitation pages fetched one after another, separately per consumer | Each first page supplies `totalCount`; remaining pages run together and both complete results are shared within the render. |
| `lib/member-reconciliation.ts` | one visibility lookup per task count and 13 counts per orphan | One task scope, then 13 grouped counts for all orphan IDs. |
| `lib/hub/search.ts`, `lib/hub/notifications.ts` | one visibility/existence query per recommendation or legacy broadcast receipt | One set-based query per concern; existing/imported/native notification checks run together. |

### Remaining safe parallelization opportunities

These are the remaining independent awaits found in page/server loaders. They rank below the implemented work because each saves at most one short in-region wave or occurs on a low-frequency mutation.

| Paths | Opportunity |
| --- | --- |
| `app/(app)/admin/{finance,penalties,projects}/page.tsx`, `app/(app)/docs/{page,[docId]/page}.tsx`, `app/(app)/finance/page.tsx` | Begin member/admin/picker work while resolving the single visibility predicate; then issue the scoped query. |
| `app/(app)/meetings/{page,[meetingId]/page}.tsx`, `app/(app)/penalties/page.tsx`, `app/(app)/projects/page.tsx` | Start the picker and visibility lookup with current-member/admin resolution. The main query still depends on both permission inputs. |
| `app/api/calendar/events/{route,[eventId]/route}.ts` | After the database write, independent enqueue/cancel/schedule provider calls can use bounded concurrency. Compensation currently depends on their exact order, so this needs failure-path tests first. |
| `app/api/meetings/{route,[meetingId]/route}.ts` | Reminder cancellation and rescheduling after a committed mutation can overlap where compensation semantics allow. Participant and outbox writes inside the serializable transaction remain ordered. |
| `app/api/admin/danger/route.ts`, `app/api/members/[memberId]/route.ts` | Several independent `updateMany` calls are sequential inside interactive transactions. Prisma uses one transaction connection, so `Promise.all` alone would not create DB parallelism; converting to batch SQL is required for a real gain. |
| `app/api/admin/{queue,bulk}/route.ts`, `lib/admin/mutations.ts` | Per-ID mutation dispatch is serial and scales linearly. A future bounded pool must preserve per-item outcomes and avoid racing rows touched by more than one action. |

Request-body parsing, route `params`, auth checks, reads required to validate a later write, transaction steps, Blob pointer compare-and-swap, and create/update → enqueue sequences were reviewed and left ordered because the later operation depends on the result or because moving work before authorization is not useful.

## N+1 and unbatched calls

| Location | Pattern | State |
| --- | --- | --- |
| `lib/hub/context.ts` / `lib/organization-roles.ts` | Delete plus one `HubMembership.upsert` per org member on every viewer request; later roster reads still deleted/recreated the whole projection | Fixed. Removed from viewer hot path; roster projection now compares current/desired rows and only upserts changed memberships or deletes removed ones. No transaction runs when the projection is unchanged. |
| `lib/member-reconciliation.ts` | 13 ownership counts per orphan | Fixed with 13 grouped queries total. |
| `lib/hub/search.ts` | `visibleRecord()` per urgent item and recent | Fixed with one batched visible-record read; recents already use a visibility relation filter. |
| `lib/hub/notifications.ts` | Visibility, legacy existence, native existence, and upsert checks per broadcast receipt | Fixed with three concurrent set reads and one batched transaction only when imports are missing. |
| `lib/organization-roles.ts` | One profile upsert per changed Clerk member | Remaining, but only runs for changed profiles. A single PostgreSQL `INSERT … ON CONFLICT DO UPDATE` can replace it if roster churn grows. |
| `lib/meetings.ts` | Two per-item update loops for agenda reorder | Remaining. Replace with one `UPDATE … CASE` statement after adding ordering/concurrency tests. |
| `lib/admin/mutations.ts`, `app/api/admin/queue/route.ts` | One mutation per selected ID | Remaining deliberately serial; add bounded concurrency after contention data. |
| `src/trigger/hub-notifications.ts` | Project and pending-notification queries per member | Remaining background N+1. Batch projects and pending states across member IDs; this affects worker duration, not request TTFB. |
| `src/trigger/sync-calendar-item.ts`, `src/trigger/meeting-reminder.ts`, `lib/meeting-notifications.ts` | One provider call per member/recipient | Remaining deliberately serial for provider isolation/rate behavior; bounded concurrency is possible with provider limits. |

## Rendering classification

The successful Next.js 16.3.3 production build reports every HTML route as dynamically rendered. There is no `headers()` call in a page or layout.

| Route class | Dynamic trigger | Best fit |
| --- | --- | --- |
| `/sign-in`, `/sign-up`, `/workspace-access`, `/_not-found` | Only the root layout's `cookies()` theme read among application code | Static shell after client/inline first-paint theme initialization. No ISR data is needed. |
| `/` | `auth()` chooses the redirect | Dynamic; negligible content to cache. |
| All routes under `(app)` | Root `cookies()`, authenticated layout, and member/visibility-specific Prisma reads | Keep personalized data dynamic/private. Shared chrome and page skeletons can be partially prerendered after enabling Cache Components and placing cookie/auth/data sections behind explicit Suspense boundaries. |
| All route handlers | Authenticated request logic and mutations | Dynamic by design; responses should remain private/no-store where personalized. |

ISR is unsafe for the authenticated page payloads because visibility differs by user, role, project membership, and the development view-as-member cookie. Partial prerendering is the appropriate future option for their shared shell. Next's Cache Components/PPR guidance also notes that request-time APIs such as cookies/auth must sit behind Suspense when prerendering a shell: [Next.js Partial Prerendering](https://nextjs.org/docs/app/getting-started/partial-prerendering).

## Validation

- `npm test`: 22 test files passed, 2 skipped; 89 tests passed, 17 skipped.
- `npx tsc --noEmit`: passed.
- Targeted ESLint for every changed server file: passed.
- `npm run build`: passed; route classification captured above.
- `git diff --check`: passed.

Production verification after merge should confirm `x-vercel-id` has `sin1` in the execution-region position, then compare p50/p75 function duration and Prisma query spans for `/api/hub`, `/dashboard`, `/tasks`, `/calendar`, and `/admin` against the preceding seven days.
