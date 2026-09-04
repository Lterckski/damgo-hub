# Damgo Hub

Our shared workspace for the team — project proposals, tasks, finances, docs, and calendar all in one place. Built with Claude Code, spec by spec.

## Working with Claude Code on this project

We're not just freestyling prompts — everything we build follows written specs in `context/`, so the app stays consistent even with different people prompting it on different days. Here's the routine:

1. **Check `context/progress-tracker.md` first.** It says what's done, what's in progress, and what's next. Always start here so you don't duplicate work or build the wrong thing.
2. **Pick a unit from `context/feature-specs/`.** They're numbered in build order (`01-design-system.md`, `02-app-chrome.md`, etc.). Just tell Claude which one to build next — e.g. "build 12-liveblocks-setup.md" — you don't need to paste the file's contents in, Claude reads it itself.
3. **If you're fixing a bug or tweaking something instead of building something new**, just describe the problem normally (screenshots help a lot). You don't need to reference a spec file for that.
4. **Let it finish one thing at a time.** Don't stack five unrelated requests in one message if you can help it — smaller changes are easier for all of us to review and easier for Claude to get right.
5. **When it's done, `progress-tracker.md` should reflect it.** If Claude finishes a unit and doesn't update that file, ask it to.
6. **If a spec is vague or missing something**, Claude will usually ask you directly, or write it down as an open question in `progress-tracker.md` instead of just guessing. If you're the one answering, that answer becomes the new source of truth — future prompts (yours or anyone else's) should follow it.

Basically: `progress-tracker.md` tells you where we are, `feature-specs/` tells you what's next, and you just point Claude at it.

## What's built so far

- **Sign-in & roles** — Google/Clerk sign-in, with Leader / Assistant Leader / Member roles. Only the Leader and Assistant Leader get admin powers (managing members, approving money, creating calendar events, etc).
- **Member Tracker** — the team roster: everyone's role, status, and what they're tagged for (Pitching, Documents, Creatives, etc). Admins can edit tags, deactivate, or fully remove a member.
- **Dashboard** — lands you on your own tasks, what's coming up, the team's money snapshot, and (once it exists) recent ideas. There's also a Team Overview tab showing who's doing what across the whole team.
- **Financial Tracker** — logging income/expenses (admin-only for now), receipt uploads, and an approve/reject flow so nothing posts without a second set of eyes.
- **Tasks** — create, assign, and track tasks with a type, a priority (Low/Medium/High), a status board, start/due dates, and who assigned it to whom. Regular members can only assign tasks to themselves — only admins can hand tasks to other people.
- **Documentation** — write pages, upload a PDF/Word doc and it pulls the text in automatically, or link a Google Doc/Sheet/Slide and edit it live right inside Damgo Hub.
- **Calendar** — a shared month view of events and task due dates, with priority and who's assigned shown right in the list.
- **Project Proposals** — pitch a project, assign a Team Lead and collaborators, track status/priority/category/budget, and link supporting docs and reference links.

## What's still coming

These are written as specs but not built yet — same numbering as `context/feature-specs/`:

- **Collaborative board follow-ups** — add persistence to the existing project roadmap and build the open ideas board with the same real-time collaboration tools.
- **Meeting planning** — scheduling meetings, inviting participants by email, linking an external meeting service or location, and preparing an ordered agenda ahead of time.
- **Penalty tracker** — logging penalties issued to members, tied into the financial ledger.
- **Admin dashboard** — a dedicated oversight area beyond what's already on the Member Tracker.
- **Scheduled reminders** — automatic nudges for due dates and upcoming events.

## Tech stack — what each piece is actually for

| Technology | What it does for us |
|---|---|
| **Next.js** | The framework the whole app is built on — handles pages, routing, and talking to our database, all in one place. |
| **React** | What actually draws the UI (buttons, forms, dialogs) and keeps it updating live as data changes. |
| **TypeScript** | JavaScript with type-checking — catches a lot of bugs before we even run the app. |
| **Tailwind CSS** | How we style everything — no separate CSS files, styling happens right in the component. |
| **Base UI + shadcn** | Pre-built, accessible UI pieces (dropdowns, dialogs, buttons) we style to match our own look instead of building every widget from scratch. |
| **Clerk** | Handles sign-in and who's allowed to do what (Leader/Assistant Leader/Member roles), so we're not rolling our own auth system. |
| **Prisma + Postgres** | Our database and the tool that talks to it. Postgres stores everything (members, tasks, docs, money); Prisma is how the app reads/writes it safely. |
| **Vercel** | Where the live site is actually hosted — every push to `main` deploys automatically. |
| **Vercel Blob** | Storage for uploaded files — receipts, doc attachments — kept private, not public links. |
| **Google Drive / Picker API** | Lets us link a Google Doc/Sheet/Slide to a Damgo Hub page and edit it live, right inside the app. |
| **Google Calendar API + Trigger.dev** | Syncs tasks/events to each member's own Google Calendar in the background, without slowing down the app itself. |
| **date-fns** | Handles date/time formatting and math (e.g. "due in 3 days") consistently across the app. |
| **react-markdown** | Renders written documentation pages as nicely formatted text instead of raw Markdown. |
| **mammoth / pdf-parse / turndown** | Pulls readable text out of uploaded Word docs and PDFs when you attach one to a Documentation page. |

## Running it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll need a `.env` file with the real keys (database, Clerk, Google, etc.) — ask Luther for those, they're not committed to the repo for obvious reasons.
