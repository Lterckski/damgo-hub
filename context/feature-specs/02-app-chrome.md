Read `context/ui-context.md` before starting.

**Implemented baseline:** this unit describes the existing shell. The proposed global search, notification inbox, org switcher, quick-create menu and account/theme controls are specified in [unit 23](23-global-search-notifications-header.md), whose audit must be confirmed before implementation. Preserve this unit's bottom dock and separate collaborative workspace chrome when extending the header.

We need the base chrome that frames every authenticated screen — the top header and the bottom navigation dock. These are reused and extended by every feature area that follows. This is unrelated to the collaborative board chrome (built later in `13-roadmap-board.md`), which uses a separate floating side overlay layout.

### App Navbar (header)

Create `components/chrome/app-navbar.tsx`. Plain function component — no client-side state, so it stays a Server Component.

Requirements:

- fixed-height top header
- left section: the actual logo image (`/brand/logo.jpeg`, via `next/image`, small and rounded) + "Damgo Hub" wordmark
- right section: a `rightSlot` prop — holds the Clerk `UserButton` today; search, settings, and other utility controls land here later, per `ui-context.md`. Leave the section able to hold more without a redesign.
- `bg-surface` background with a `border-subtle` bottom border

---

### App Dock (bottom nav)

Create `components/chrome/app-dock.tsx`. Client component (`usePathname` for the active route).

Requirements:

- a floating, centered, pill-shaped bar fixed to the **bottom** of the viewport (`bg-elevated`, `border-default`, `rounded-full`, soft shadow) — not a side sidebar
- one icon per nav destination, `lucide-react`, `h-5 w-5`: Dashboard, Projects, Tasks, Finance, Documentation, Calendar, Meetings, Penalties, Members, Ideas
- an `isAdmin` prop; only render the Admin icon when true, separated from the rest by a thin vertical divider (real role resolution is wired in `05-member-directory.md`)
- **icon-only, always** — no persistent text labels
- **collapsed by default, hover/focus to reveal**: only a small handle (a short pill) sits at the bottom edge of the viewport when idle; the dock itself slides up and fades in when the pointer is anywhere in the bottom strip of the viewport (not just over the handle) and slides back down on mouse-out — pure CSS `group`/`group-hover` + `group-focus-within` (for keyboard users tabbing to a nav item), no JS state, no tooltip/animation library
- hovering an icon (once the dock is revealed) shows its label as a small tooltip positioned above it (same CSS `group`/`group-hover` pattern)
- the active route's icon is visually distinguished with the accent color (`bg-accent-dim` / `text-brand`), not just a background tint

---

### App Shell

Create `components/chrome/app-shell.tsx`. Composes `AppNavbar` (top), a `children` content slot (fills the space between, `pb-24` so content doesn't sit under the floating dock), and `AppDock` (bottom) into the layout every authenticated route uses. No client state of its own — the dock's active-route highlighting is self-contained.

### Check when done

- shell renders header + content + bottom dock with no layout overlap between content and the floating dock
- Admin icon only renders when `isAdmin` is true, with the divider
- the dock stays collapsed (just the handle) until the pointer nears the bottom of the viewport, then reveals; hovering a dock icon shows its label; the active route's icon is visually distinguished; tabbing to a nav item reveals the dock too
- no TypeScript or lint errors
- all colors resolve to tokens from `context/ui-context.md` — no hardcoded hex values
