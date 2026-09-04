Set up the shared realtime collaboration infrastructure using Liveblocks. This is used by three surfaces built later — the project roadmap (`13-roadmap-board.md`), the meeting agenda (`17-meeting-agenda-board.md`), and the ideas board (`19-ideas-board.md`) — so keep it generic across room types rather than coupling it to any one of them.

## Configuration

Configure `liveblocks.config.ts` at the project root.

Define:

### Presence

- `cursor`: `{ x: number; y: number } | null`

### UserMeta

- member ID
- display name
- avatar URL
- cursor color

## Liveblocks Client

Create a cached Liveblocks node client in `lib/liveblocks.ts`.

Add a helper that deterministically maps a member ID to a consistent color from a fixed palette (drawn from `ui-context.md`'s node color palette so cursors and node accents feel like one system).

## Room ID Convention

Rooms are namespaced by surface so the same infrastructure serves all three:

- roadmap room: `project:{projectId}`
- meeting agenda room: `meeting:{meetingId}`
- ideas board room: `ideas` (single global room, no suffix)

## Auth Route

Create `POST /api/liveblocks-auth`.

This route must:

1. require Clerk authentication via `getCurrentMember()`
2. parse the requested room ID and resolve which surface it belongs to (project/meeting/ideas) from its prefix
3. verify access for that surface:
   - `project:*` — use `requireProjectAccess` from `lib/project-access.ts`
   - `meeting:*` — verify the member is a meeting participant (added in `16-meeting-scheduling.md`; until then, any authenticated member passes)
   - `ideas` — any authenticated member passes
4. ensure the Liveblocks room exists (create only if needed)
5. return a session token with display name, avatar, and a generated cursor color

Return `403` for unauthorized access.

## Dependencies

~~All required Liveblocks packages are already installed.~~ Wasn't
actually true when this unit was picked up — `package.json` had no
`@liveblocks/*` packages at all. Installed `@liveblocks/client`,
`@liveblocks/node`, and `@liveblocks/react` (all `^3.24.1`, the current
published version) as part of this unit. `@liveblocks/react` isn't
imported by anything yet — nothing needs its hooks until `13-roadmap-
board.md` — installed now so all three collaborative-board units can
build on it without a second install pass.

## Check When Done

- `liveblocks.config.ts` defines Presence and UserMeta
- Liveblocks client is cached
- auth route resolves the correct access check per room-ID prefix
- unauthorized project/meeting access returns `403`
- `npm run build` passes
