# Client bundle and hydration audit

Date: 2026-09-06. Status: initial-load refactor implemented on `feat/mobile-browser-usability`; authenticated production tracing and field confirmation remain pending.

## Measurement method

The route totals below come from clean Next.js 16.3.3 production builds. `scripts/analyze-client-bundles.mjs` reads each App Router client-reference manifest, unions the route's initial JavaScript files, and reports the actual file bytes plus gzip bytes. Shared chunks are counted once within a route. This is an initial-route payload estimate: it does not include chunks fetched after a dynamic import is opened, HTTP headers, cache reuse from an earlier navigation, or Brotli transfer size.

The baseline is commit `3320bd1`, before this refactor. The analyzer is reproducible with `npm run analyze:client`; `node scripts/analyze-client-bundles.mjs --json` can be used against an existing `.next` build. API and server-only routes have no browser bundle and therefore do not appear in the table.

## Route totals

“Largest contributors” names the meaningful route-specific packages on top of the shared Next/React, Base UI, Clerk, and application shell. A source-map attribution pass on the baseline measured the common core at approximately Next/React 212 KiB, Base UI 87–105 KiB, Clerk shared/react/query 51 KiB, application code 31–61 KiB, `date-fns` 11 KiB, and Lucide 9–11 KiB. Those source-level gzip figures are diagnostic and are not additive because production chunks compress shared text together.

| Route | After raw KiB | Before gzip KiB | After gzip KiB | Saved | Initial chunks | Largest contributors / route-specific payload |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `/ideas` | 1,404.4 | 478.3 | 436.0 | 42.3 (8.8%) | 20 | Next/React, Base UI, Liveblocks core (~56 KiB), XYFlow React/system (~40 KiB), app canvas code |
| `/tasks` | 1,138.8 | 363.0 | 356.5 | 6.5 (1.8%) | 23 | Next/React, Base UI, Clerk, task/forms code, `date-fns` |
| `/admin` | 1,143.1 | 388.5 | 355.8 | 32.7 (8.4%) | 22 | Next/React, Base UI, app table/queue code, Clerk; drawer/palette/broadcast/reason overlays deferred |
| `/calendar` | 1,134.9 | 360.0 | 355.0 | 5.0 (1.4%) | 23 | Next/React, Base UI, calendar grid/forms, Clerk, `date-fns` |
| `/meetings` | 1,126.9 | 360.0 | 354.6 | 5.4 (1.5%) | 23 | Next/React, Base UI, meeting form/list code, Clerk, `date-fns` |
| `/admin/projects` | 1,125.6 | 362.3 | 353.9 | 8.4 (2.3%) | 23 | Next/React, Base UI, project form/list code, Clerk, `date-fns` |
| `/projects` | 1,124.7 | 362.1 | 353.7 | 8.4 (2.3%) | 23 | Next/React, Base UI, project form/list code, Clerk, `date-fns` |
| `/meetings/[meetingId]` | 1,119.1 | 356.0 | 350.2 | 5.8 (1.6%) | 22 | Next/React, Base UI, meeting detail/form code, Clerk, `date-fns` |
| `/projects/[projectId]` | 1,098.1 | 506.1 | 343.2 | 162.9 (32.2%) | 22 | Next/React, Base UI, Clerk, project editor; Liveblocks/XYFlow roadmap and date picker deferred |
| `/records/[recordId]` | 1,093.1 | 353.7 | 342.4 | 11.3 (3.2%) | 22 | Next/React, Base UI, record actions, Clerk, `date-fns` |
| `/admin/penalties` | 1,088.1 | 361.5 | 341.8 | 19.7 (5.4%) | 22 | Next/React, Base UI, penalty controls, Clerk, `date-fns` |
| `/penalties` | 1,088.1 | 361.5 | 341.8 | 19.7 (5.4%) | 22 | Next/React, Base UI, penalty controls, Clerk, `date-fns` |
| `/admin/finance` | 1,071.2 | 355.6 | 335.9 | 19.7 (5.6%) | 21 | Next/React, Base UI, finance table/form, Clerk, `date-fns` |
| `/finance` | 1,071.2 | 355.6 | 335.9 | 19.7 (5.6%) | 21 | Next/React, Base UI, finance table/form, Clerk, `date-fns` |
| `/admin/members` | 1,067.2 | 367.7 | 334.0 | 33.7 (9.2%) | 21 | Next/React, Base UI, member table/dialogs, Clerk |
| `/members` | 1,067.2 | 367.7 | 334.0 | 33.7 (9.2%) | 21 | Next/React, Base UI, member table/dialogs, Clerk |
| `/dashboard` | 1,058.1 | 372.0 | 330.1 | 41.9 (11.3%) | 21 | Next/React, Base UI, Clerk, interactive personal cards; read-only cards are server-rendered and capture forms deferred |
| `/docs/[docId]` | 1,024.1 | 398.0 | 319.4 | 78.6 (19.8%) | 20 | Next/React, Base UI, Clerk, document editor; Markdown parser moved to the server and Drive picker deferred |
| `/docs` | 1,020.1 | 355.0 | 318.8 | 36.2 (10.2%) | 20 | Next/React, Base UI, docs/create UI, Clerk |
| `/sign-in/[[...sign-in]]` | 751.3 | 228.0 | 227.9 | 0.1 | 12 | Next/React and Clerk |
| `/sign-up/[[...sign-up]]` | 751.3 | 228.0 | 227.9 | 0.1 | 12 | Next/React and Clerk |
| `/workspace-access` | 743.7 | 225.4 | 225.3 | 0.1 | 12 | Next/React and Clerk |
| `/` | 735.0 | 221.9 | 221.8 | 0.1 | 11 | Next/React and root Clerk provider |
| `/_not-found` | 735.0 | 221.9 | 221.8 | 0.1 | 11 | Next/React and root Clerk provider |

The production-file comparison is the authoritative before/after result. Turbopack changed chunk composition between builds, so chunk counts and hashed chunk names are not stable performance targets.

## Client-boundary findings and refactor

The repository had 102 explicit `"use client"` modules before the refactor and has 95 afterward. Ten dashboard modules no longer form client boundaries: `my-dashboard-panel`, `team-overview-panel`, `my-activity-card`, `my-projects-card`, `hackathon-card`, `penalty-ledger-card`, `team-finance-card`, `team-projects-card`, `team-pulse`, and `workload-card`. Three deliberately narrow clients were added for capture state, the deferred capture form, and deferred header utility dialogs.

| Finding | Implemented change | Result |
| --- | --- | --- |
| `AppHeader` statically imported every search/create/preferences/org/theme dialog, putting hidden overlay code in every authenticated route's initial graph. | `next/dynamic` imports plus conditional mounting; lightweight create types moved to `header-create-types.ts`; org/theme dialogs moved to `header-utility-dialogs.tsx`. | Shared authenticated routes shed initial JavaScript, with the largest secondary gains on dashboard/docs/members. |
| The project Overview imported the entire Liveblocks + React Flow roadmap and date picker before Roadmap or Edit was used. Base UI Tabs also mounted the inactive panel, which defeated a dynamic import. | Replaced the two-tab wrapper with a small accessible local tab switch; import `RoadmapBoard` only after Roadmap is selected and `DateTimePicker` only when its code is requested. | `/projects/[projectId]` saves 162.9 KiB gzip (32.2%) on initial load. |
| Document Markdown was parsed by `react-markdown`/`remark-gfm` inside the client editor boundary. The baseline included `micromark-core-commonmark` (~9.6 KiB) plus the surrounding Markdown stack. | The page server-renders `MarkdownContent` and passes the rendered node through the client editor. `DriveFilePicker` is dynamically loaded for edit mode. | `/docs/[docId]` saves 78.6 KiB gzip (19.8%); Markdown parsing is absent from the browser graph for the initial document view. |
| `AdminConsole` eagerly imported the record drawer, command palette, broadcast composer, and reason dialog. Most visits do not open any of them. | Each overlay is a dynamic import and is mounted only for an active request. Props use type-only imports. | `/admin` saves 32.7 KiB gzip (8.4%) while preserving the same actions. |
| Dashboard server data and static cards were pulled under two broad client panels only to share quick-capture callbacks. The closed quick-capture forms were also in the initial graph. | Added a narrow `DashboardCaptureProvider`; read-only cards/panels are Server Components; interactive task/money/upcoming controls read capture context; the actual form dialog is a conditional dynamic import. | `/dashboard` saves 42.0 KiB gzip (11.3%) and removes ten broad client boundaries. |
| Notification relative time imported `date-fns/formatDistanceToNow` into the global authenticated header. | Reused the project's bounded `agoLabel` helper. | Removes that global-header reason to load date formatting; route-owned date formatting remains where it is visible immediately. |

The remaining 95 client modules are primarily real interaction boundaries: forms, Base UI primitives, tables, calendars, Liveblocks presence/boards, dialogs, and browser monitoring. The next plausible boundary pass is to split the trigger from `NewTaskDialog`, `MeetingFormDialog`, `NewProjectDialog`, calendar edit dialogs, and similar route-owned forms. Those components currently own both their trigger and form, so a plain dynamic component still loads during the initial render. A trigger/controller split is required to defer them correctly. This is a lower-confidence follow-up because these are primary actions on their routes and it trades first-open latency for smaller initial payload.

## Imports and heavy dependencies

- No local `index.ts`/`index.tsx` barrels exist under `app`, `components`, or `lib`, and no local barrel import was found. There is no local barrel fan-out to fix.
- Lucide is imported through its documented package entry with named imports. Next 16.3.3 includes `lucide-react` in its built-in optimized package-import list, and the analyzer found roughly 9–11 KiB per representative route rather than the full icon library. Per-file internal imports would couple the app to package internals without a measured win.
- `date-fns` imports are named and tree-shaken; representative routes carried about 11 KiB in the baseline. The accidental global header import was removed. Calendar, tasks, meetings, and project date displays use it as visible route functionality.
- `@xyflow/react` is also imported through a package barrel. On `/ideas`, React Flow + Liveblocks are the page itself and must load eagerly. On project detail they were hidden behind the Roadmap tab and are now deferred until that tab is selected.
- `react-markdown`, `remark-gfm`, and Micromark were the incorrectly client-loaded Markdown stack. They now execute during server rendering for document display. Editing still sends the Markdown string to the browser because the editor needs it.
- There is no charting package in `package.json` or the application imports.
- `react-day-picker` exists because the generated UI calendar primitive depends on it, but the main month calendar is a custom `date-fns` grid. It is not the `/calendar` route's primary renderer. Date/picker UI that is only behind the project edit flow is deferred with that flow.
- Base UI is the largest non-framework general contributor. It is used by visible tabs, tables, menus and forms throughout the app. The refactor removes hidden-overlay imports where a clean boundary exists; replacing the component system would be a broad design/accessibility migration, not a safe bundle-only change.
- The root `ClerkProvider` keeps Clerk in public-route client graphs. Moving it into route groups may reduce `/` and `/_not-found`, but sign-in/sign-up and the authenticated shell require Clerk. Public routes are already the smallest and this pass leaves provider topology intact.

## Hydration trace

The trace harness in `tests/mobile/hydration.pw.ts` server-renders representative dashboard and admin fixtures through Vite, hydrates the actual component trees with `hydrateRoot`, applies 4× Chrome CPU throttling, observes Long Tasks, and records a Chrome DevTools Protocol trace. Each value below is the median of three fresh-page samples at 1280×800. Admin uses 1,000 representative member/search records so it exercises a realistic large console rather than an empty state.

| Route fixture | Before hydration window | After hydration window | Before longest task | After longest task | Finding |
| --- | ---: | ---: | ---: | ---: | --- |
| Dashboard | 383.3 ms | 362.5 ms | 134 ms | 134 ms | Window improved 20.8 ms (5.4%); one long task remains and its median maximum did not improve. |
| Admin | 716.0 ms | 656.2 ms | 222 ms | 208 ms | Window improved 59.8 ms (8.4%); median maximum long task improved 14 ms (6.3%), but remains well above 50 ms. |

Compact traces for the median runs can be loaded in Perfetto or Chrome's trace viewer:

- [Dashboard before](../performance-traces/dashboard-before.json)
- [Dashboard after](../performance-traces/dashboard-after.json)
- [Admin before](../performance-traces/admin-before.json)
- [Admin after](../performance-traces/admin-after.json)

The PerformanceObserver result is the exact hydration-mark window measurement. The compact trace retains renderer-main `RunTask` events of at least 50 ms and their nested timeline events across page load, because the CDP trace stream did not retain the custom user-timing marks reliably. These are controlled local component traces, not production Next.js navigation traces, field INP, or mobile-device evidence. They show that bundle/boundary work shortened the hydration window, while component and framework startup still create long tasks. The existing RUM pipeline should determine which targets matter at p75 before further interaction-specific work.

## Validation and remaining risk

The route analyzer, deterministic hydration fixtures, and four trace artifacts are checked into the repository so the measurement can be repeated and inspected. Dynamic overlays have no network-loading skeleton unless the interaction warrants one; the roadmap has an explicit loading state because its chunk is much larger. A cold first open can therefore have a short fetch delay even though initial hydration is smaller.

The route union remains large because every authenticated page shares Next/React, Clerk, Base UI, the header/dock, monitoring, and route-owned interactive forms. `/ideas` remains the heaviest route at 436.0 KiB gzip because Liveblocks and React Flow are its core product surface. The controlled traces still contain long tasks, so this work should not be described as eliminating hydration jank or proving good INP. Use the RUM p75 table and authenticated production profiles to choose the next refactor.
