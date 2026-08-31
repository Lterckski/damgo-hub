# Dashboard Home

## Goal

Build the `/dashboard` landing screen members see after sign-in. Use mock data only — this gets wired to real data in `22-dashboard-data-wiring.md` once the feature APIs below exist.

## Layout

Reuse `AppShell` from `02-app-chrome.md`. Do not modify the navbar or dock behavior.

Above the grid, a short heading: `Welcome back, {member.displayName}` with a one-line subtitle. Below the heading, a two-item shadcn `Tabs` control switches the page between two views — **My Dashboard** (default) and **Team Overview**. This needs client interactivity, so it's a small `DashboardTabs` client component that receives both views' mock data as props from the server page and toggles which panel renders; it holds no data-fetching logic itself.

### My Dashboard tab

A responsive grid of shadcn `Card` widgets, scoped to the current member:

- **My Tasks** — short list of tasks assigned to the current member, with status badges; "View all" link to `/tasks`
- **Upcoming** — next few calendar events / meetings; "View calendar" link to `/calendar`
- **Financial Snapshot** — current balance + this month's income/expense totals; "View finance" link to `/finance`
- **Recent Ideas** — latest few posts from the ideas board; "Open ideas board" link to `/ideas`

### Team Overview tab

A second grid, scoped to the whole team — the "who's doing what, and what does everyone need to know" view:

- **Tasks by Member** — every member listed with their currently assigned tasks and status badges underneath (a stacked list per member, not a flat table — the point is seeing coverage at a glance). Members with zero assigned tasks still appear, so gaps are visible rather than silently absent. "View all" link to `/tasks`.
- **Team Task Summary** — a small stat row counting tasks across the whole team by status (e.g. Not Started / In Progress / Done / Blocked), so the team's overall progress reads in one glance without opening `/tasks`.
- **Team Upcoming** — the next several calendar events / meetings across the whole team (not filtered to the current member); "View calendar" link to `/calendar`.
- **Role Coverage** — each functional role and work-distribution role tag from `05-member-directory.md`, with the member(s) currently holding it; makes it obvious if a role has nobody assigned. "View members" link to `/members`.

Each widget in both tabs has its own empty state (icon + short message) for when there's no data.

Every widget uses the shared `DashboardWidget` shell (`components/dashboard/dashboard-widget.tsx`), not a bare `Card`/`CardTitle` — see `ui-context.md`'s Cards/widgets and Section labels notes for why (contrast and visual identity, not just styling taste).

## Implementation

Use mock/placeholder data shaped like the eventual API responses for each widget (tasks, calendar events, finance summary, ideas, member/role data) so wiring real data later is a drop-in replacement, not a rewrite. Team Overview's mock data should include all seeded team members from `context/team-roster.md` so the "who's doing what" view looks realistic, not like a single-user fixture.

Keep the dashboard page itself a server component that prepares both tabs' mock data; only the tab switcher (`DashboardTabs`) is a client component. Individual widgets can be server components since they're static/mock for now — pass their data down as props rather than making them fetch independently.

## Check When Done

- `/dashboard` renders the tab control, defaulting to My Dashboard
- My Dashboard tab renders all four member-scoped widgets with mock data and empty states
- Team Overview tab renders all four team-scoped widgets, including every seeded member in Tasks by Member (even ones with no tasks) and every role tag in Role Coverage
- switching tabs doesn't trigger a page navigation or full reload
- layout is responsive (each tab's grid collapses to a single column on small screens)
- no TypeScript or lint errors
- all colors resolve to tokens from `context/ui-context.md`
