# Core Schema: Members

## Goal

Prisma is already installed. Add the foundational `Member` model, its role-tag models, the Prisma client singleton, and the first migration. Every other domain (projects, tasks, finance, penalties, calendar, meetings, ideas) references `Member`, so this comes before them.

Read `context/architecture-context.md`'s Auth and Roles Model and `context/team-roster.md` before starting — the admin/member split itself is **not** stored here; it lives in Clerk. This unit only stores identity, profile, and the two kinds of role tags described below.

## Models

Create `prisma/models/member.prisma`.

Add `Member`:

- `id`
- `clerkUserId` — unique, maps to the Clerk identity
- `email`
- `displayName`
- `avatarUrl` — optional, cached from Clerk
- `status` enum: `ACTIVE`, `INACTIVE`
- `isLeader` — boolean, defaults `false`. True for exactly one member (seeded per `context/team-roster.md`). Not editable through any app UI — see `architecture-context.md`'s Leader model.
- timestamps
- indexes on `clerkUserId`

Do not add an admin/member role field — that's Clerk's `org:admin`/`org:member`, read live via `auth().orgRole`, never cached on this table.

Add `FunctionalRole` enum: `PITCHING`, `DOCUMENTS`, `CREATIVES`, `PRODUCTION`, `QUALITY_ASSURANCE`, `MARKETING`, `MODEL`.

Add `MemberFunctionalRole`:

- `memberId` relation, cascade delete
- `role` — `FunctionalRole`
- unique constraint on `memberId`/`role`
- index on `role`

Add `WorkDistributionRole` enum: `HACKATHON_HUNTER`, `PROJECT_SCAVENGER_CREATOR`.

Add `MemberWorkDistributionRole`:

- `memberId` relation, cascade delete
- `role` — `WorkDistributionRole`
- unique constraint on `memberId`/`role`
- index on `role`

Note: "Leader / Secretariat / Finance" and "Assistant Leader" are **not** `WorkDistributionRole` values — those are derived/display-only labels from `isLeader` and the Clerk `org:admin` seat, per `architecture-context.md`. Only the two values above are stored as tags.

Every later model (`Project`, `Task`, `Transaction`, `Penalty`, `CalendarEvent`, `Meeting`, `Idea`) will hold a relation to `Member`, added in that feature's own unit — do not pre-create those relations here.

## Prisma Client

Create `lib/prisma.ts` as a cached singleton.

Branch by `DATABASE_URL`:

- if it starts with `prisma+postgres://`, use Accelerate
- otherwise use direct `@prisma/adapter-pg`

Cache the client on `global` in development for hot reloads.

## Member Resolution Helper

Create `lib/current-member.ts` with:

- `getCurrentMember()` — reads the current Clerk identity (`userId`, primary email, name, avatar), looks up the matching `Member` record by `clerkUserId`, creates one on first sign-in if missing (`status: ACTIVE`, `isLeader: false`), and returns it. Profile/tag data only — no role logic.
- `isCurrentMemberAdmin()` — reads `auth().orgRole` and returns whether it's `org:admin`. This is the only place that should read `orgRole` for this purpose; every Admin-gated route/page calls this instead of re-deriving it.

This pairing is the single source of truth every route and server component uses — do not re-derive profile data from Clerk or role from anywhere else.

## Migration

Run the migration and generate the client.

## Dependencies

Already installed:

- `prisma`
- `@prisma/client`
- `@prisma/adapter-pg`
- `pg`
- `@clerk/nextjs`

## Check When Done

- `Member`, `MemberFunctionalRole`, and `MemberWorkDistributionRole` models exist with the fields, enums, and indexes above
- `Member` has no admin/member role field
- `lib/prisma.ts` exports one cached Prisma instance
- `getCurrentMember()` resolves or creates a `Member` record from the active Clerk session
- `isCurrentMemberAdmin()` reads the Clerk org role, not anything stored in Postgres
- migration runs successfully
- `npm run build` passes
