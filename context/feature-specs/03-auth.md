Clerk is already installed. Wire it into the Next.js app: provider, Organizations setup, auth pages, redirects, and route protection.

Damgo Hub runs as a single Clerk B2B **Organization** — see `context/architecture-context.md`'s Auth and Roles Model and `context/team-roster.md` for the full role design and current membership. Fine-grained role gating (Admin-only routes, the Leader-only "Assign Assistant Leader" action, functional/work-distribution tags) is layered on top later in `05-member-directory.md`, once the `Member` table exists — this unit only covers identity, the org, and route protection.

## Organizations Setup (manual, in the Clerk Dashboard)

Not something this unit's code can do — flag it back to whoever holds Clerk Dashboard access before/while implementing:

1. Enable the Organizations feature for this Clerk instance.
2. Create the one organization the whole app runs as (name: "Damgo Hub" or the team's actual name).
3. Restrict org creation/joining so members only join via invitation — no public sign-up-and-create-your-own-org flow. This is a single-organization app; nothing should let a second org come into existence.
4. Invite the five people in `context/team-roster.md`, granting the `org:admin` role to Dira and Din (Clerk's default roles — `org:admin`/`org:member` — are sufficient, no custom role needed). Everyone else defaults to `org:member`.

## Design

Use Clerk's `dark` theme from `@clerk/ui/themes` as the base.

Override Clerk appearance variables using the app's existing CSS variables from `context/ui-context.md`. Do not hardcode colors — the override must work correctly in both the light (beige) and dark theme.

Sign-in and sign-up pages:

- large screens: simple two-panel layout
- left: "Damgo Hub" wordmark, a one-line tagline, and a short text-only list of what the org uses it for (projects, tasks, finances, meetings)
- right: centered Clerk form
- small screens: form only
- no gradients
- no oversized hero sections
- no feature cards
- no scroll-heavy layouts

Keep the layout minimal and professional. Since sign-up is invite-only (see Organizations Setup above), the sign-up page mainly serves invited members completing their account — don't build a public self-serve org-creation flow.

## Implementation

Wrap the root layout with `ClerkProvider` using Clerk's `dark` theme and the token overrides above.

Create sign-in and sign-up pages using Clerk components.

Use `proxy.ts` at the project root, not `middleware.ts`. Keep it to a bare `clerkMiddleware()` that only establishes the auth context for every request — do not use `createRouteMatcher` to gate access by path. Clerk's own guidance deprecates that pattern (path matching "can diverge from how Next.js routes requests and leave protected resources reachable"); use resource-based checks instead:

- Protect every route under the authenticated app in one place: `app/(app)/layout.tsx` reads `auth()` and redirects to `/sign-in` if there's no `userId`, before rendering `AppShell`. This is the actual protection boundary for `/dashboard`, `/members`, and every future page under `(app)`.
- `app/api/*` routes are not covered by that layout — each route handler checks `auth()` itself and returns `401` when signed out (see `05-member-directory.md`'s routes for the pattern).
- `/sign-in` and `/sign-up` stay outside the `(app)` route group, so neither is protected by its layout.

Update `/`:

- authenticated members redirect to `/dashboard`
- unauthenticated visitors redirect to `/sign-in`

Add Clerk's built-in `UserButton` to the app navbar's right section (from `02-app-chrome.md`) for profile settings and logout.

Keep Clerk's default user menu and profile flows intact. Do not rebuild or heavily customize Clerk internals.

Use existing Clerk env vars. Do not rename or invent new ones.

## Dependencies

install: `@clerk/ui`.

## Check When Done

- Clerk Dashboard Organizations setup above is confirmed done (or explicitly flagged as still pending) before relying on `auth().orgRole` elsewhere
- `proxy.ts` exists at the root and only establishes auth context — no `createRouteMatcher`-based gating
- `app/(app)/layout.tsx` redirects unauthenticated visitors to `/sign-in`; `/sign-in` and `/sign-up` remain reachable
- auth pages use CSS variables with no hardcoded colors, and look correct in both light and dark mode
- `ClerkProvider` wraps the root layout
- `/` redirects correctly for both authenticated and unauthenticated visitors
- `npm run build` passes
