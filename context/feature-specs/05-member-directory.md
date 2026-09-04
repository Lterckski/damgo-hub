# Member Tracker

## Goal

Build the Member Tracker: the roster of everyone in the organization, the Leader-only Assistant Leader appointment, and functional/work-distribution role-tag management. Read `context/architecture-context.md`'s Auth and Roles Model and `context/team-roster.md` before starting.

## Routes

Before returning the roster or member-picker options, reconcile every membership in the active Clerk organization into the local `Member` table. Use Clerk's organization-membership identity for new members and updated names, emails, and avatars. This must not require a teammate to visit Damgo Hub once before other members can assign them. Picker and directory queries include only users who are still present in the current Clerk organization; Clerk remains the source of truth for organization membership and roles.

Create REST endpoints under `app/api/members`:

- `GET /api/members` — list all members, including their Clerk org role (fetched via Clerk's backend SDK, not stored in Postgres), `isLeader`, and their functional/work-distribution tags (any authenticated member)
- `PATCH /api/members/[memberId]/status` — update `status` (`org:admin` only)
- `POST /api/members/[memberId]/assistant-leader` — grant `org:admin` to this member via Clerk's organization-membership API. **Leader only** — check `isCurrentMemberLeader()`, not `isCurrentMemberAdmin()`. If another member currently holds `org:admin` and isn't the Leader, revoke it from them first — there is only ever one Assistant Leader seat.
- `DELETE /api/members/[memberId]/assistant-leader` — revoke `org:admin` from the current Assistant Leader. Leader only.
- `PATCH /api/members/[memberId]/functional-roles` — replace a member's `MemberFunctionalRole` set. `org:admin` only (Leader or Assistant Leader).
- `PATCH /api/members/[memberId]/work-distribution-roles` — replace a member's `MemberWorkDistributionRole` set (`HACKATHON_HUNTER`, `PROJECT_SCAVENGER_CREATOR` only — see below). `org:admin` only.

Add `isCurrentMemberLeader()` alongside `isCurrentMemberAdmin()` in `lib/current-member.ts` if it doesn't already exist — it just checks `member.isLeader`.

Security: unauthenticated requests return `401`; the Assistant Leader endpoints return `403` for anyone but the Leader; the tag endpoints return `403` for anyone who isn't `org:admin`.

## Page

Create `app/(app)/members/page.tsx`.

- shadcn `Table` listing every member: avatar, display name, email, a role badge (Leader / Assistant Leader / Member, derived from `isLeader` + Clerk org role — never a raw "Admin" toggle), functional role tags, work-distribution tags, status badge, joined date
- non-admins see the table entirely read-only, no row actions
- `org:admin` members see a row action menu (`DropdownMenu`) with "Edit role tags" and "Change status" — **no "Change role to Admin" option exists anywhere in this menu or any other**, for anyone
- "Edit role tags" opens a `Dialog` with two independent multi-select inputs (shadcn `Select` or a checkbox group): Member Roles (the `FunctionalRole` values) and Work Distribution (`HACKATHON_HUNTER` / `PROJECT_SCAVENGER_CREATOR` only — "Leader / Secretariat / Finance" and "Assistant Leader" are rendered as read-only derived labels next to whoever holds those seats, never as checkboxes in this dialog)
- only the Leader sees an additional, clearly separate "Assign Assistant Leader" control (not inside the row action menu — a distinct, deliberate action) that lets them pick exactly one member to hold the seat; picking a new member automatically revokes it from whoever held it before

## Check When Done

- member list loads real data, including live Clerk org role, for any authenticated member
- only the Leader can grant or revoke the Assistant Leader seat, and doing so always leaves exactly one Assistant Leader (or none)
- `org:admin` members (Leader and Assistant Leader) can edit functional and work-distribution tags on any member; regular members cannot edit any tags, including their own
- no UI anywhere lets a member select or grant themselves (or anyone else, if they aren't the Leader) the Admin/`org:admin` role
- "Leader / Secretariat / Finance" and "Assistant Leader" never appear as editable tags — only as derived labels
- `npm run build` passes
