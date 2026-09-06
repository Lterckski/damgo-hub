# Interaction performance audit

Date: 2026-09-06. Status: targeted refactor implemented locally on `feat/mobile-browser-usability`; field INP and authenticated device profiling remain pending.

## Coverage and method

Scanned all 284 application/config/script JS/TS source files discovered by `rg --files`, excluding dependency/build/generated output and test fixtures. A TypeScript AST walk found 554 interaction-related sites across 76 files: JSX `on*` callbacks, form actions, `TabsTrigger` elements, and native event-listener registrations. These are sites, not 554 distinct click handlers: callback forwarding and subscriptions are included. The initial narrower grep found 402 event-handler references outside generated UI primitives. The appendix inventories every file with a detected site.

Traced the handlers into client derivation/rendering, CSV helpers, board persistence, and server/API boundaries. Awaited network/database work was treated as request latency, not automatically as a main-thread freeze. Generated `components/ui` primitives were inspected but not modified. Reviewed the installed Next.js 16.3.3 client/lazy-loading guidance before implementation.

## Findings and implemented refactor

| Priority | Trigger and bottleneck | Refactor and limits |
| --- | --- | --- |
| High, browser-measured | Admin record-tab opening, filtering, sorting and selection rendered every matching row, including every checkbox and inline control. | [DataTable](../../components/admin/data-table.tsx) now renders 50 records per page. Search/filter/sort resets the page; bulk selection and export still span all matching rows. Local filtering/sorting still processes the full loaded dataset. |
| High, code-confirmed | Export synchronously projected all rows, escaped all cells, and joined one giant CSV string inside the click handler. | [CSV export](../../lib/admin/client.ts) accepts an iterable, yields before projection and between slices (256 rows or an 8 ms processing budget), and builds a Blob from chunks. The table shows progress/errors and prevents duplicate exports. A single giant cell, Blob allocation and browser download setup remain synchronous; this is not a worker or a hard per-task latency guarantee. |
| Medium, code-confirmed | Every admin console state change created new table configs, invalidating memoized filtering/sorting even when only a drawer/palette changed. | [AdminConsole](../../components/admin/admin-console.tsx) memoizes configs against cell handlers and finance categories. Rendering is still bounded by the new page size; this does not eliminate all console rerenders. |
| High for dense overlapping data, algorithm-confirmed | Calendar lane assignment searched an ever-growing array of lane endings. With N simultaneous events this did quadratic work, even though only the first few lanes are displayed. | [assignVisibleLanes](../../lib/calendar-lanes.ts) retains distinct lanes only up to the display cap; all higher lanes use the overflow sentinel. Sorting is O(N log N), assignment O(N × visible-lane cap). Tests compare visible order/overflow with the previous algorithm for ties, touching endpoints and lane reuse. Selected-date filtering is memoized and computes day boundaries once. |
| Medium, algorithm-confirmed | Admin palette typing allocated every match and sorted the whole match list before keeping 24 entries. | [findPaletteResults](../../lib/admin/palette-results.ts) uses three bounded stable-ranking buckets; O(N) scan and at most 72 retained candidates. Stops once 24 prefix matches exist and skips searching while closed. Prefix/title/keyword ordering is unchanged. |
| Medium, code-confirmed | Opening/closing a task dialog reran task filtering and rebuilt the board; doc dialog state changes reparsed unchanged Markdown. | [TaskBoard](../../components/tasks/task-board.tsx) memoizes the member subset and column subtree; [MarkdownContent](../../components/docs/markdown-content.tsx) skips unchanged content. Initial tab mounts, changed datasets and changed document content still incur their normal rendering cost. |
| Lower, code-confirmed | Notifications constructed an Intl formatter for each day comparison, twice across two groups, and repeatedly formatted today's date. | [NotificationBell](../../components/chrome/notification-bell.tsx) shares one formatter and computes today's key once per render. Grouping remains bounded by the API's 50-notification limit. |

## Browser evidence

Controlled Chrome run using the isolated Vite component fixture, desktop 1280×800, 4× CPU throttling, 1,000 synthetic admin rows, three columns, three fresh-page samples per version. The same click opened the record table in each run. The baseline table source was read from commit `2d3228c`; the temporary baseline copy was removed after comparison.

The measurement is the maximum Event Timing duration with an interaction ID from that single click, including input/processing/presentation delay. It is **not production INP**, a population percentile, an authenticated AdminConsole benchmark, or real phone evidence. Development fixture overhead and machine/browser conditions affect the absolute values.

| Version | Recorded click durations | Median | Rendered data rows |
| --- | --- | --- | --- |
| Before | 760, 696, 712 ms | 712 ms | 1,000 |
| Refactored | 80, 80, 80 ms | 80 ms | 50 |

[Repeatable workload](../../tests/mobile/performance.pw.ts) now measures the refactored component and attaches timings to the Playwright result. It asserts bounded rendering, page navigation, cross-page selection, 1,000-row CSV contents and filtered selection. There is no fixed timing threshold that would make CI depend on machine load.

## Remaining candidates and follow-up

- **Unbounded list/tab mounts:** task columns, member/finance/penalty pages, admin action queue and some project/meeting lists still render their supplied dataset. Task memoization helps opening details, but does not bound the first All Tasks mount. Finance month grouping and table rendering also repeat during log-form state changes. Profile representative data sizes before choosing shared pagination, server paging or virtualization. Admin table pagination does not reduce server payload size or the O(N)/O(N log N) local filtering/sorting cost.
- **Document Edit/Save and upload:** `collapseDocImages`, `expandDocImages`, JSON serialization and initial Markdown parsing can process embedded base64 images. Unchanged Markdown now skips rerenders, but large changed content still needs profiling; a worker or separately stored image references may be appropriate. PDF/DOCX extraction is performed behind API routes, so its server time alone is not client INP.
- **Board buttons/drag/edit:** `useBoardAutosave` already debounces 1.5 seconds; snapshot JSON serialization still runs on the main thread when the timer fires. Large boards could block a coincident interaction. Preserve snapshot loading/concurrency guarantees if moving this to a worker. React Flow node types are already declared outside render. Test live collaboration/large boards before changing synchronization semantics.
- **Calendar filters:** URL updates call `router.replace`, potentially causing server navigation work; investigate route/network latency separately from layout and rendering. Agenda output and per-day counts still scale with the number of events. The lane refactor removes the quadratic allocation path but does not bound every calendar DOM list.
- **Search/inbox/header/forms:** global search already debounces 150 ms, aborts stale requests and bounds results; inbox polling is visibility-aware with backoff and a 50-record API cap. Most create/edit handlers set busy state, await fetch, then refresh. Keep their pending/error feedback; replacing async fetch with transitions alone would not make server work faster. Native idea-delete confirmation intentionally blocks until answered; that pause is not evidence of slow computation.
- **Production verification:** collect real interaction timing by route/control and profile long tasks on authenticated iOS Safari/Android Chrome and representative admin/board/document datasets. No blanket claim that the whole project now has good INP is supported by this fixture audit.

## Validation

- Unit/component suite: 83 passed; 15 opt-in database integration tests skipped.
- Five new tests cover table pagination/selection/export/filter/sort behavior, CSV scheduling/escaping, palette ranking, and calendar lane equivalence/bounded work.
- Browser suite: eight passed — seven responsive configurations plus one large-table workload. A fresh run with unchanged fixture sources passed after an earlier run lost a dialog during concurrent fixture edits.
- Production build/TypeScript, targeted lint and whitespace checks passed. The workload uses local intersection types for newer Event Timing fields absent from the installed TypeScript DOM declarations.

## Scanned interaction-site inventory

Counts include callback props and listeners; file links point to current source. Server/helper files without interaction sites were still included in the repository scan.

| File | Sites | Detected kinds |
| --- | ---: | --- |
| [components/admin/action-queue.tsx](../../components/admin/action-queue.tsx) | 6 | onCheckedChange, onClick |
| [components/admin/admin-console.tsx](../../components/admin/admin-console.tsx) | 33 | native listener, onAction, onBulkAction, onClick, onClose, onDone, onFilterChange, onOpenChange, onOpenDrawer, onRowClick, onSelect, onSynced |
| [components/admin/audit-log-feed.tsx](../../components/admin/audit-log-feed.tsx) | 1 | onClick |
| [components/admin/broadcast-composer.tsx](../../components/admin/broadcast-composer.tsx) | 10 | onChange, onClick, onOpenChange |
| [components/admin/command-palette.tsx](../../components/admin/command-palette.tsx) | 9 | onChange, onClick, onHover, onKeyDown, onMouseEnter, onOpenChange |
| [components/admin/danger-zone.tsx](../../components/admin/danger-zone.tsx) | 7 | onChange, onClick, onClose |
| [components/admin/data-table.tsx](../../components/admin/data-table.tsx) | 15 | onChange, onCheckedChange, onClick |
| [components/admin/inline-cells.tsx](../../components/admin/inline-cells.tsx) | 10 | onBlur, onChange, onClick, onKeyDown |
| [components/admin/org-settings-panel.tsx](../../components/admin/org-settings-panel.tsx) | 17 | onChange, onClick, onKeyDown, onSave |
| [components/admin/reason-dialog.tsx](../../components/admin/reason-dialog.tsx) | 6 | onChange, onClick, onClose, onOpenChange |
| [components/admin/record-drawer.tsx](../../components/admin/record-drawer.tsx) | 4 | onClick, onClose, onOpenChange |
| [components/admin/stat-cards.tsx](../../components/admin/stat-cards.tsx) | 1 | onClick |
| [components/admin/sync-with-clerk.tsx](../../components/admin/sync-with-clerk.tsx) | 5 | onChange, onClick, onClose, onMerge |
| [components/admin/table-configs.tsx](../../components/admin/table-configs.tsx) | 10 | onCommit |
| [components/admin/view-as-toggle.tsx](../../components/admin/view-as-toggle.tsx) | 1 | onClick |
| [components/board/board-cursors.tsx](../../components/board/board-cursors.tsx) | 2 | onPointerLeave, onPointerMove |
| [components/board/board-error-boundary.tsx](../../components/board/board-error-boundary.tsx) | 1 | onClick |
| [components/board/board-save-status.tsx](../../components/board/board-save-status.tsx) | 1 | onClick |
| [components/calendar/calendar-filters.tsx](../../components/calendar/calendar-filters.tsx) | 5 | onChange, onClick |
| [components/calendar/calendar-view.tsx](../../components/calendar/calendar-view.tsx) | 12 | onChange, onClick, onClose |
| [components/calendar/event-detail-dialog.tsx](../../components/calendar/event-detail-dialog.tsx) | 7 | action, onChange, onClick, onOpenChange |
| [components/calendar/new-event-dialog.tsx](../../components/calendar/new-event-dialog.tsx) | 7 | action, onChange, onClick, onOpenChange |
| [components/chrome/app-dock.tsx](../../components/chrome/app-dock.tsx) | 2 | onClick, onOpenChange |
| [components/chrome/app-header.tsx](../../components/chrome/app-header.tsx) | 19 | native listener, onClick, onClose, onCreate, onOpenChange |
| [components/chrome/browser-viewport.tsx](../../components/chrome/browser-viewport.tsx) | 5 | native listener |
| [components/chrome/dev-user-button.tsx](../../components/chrome/dev-user-button.tsx) | 1 | onClick |
| [components/chrome/header-create.tsx](../../components/chrome/header-create.tsx) | 9 | onChange, onClick, onOpenChange, onSubmit |
| [components/chrome/notification-bell.tsx](../../components/chrome/notification-bell.tsx) | 10 | native listener, onClick, onOpenChange |
| [components/chrome/notification-preferences.tsx](../../components/chrome/notification-preferences.tsx) | 3 | onChange, onOpenChange |
| [components/chrome/record-actions.tsx](../../components/chrome/record-actions.tsx) | 13 | onChange, onClick, onSubmit |
| [components/chrome/search-palette.tsx](../../components/chrome/search-palette.tsx) | 6 | onChange, onClick, onKeyDown, onMouseMove, onOpenChange |
| [components/dashboard/dashboard-tabs.tsx](../../components/dashboard/dashboard-tabs.tsx) | 2 | TabsTrigger |
| [components/dashboard/my-dashboard-panel.tsx](../../components/dashboard/my-dashboard-panel.tsx) | 4 | onCreateTask, onLogExpense, onOpenKindChange |
| [components/dashboard/my/my-money-card.tsx](../../components/dashboard/my/my-money-card.tsx) | 1 | onClick |
| [components/dashboard/my/my-penalties-card.tsx](../../components/dashboard/my/my-penalties-card.tsx) | 11 | onChange, onClick, onClose, onOpenChange, onSubmit |
| [components/dashboard/my/my-projects-card.tsx](../../components/dashboard/my/my-projects-card.tsx) | 1 | action |
| [components/dashboard/my/my-tasks-card.tsx](../../components/dashboard/my/my-tasks-card.tsx) | 4 | action, onCheckedChange, onClick |
| [components/dashboard/my/needs-you-today.tsx](../../components/dashboard/my/needs-you-today.tsx) | 1 | onClick |
| [components/dashboard/my/quick-capture.tsx](../../components/dashboard/my/quick-capture.tsx) | 22 | onChange, onClick, onClose, onOpenChange |
| [components/dashboard/my/upcoming-card.tsx](../../components/dashboard/my/upcoming-card.tsx) | 3 | action, onClick |
| [components/dashboard/team/activity-feed-card.tsx](../../components/dashboard/team/activity-feed-card.tsx) | 3 | action, onClick |
| [components/dashboard/team/announcements-strip.tsx](../../components/dashboard/team/announcements-strip.tsx) | 1 | onClick |
| [components/dashboard/team/ideas-card.tsx](../../components/dashboard/team/ideas-card.tsx) | 2 | action, onClick |
| [components/dashboard/team/team-projects-card.tsx](../../components/dashboard/team/team-projects-card.tsx) | 1 | action |
| [components/dashboard/team/team-pulse.tsx](../../components/dashboard/team/team-pulse.tsx) | 1 | onClick |
| [components/docs/doc-detail.tsx](../../components/docs/doc-detail.tsx) | 13 | onChange, onClick, onOpenChange, onPick |
| [components/docs/drive-file-picker.tsx](../../components/docs/drive-file-picker.tsx) | 1 | onClick |
| [components/docs/import-from-drive-button.tsx](../../components/docs/import-from-drive-button.tsx) | 1 | onPick |
| [components/docs/new-doc-dialog.tsx](../../components/docs/new-doc-dialog.tsx) | 9 | onChange, onClick, onOpenChange |
| [components/finance/finance-transactions-table.tsx](../../components/finance/finance-transactions-table.tsx) | 9 | action, onChange, onClick, onOpenChange, onValueChange |
| [components/finance/receipt-file-input.tsx](../../components/finance/receipt-file-input.tsx) | 2 | onChange, onClick |
| [components/ideas/idea-node.tsx](../../components/ideas/idea-node.tsx) | 11 | onBlur, onChange, onClick, onDoubleClick, onKeyDown, onOpenChange, onSubmit |
| [components/ideas/ideas-canvas.tsx](../../components/ideas/ideas-canvas.tsx) | 6 | onClick, onNodesChange, onRetryLoad |
| [components/meetings/meeting-detail.tsx](../../components/meetings/meeting-detail.tsx) | 17 | onChange, onClick, onOpenChange |
| [components/meetings/meeting-form-dialog.tsx](../../components/meetings/meeting-form-dialog.tsx) | 18 | onAdd, onChange, onClick, onOpenChange, onRemove |
| [components/meetings/meetings-list.tsx](../../components/meetings/meetings-list.tsx) | 2 | TabsTrigger |
| [components/members/member-directory-table.tsx](../../components/members/member-directory-table.tsx) | 15 | onCheckedChange, onClick, onOpenChange |
| [components/penalties/penalties-view.tsx](../../components/penalties/penalties-view.tsx) | 15 | TabsTrigger, onChange, onClick, onDecided, onOpenChange, onValueChange |
| [components/projects/admin-projects-view.tsx](../../components/projects/admin-projects-view.tsx) | 2 | onClick |
| [components/projects/manage-collaborators-dialog.tsx](../../components/projects/manage-collaborators-dialog.tsx) | 5 | onChange, onClick, onOpenChange |
| [components/projects/new-project-dialog.tsx](../../components/projects/new-project-dialog.tsx) | 18 | onChange, onCheckedChange, onClick, onOpenChange, onValueChange |
| [components/projects/project-detail.tsx](../../components/projects/project-detail.tsx) | 18 | TabsTrigger, onChange, onClick, onOpenChange, onValueChange |
| [components/projects/projects-list.tsx](../../components/projects/projects-list.tsx) | 2 | TabsTrigger |
| [components/roadmap/milestone-edit-dialog.tsx](../../components/roadmap/milestone-edit-dialog.tsx) | 9 | onChange, onClick, onOpenChange, onSelect, onValueChange |
| [components/roadmap/milestone-node.tsx](../../components/roadmap/milestone-node.tsx) | 1 | onClick |
| [components/roadmap/roadmap-canvas.tsx](../../components/roadmap/roadmap-canvas.tsx) | 17 | onClick, onConnect, onDelete, onEdgesChange, onNodeDoubleClick, onNodesChange, onOpenChange, onRemove, onRetryLoad |
| [components/roadmap/roadmap-connections.tsx](../../components/roadmap/roadmap-connections.tsx) | 5 | onChange, onClick, onOpenChange, onSubmit |
| [components/shared/back-button.tsx](../../components/shared/back-button.tsx) | 1 | onClick |
| [components/shared/date-time-picker.tsx](../../components/shared/date-time-picker.tsx) | 10 | onClick, onOpenChange, onValueChange |
| [components/shared/filter-multi-select.tsx](../../components/shared/filter-multi-select.tsx) | 2 | onCheckedChange, onOpenChange |
| [components/shared/time-of-day-select.tsx](../../components/shared/time-of-day-select.tsx) | 3 | onValueChange |
| [components/tasks/document-multi-select.tsx](../../components/tasks/document-multi-select.tsx) | 4 | onChange, onCheckedChange, onClick, onOpenChange |
| [components/tasks/new-task-dialog.tsx](../../components/tasks/new-task-dialog.tsx) | 15 | action, onChange, onCheckedChange, onClick, onOpenChange, onValueChange |
| [components/tasks/task-board.tsx](../../components/tasks/task-board.tsx) | 8 | TabsTrigger, onClick, onClose, onKeyDown, onOpen, onOpenTask |
| [components/tasks/task-detail-dialog.tsx](../../components/tasks/task-detail-dialog.tsx) | 17 | onChange, onCheckedChange, onClick, onOpenChange, onValueChange |
| [components/ui/toast.tsx](../../components/ui/toast.tsx) | 3 | onClick, onDismiss |
