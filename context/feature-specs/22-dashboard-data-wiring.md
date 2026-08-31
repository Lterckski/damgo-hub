Wire the dashboard home (`06-dashboard-home.md`) to real data now that every widget's backing feature exists.

## Implementation

Convert each widget from mock data to a server-side fetch, using the same shapes the mock data already matched:

- **My Tasks** — `GET /api/tasks?assignee=me` (`08-task-assignment.md`), most urgent first (nearest due date), capped to a handful of items
- **Upcoming** — `GET /api/calendar/events` (`10-calendar.md`) for the next 7 days, now including meetings from `16-meeting-scheduling.md` per that route's merge logic
- **Financial Snapshot** — `GET /api/finance/summary` (`07-financial-tracker.md`)
- **Recent Ideas** — latest few idea nodes from the ideas board's saved snapshot (`19-ideas-board.md`); if reading directly from the live board state is impractical server-side, read from the last autosaved snapshot instead

Fetch all widget data server-side in `app/(app)/dashboard/page.tsx` — no client-side fetching for the initial load. Preserve each widget's existing empty state for when a member has no data yet (no tasks assigned, no upcoming items, zero balance, no ideas posted).

## Check When Done

- all four dashboard widgets show real data for the signed-in member
- empty states still render correctly when a widget has nothing to show
- no client-side loading spinners on first paint — data is fetched server-side
- `npm run build` passes
