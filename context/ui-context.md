# UI Context

## Brand

`public/brand/logo.jpeg` is the Damgo Hub mark — a blue "D" with a rocket streaking off it. Use the actual logo image (not a text wordmark) anywhere the brand appears at app-chrome scale — the header and the auth pages — sized to stay legible at both; a plain text "Damgo Hub" wordmark is fine in body copy or metadata where an image isn't practical. The app theme below is navy + teal, not the logo's own plum — a deliberate choice, not a mismatch; the mark still reads fine against navy since its blue and the theme's teal sit close on the wheel.

## Theme

Damgo Hub supports both light and dark mode, following the member's system preference by default, with a persisted System/Light/Dark override in the account menu. Dark mode is a deep navy — not a harsh black, but a real dark app background with depth — and is the mode this theme was designed around, in the spirit of a polished dark SaaS product: soft glow on the brand accent, elevated surfaces that read as genuinely lifted (shadow, not just a lighter fill). Light mode inverts it to a cool off-white with the same teal accent, deepened for contrast. Buttons keep shadcn's default radius scale (`components/ui/button.tsx` is generated and isn't hand-edited, per `code-standards.md`) rather than the pill shape the reference screenshot uses.

All colors are defined as CSS custom properties in `globals.css`, with the light values on `:root` and dark overrides under `@media (prefers-color-scheme: dark)` when no light override is selected, plus explicit `data-theme="dark"` overrides, mapped to Tailwind tokens via `@theme inline`. Components must use these tokens — no hardcoded hex values or raw Tailwind color classes like `zinc-*` or `sky-*`.

### Light Mode (Cool off-white)

| Role             | CSS Variable           | Hex / Value                |
| ---------------- | ----------------------- | --------------------------- |
| Page background  | `--bg-base`             | `#F5F7FB`                   |
| Surface          | `--bg-surface`          | `#FFFFFF`                   |
| Elevated surface | `--bg-elevated`         | `#FFFFFF`                   |
| Subtle surface   | `--bg-subtle`           | `#E9EDF5`                   |
| Default border   | `--border-default`      | `#D7DEEA`                   |
| Subtle border    | `--border-subtle`       | `#E3E8F1`                   |
| Primary text     | `--text-primary`        | `#0F172A`                   |
| Secondary text   | `--text-secondary`      | `#3F4C63`                   |
| Muted text       | `--text-muted`          | `#64748B`                   |
| Faint text       | `--text-faint`          | `#9AA6BC`                   |
| Brand accent     | `--accent-primary`      | `#0F9488` (teal, deepened) |
| Brand dim        | `--accent-primary-dim`  | `rgba(15, 148, 136, 0.12)`  |
| Collab accent    | `--accent-collab`       | `#3E6FA3` (blue — the logo's blue, now the secondary accent) |
| Collab text      | `--accent-collab-text`  | `#2C557F`                   |
| Error            | `--state-error`         | `#C0392E`                   |
| Success          | `--state-success`       | `#2F8F5B`                   |
| Warning          | `--state-warning`       | `#A97417`                   |

### Dark Mode (Deep navy)

| Role             | CSS Variable           | Hex / Value                |
| ---------------- | ----------------------- | --------------------------- |
| Page background  | `--bg-base`             | `#0B0F1A`                   |
| Surface          | `--bg-surface`          | `#121A2B`                   |
| Elevated surface | `--bg-elevated`         | `#182238`                   |
| Subtle surface   | `--bg-subtle`           | `#1E293B`                   |
| Default border   | `--border-default`      | `#2A3650`                   |
| Subtle border    | `--border-subtle`       | `#1C2740`                   |
| Primary text     | `--text-primary`        | `#F3F6FB`                   |
| Secondary text   | `--text-secondary`      | `#B4C0D4`                   |
| Muted text       | `--text-muted`          | `#8592AC`                   |
| Faint text       | `--text-faint`          | `#55617C`                   |
| Brand accent     | `--accent-primary`      | `#45D9C5` (teal)            |
| Brand dim        | `--accent-primary-dim`  | `rgba(69, 217, 197, 0.16)`  |
| Collab accent    | `--accent-collab`       | `#5A8DC4` (blue — the logo's blue) |
| Collab text      | `--accent-collab-text`  | `#8FB4DE`                   |
| Error            | `--state-error`         | `#F0655C`                   |
| Success          | `--state-success`       | `#52C77D`                   |
| Warning          | `--state-warning`       | `#E8B84B`                   |

Teal is the hero accent — used deliberately, not everywhere (primary buttons, active states, focus rings, small emphasis details), the way the reference SaaS look uses it: a glowing dot, an active underline, a button glow. Don't reach for it as a general-purpose highlight color; that's what `bg-subtle`/`bg-accent-dim` are for.

**Contrast rule**: `text-copy-primary` (near-white on dark, near-black on light) is the default for anything a member needs to actually read — section headers, card titles, table headers, form labels, task/list item titles. `text-copy-secondary` is for genuinely secondary detail (a due date under a title, a subtitle under a heading) — never for a heading or a form label itself. `text-copy-muted`/`text-copy-faint` are for the least important text on a screen (placeholder-like hints, timestamps nobody needs to scan) — reach for them rarely, and never on their own for anything load-bearing. Several of shadcn's own generated components default to a muted or partial-opacity color for titles/labels/inactive-tab text (`CardTitle`, `TabsTrigger`'s inactive state); since those files aren't hand-edited (`code-standards.md`), override the color at the usage site via `className` (`cn()`/`tailwind-merge` makes the override win) rather than leaving the dim default in place on anything that reads as a heading or label. `Input` and `Textarea` go further — they set no text color at all (just `color: inherit`), which in practice reads inconsistently depending on what wraps them; every `Input`/`Textarea` usage should pass `className="text-copy-primary!"` (the trailing `!` is Tailwind v4's important modifier) rather than rely on inheritance — use the forced variant here specifically, since this exact gap has now shown up more than once. A native `<input type="file">`'s own "No file chosen" text is a separate, unfixable case: Chrome and Safari render it through their own UA shadow root, which ignores author `color` entirely — no class, however forceful, can touch it. Don't attempt to style it; hide the native control and build a custom trigger + filename display instead, as `components/finance/receipt-file-input.tsx` does.

**Date/time input**: don't use a bare native `<input type="date"/"datetime-local">` for anything a member fills in — its built-in picker puts a "Today" shortcut immediately next to the calendar grid, and it's easy to hit by mistake thinking it confirms the day you actually clicked (it doesn't; it silently jumps to today instead). That picker is native browser chrome, unfixable the same way the file input's label text is. Use `components/shared/date-time-picker.tsx` instead everywhere a date or date+time is collected — a custom Dialog-based picker (month grid built the same way as `calendar-view.tsx`) with an explicit **Select** button, so nothing commits without the member deliberately confirming it. The time portion (when `includeTime` is on, the default) is three dropdown `Select`s — hour (1–12), minute (5-minute steps), AM/PM — not a native `<input type="time">`; keep it that way rather than mixing a native control back in, so the whole picker behaves consistently.

Tailwind utility names map to these variables. Use `bg-base`, `bg-surface`, `bg-elevated`, `bg-subtle`, `text-copy-primary`, `text-copy-secondary`, `text-copy-muted`, `text-copy-faint`, `border-surface-border`, `text-brand`, `bg-accent-dim`, `text-collab`, etc.

## Typography

| Role              | Font             | CSS Variable          |
| ------------------ | ---------------- | ----------------------- |
| UI text            | Geist Sans       | `--font-geist-sans`    |
| Code/mono          | Geist Mono       | `--font-geist-mono`    |
| Display / headings | Playfair Display | `--font-display`       |

Geist Sans and Geist Mono are loaded via `next/font/google` and applied as CSS variables on the `<html>` element; the base `body` uses Geist Sans with `antialiased`. Playfair Display (also `next/font/google`) is a serif used only for large page-level headings (an `h1` like "Dashboard" or "Member Tracker") — the editorial-serif-over-dark-navy look from the reference design. Don't use it for UI chrome, labels, table content, or anything below heading scale; Geist Sans handles everything else.

**Section labels** — the small headers inside a widget or card (a dashboard widget's "MY TASKS", a task board column's "TO DO"), as opposed to page-level `h1`s — use a distinct "eyebrow" treatment instead of shadcn's default muted `CardTitle`: Geist Sans, `text-xs`, `font-bold`, `uppercase`, `tracking-[0.06em]` to `tracking-[0.08em]`, in `text-copy-primary` (never a muted tone — see the Contrast rule above), usually paired with a small icon in a `bg-accent-dim`/`text-brand` chip. This is what makes a box read as a distinct, deliberate surface instead of a flat gray card. See `components/dashboard/dashboard-widget.tsx` for the reference implementation; reuse that component (or its pattern) rather than composing `Card`/`CardTitle` directly for any new dashboard-style widget.

## Border Radius

Radius increases with surface depth — smaller for inner elements, larger for outer containers.

| Context           | Class          |
| ------------------ | --------------- |
| Inline / small UI  | `rounded-xl`    |
| Cards / panels     | `rounded-2xl`   |
| Modal / overlay    | `rounded-3xl`   |
| Dock (bottom nav)  | `rounded-full` (pill) — the one deliberate exception, it's a floating taskbar, not a form control |

## Collaborative Boards

Liveblocks + React Flow power two surfaces: the project roadmap and the ideas board. Both share the same node/edge canvas styling. Meeting agendas use ordinary ordered page content, not a canvas.

### Node Color Palette

8 defined color pairs, each tuned for readability against both the light off-white and dark navy canvas backgrounds. Defined in `types/canvas.ts` as `NODE_COLORS`. Values below are the dark-mode fills/text; light-mode equivalents use the same hues at lower saturation and higher lightness for the fill, with a darker text color for contrast.

| Node fill (dark) | Text color (dark) | Character              |
| ----------------- | ------------------ | ------------------------ |
| `#182238`         | `#F3F6FB`           | Neutral (default)        |
| `#173248`         | `#45D9C5`           | Teal (brand)              |
| `#1B2A45`         | `#7FB0E0`           | Blue                     |
| `#2E2545`         | `#B79CE0`           | Purple                   |
| `#332912`         | `#E8B84B`           | Amber                    |
| `#331E1C`         | `#F0655C`           | Red                      |
| `#301E30`         | `#D888AC`           | Rose                     |
| `#16301F`         | `#52C77D`           | Green                    |

Default node color: `#182238` fill with `#F3F6FB` text (dark mode) — the same tone as `--bg-elevated`; use the corresponding light-mode fill/text pair from the same hue family.

### Edge Style

Smooth-step path with an arrow marker. Edge color follows `--text-faint` in the active theme. Stroke width is thin — edges are visually secondary to nodes.

### Node Shapes

6 supported shapes, defined in `types/canvas.ts` as `NODE_SHAPES`. Complex shapes (diamond, hexagon, cylinder) are rendered as inline SVGs rather than CSS borders.

- `rectangle` — default general-purpose node
- `diamond` — decision point (e.g. a milestone gate)
- `circle` — event / marker
- `pill` — task / action item
- `cylinder` — reference / stored item
- `hexagon` — external dependency / boundary

### Connection Handles

Small circular handles matching `--border-default`, hidden by default, revealed on node hover. Appear at all four sides of a node.

### Canvas Background

React Flow `<Background>` component. Canvas sits on the theme's base background color.

## Component Library

shadcn/ui on top of Tailwind. No custom design system. Components live in `components/ui/`. Use the `shadcn` CLI to add new components rather than writing them from scratch.

## Mobile Browser Requirements

Mobile-browser usability is mandatory across the entire app, including admin screens and collaborative boards. These requirements extend older desktop-oriented feature specs; existing hover-only and fixed-column descriptions are not exemptions.

- **Viewport and reflow:** support phone widths from 320 CSS pixels upward, portrait and landscape, plus tablet and desktop. Text, controls, and dialogs must remain readable and reachable without page-level horizontal overflow. Wide tables and canvases may scroll or pan within clearly bounded regions; keep their essential actions available.
- **Touch interaction:** provide explicit tap controls for navigation, edit, delete, connections, and other essential actions. Hover, double-click, drag gestures, and keyboard shortcuts may enhance an interaction but cannot be its only entry point. Aim for at least 44 × 44 CSS pixel touch targets for primary controls, with enough spacing to avoid accidental taps. Preserve keyboard access and visible focus indicators.
- **Navigation:** keep every permitted destination reachable on touch devices. The desktop dock may retain hover/focus reveal; mobile must provide a discoverable tap-to-open control or visible navigation, with accessible destination names. Fit navigation within the viewport and device safe area.
- **Forms and overlays:** stack fields when columns become cramped. Menus, dialogs, drawers, date pickers, and their submit/cancel controls must fit the available viewport and remain usable with the on-screen keyboard open. Preserve labels, errors, entered values, focus management, and dismissal behavior.
- **Screen edges and browser chrome:** account for safe-area insets, changing browser toolbar height, rotation, and the on-screen keyboard. Fixed headers, docks, overlays, and canvas controls must not obscure content or actions. Preserve browser zoom.
- **Dense content and boards:** adapt tables, calendar views, and toolbars so reading and actions remain practical on phones. Board panning, zooming, selection, editing, and connection actions need usable touch behavior or equivalent explicit controls; shrinking a desktop canvas alone does not satisfy the requirement.
- **Visual consistency:** preserve the established theme, typography, and desktop behavior while adapting the layout. Hiding an essential action at a small breakpoint is not a mobile solution.

Implemented foundations: `BrowserViewport` exposes the visible viewport height/offset for the app shell and overlays while preserving pinch zoom; `app/globals.css` supplies safe-area bounds and coarse-pointer target sizing. Changes live at application usage sites, not inside generated primitives. Phone calendars default to Agenda with a Month toggle and a selected-date list. Board edit buttons, idea dialogs and the Connections form provide explicit touch alternatives. These changes still require authenticated real-device QA.

Verify with the [mobile browser workflow](ai-workflow-rules.md#mobile-browser-verification). Known gaps and unverified behavior are tracked in [mobile browser issues](current-issues/current-issues-mobile-browser.md); this section defines requirements, not completed implementation.

## Layout Patterns

- **App shell**: header pinned to the top; primary navigation is a floating dock pinned to the **bottom** of the viewport, not a side sidebar — see Bottom Dock below. Content fills the space between them, full width. The header/dock stay fixed and only the content between them scrolls (`AppShell`'s `<main>` is `overflow-y-auto`) — this requires an unbroken **fixed-height chain** from `<html>` down: `html`/`body` (`app/layout.tsx`) both need `h-full`, not `min-h-full` — a *minimum* lets `body` grow past the viewport to fit tall content, which breaks containment at the very top and makes the whole page scroll instead of just `main`, dragging the header along with it. Confirmed as a real bug, not a theoretical one — took a `min-h-0` fix on `main` itself (correct, but insufficient) before this `body` fix actually resolved it. Any future full-viewport-height layout needs this same unbroken chain, not just a `min-h-screen` on its own outermost div.
- **Header**: `AppHeader` in the protected app layout provides logo, Clerk org switcher, centered desktop search with Cmd/Ctrl+K hint, quick create, bell, role and Clerk account menu. Mobile shows logo/search/bell/avatar, with remaining utilities in the account menu. Stable count/avatar placeholders, accessible palette focus behavior, live unread count and a scrolled treatment observe the existing `main` container. See [unit 23](feature-specs/23-global-search-notifications-header.md).
- **Theme control**: persisted System/Light/Dark in the account menu. System remains the default; `damgo_theme` is read in the server root layout and applied as `data-theme`, with explicit light/dark token overrides. Keep the existing navy/teal palette and serif headings.
- **Bottom dock**: a floating, centered pill-shaped bar (`bg-elevated`, `border-default`, `rounded-full`, soft shadow) holding one icon per nav destination (Dashboard, Projects, Tasks, Finance, Documentation, Calendar, Meetings, Penalties, Members, Ideas), plus Admin when the member is an admin, visually separated from the rest by a thin divider. Desktop dock icons have hover labels. On phones and coarse-pointer devices, a visible Navigate button opens a dialog with labeled destinations. Hovering an icon reveals its label in a small tooltip above it; the active route's icon is visually distinguished (accent-colored, not just a background tint). **Desktop, collapsed by default**: only a small handle (a short pill, `bg-copy-faint/60`) sits at the very bottom edge of the viewport; the dock itself slides up and fades in when the pointer nears the bottom of the screen (the whole bottom strip is the hover zone, not just the handle) and slides back down on mouse-out, so it doesn't compete with page content when not in use. Keyboard focus (tabbing to a nav item) reveals it the same way, via `focus-within`, so it supports desktop keyboard navigation. The touch menu is an additional path independent of hover.
- **Collaborative board workspace**: full-viewport layout — floating sidebar overlay on the left, center canvas, slide-over detail panel on the right. (This is a distinct, canvas-specific chrome, not the app shell above — it still uses a side overlay because the canvas itself needs the full vertical space the bottom dock would eat into.)
- Modals and dialogs: centered overlay, `rounded-3xl`, surface background with backdrop blur. `DialogTitle` gets an explicit `text-lg font-bold text-copy-primary` at the usage site (its generated default is a smaller, unweighted `font-medium`, too quiet for a dialog's own heading) and form field labels use the same eyebrow style as widget headers (`text-xs font-bold uppercase tracking-wide text-copy-primary`), not `text-copy-secondary` — a label is not secondary text.
- **Cards / widgets**: never bare `Card` + shadcn's default `CardTitle`. Give every card a `text-brand`-to-`text-collab` gradient top accent bar, a small icon chip (`bg-accent-dim`, `text-brand`), a hover state (`hover:shadow-md hover:ring-brand/40`, `transition-all`), and drop the default `ring-foreground/10` in favor of `ring-surface-border`. See `components/dashboard/dashboard-widget.tsx`. A task/board item card instead gets a colored left accent strip matching its status (see `components/tasks/task-board.tsx`'s `STATUS_ACCENT`) rather than a top bar, since it doesn't have a fixed identity the way a dashboard widget does.
- Tables (finance ledger, task list, penalty list, member roster): use `bg-surface` rows on `bg-base`, with `border-subtle` row dividers. `TableHead` (column headers) keep the generated `text-foreground` default — that one's already high-contrast.

## Icons

Lucide React. Stroke-based icons only — no filled variants. Icon sizes: `h-4 w-4` for inline, `h-5 w-5` for buttons and dock icons, `h-8 w-8` for feature icons in empty states.

## Admin record pagination

The shared admin record table displays 50 records per page with labeled Previous/Next controls and a visible range/total. Search, filter and sorting changes return to page one. “Select all matching rows,” bulk actions and CSV export span the filtered dataset across pages. Export shows a busy state and an error if generation fails. These controls retain the mobile touch-target and wrapping requirements above.

## Single-activation action buttons

Requirement recorded 2026-09-07. Every control that performs an action — submitting a form, saving an inline edit, approving or rejecting, deleting, uploading, exporting, marking read, voting, adding a row — produces exactly one effect per deliberate activation. This is a project-wide requirement covering existing screens as well as new ones, not a per-dialog fix, and it applies to any element that triggers the action (button, menu item, icon control, or a form's implicit Enter submit).

- **One effect per intent.** A double-click, a fast repeated tap, a held Enter on a focused control, or a second click while the first request is still in flight must not create a second record, send a second email, apply a second approval, or start a second export.
- **Guard synchronously.** The guard must be set and read in the same synchronous turn as the event, before any `await` — a `disabled` prop driven by React state does not reach the DOM until the next commit, and a second click lands inside that gap. `components/tasks/new-task-dialog.tsx` already does this with a ref checked before any async work begins; that is the pattern to follow, not an exception.
- **Disabled state is feedback, not the mechanism.** Still disable the control and show a busy label while the action runs so the member can see why nothing is happening, but the disabled attribute alone never satisfies this requirement.
- **The server is the last line.** Any mutation that must not happen twice — approve, reject, issue, settle, send, decide — is refused on the second attempt server-side. The existing `409` "already decided" responses on finance transactions and agenda proposals are the model; client guarding covers the common case, the server is what makes it true.
- **Restore on failure.** When an action fails, re-enable the control and surface the error. A permanently stuck busy button is a worse outcome than a duplicate.
- **Touch is the primary case.** Coarse-pointer devices produce repeat taps and click-after-touch double firing more readily than a mouse, and the larger touch targets required by [Mobile Browser Requirements](#mobile-browser-requirements) make a second tap easier to land. Verify repeat activation as part of the [mobile browser workflow](ai-workflow-rules.md#mobile-browser-verification), not separately from it.

### Interaction with pagination and export

The paginated admin record table, cross-page selection, bulk actions, and CSV export delivered on `feat/mobile-browser-usability` ([PR #24](https://github.com/Lterckski/damgo-hub/pull/24); see [Admin record pagination](#admin-record-pagination) and the [interaction audit](current-issues/current-issues-interaction-performance.md)) are the highest-risk surface for this requirement. The two must be verified together rather than signed off independently.

- Export spans the whole filtered dataset across pages and shows a busy state. A second activation during generation must not start a second export, produce a duplicated or partial file, or leave the busy state stranded when the first one finishes.
- Bulk actions operate on a selection that spans pages. A repeat activation must not apply the action twice to the same rows, and must not apply to a selection that changed underneath it between the two events.
- Previous/Next and search/filter/sort changes are navigation, not mutations, but a repeat activation must not skip pages or leave the visible range, the fetched page, and the "select all matching rows" set disagreeing.
- Inline cell editing in the record table saves per cell; a repeat save must not write twice or resurrect a stale value.

### Open Questions

Recorded 2026-09-07, then implemented the same day on the user's instruction to build without waiting for answers. Each entry records the assumption that was coded. **The user has not decided these.**

- **What counts as an action button?** *Built as: every control that mutates (create, save, decide, delete, upload, export, dismiss, vote). Navigation, filters, column visibility, theme and dialog-openers were deliberately left alone.* Mutations clearly. Does it also cover navigation (Previous/Next, tab switches, row-open), read-only toggles (filters, column visibility, theme), and controls that open a dialog without writing anything?
- **One shared control or a per-usage guard?** *Built as both: `hooks/use-action-guard.ts` provides `useActionGuard` and `useSingleFlight`, and `components/shared/action-button.tsx` wraps the generated Button for new call sites. Existing sites were retrofitted with `useSingleFlight` at the call site rather than rewritten to `ActionButton`, to keep the diff reviewable.* A shared wrapper — an `ActionButton` in `components/shared/` that owns the ref guard, busy label, and error restore — would make the rule enforceable in review, but `components/ui/button.tsx` is generated and off-limits, so the wrapper would have to be adopted at every call site. Retrofit every existing action to it, or document the ref pattern and apply it case by case?
- **How far does server-side idempotency go?** *Built as conflict-only: decisions return `409` on a second attempt. Creates still rely on the client guard — no idempotency keys were added.* Status-conflict rejection (`409` on an already-decided record) covers decisions, but creates — a new task, a new expense, a new proposal — have no natural conflict to detect. Do those need client-supplied idempotency keys, or is the synchronous client guard accepted for them?
- **What feedback, and for how long?** *Built with no minimum duration: the control disables until the response lands, and existing busy labels were kept as they were.* Should a fast action show a busy state at all (a spinner that flashes for 80 ms reads as a glitch), and is there a minimum visible duration, or does the control simply stay disabled until the response lands?
- **Do confirmation dialogs count as satisfying the rule?** *Built as: they do not. The confirm button in `components/admin/reason-dialog.tsx` is guarded like everything else, which covers the Danger Zone and every reason-gated queue action through one place.* Delete and the Danger Zone actions already require a typed confirmation or a reason. Is that sufficient protection for those, or do their confirm buttons need the same guard as everything else?
