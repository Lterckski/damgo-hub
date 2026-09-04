Show active room participants and live cursors on collaborative boards. Build this once, generically, so it works for the roadmap board (`13-roadmap-board.md`) now and the ideas board (`19-ideas-board.md`) when it is built — don't couple it to the roadmap specifically.

## Implementation

1. Create `components/board/board-presence.tsx`, a shared component any board surface can drop in.

   - position it in the top-right corner of the board area, visually separate from page-level navbar actions
   - get the current member's ID from `getCurrentMember()` / the active Clerk session
   - filter the Liveblocks presence list to exclude the current member's own entry
   - render the filtered list as collaborator avatars, display-only (not interactive)
   - use profile photos when available, fall back to initials
   - show up to five avatars in an overlapping stack; show a `+N` overflow chip beyond that
   - add a subtle ring so avatars stay legible on both the light and dark canvas background

2. Add live cursors to the board.

   - render cursors for other participants only, never the current member's own
   - broadcast cursor position via Liveblocks presence on the board's pointer-move event
   - clear the cursor to `null` on pointer leave
   - show a small colored pointer with a name badge, colored using the deterministic member-color helper from `12-liveblocks-setup.md`

3. Wire `BoardPresence` into the roadmap board from `13-roadmap-board.md`.

## Scope Limits

- don't add avatars to the app-level navbar or sidebar — this is board-scoped only
- don't make collaborator avatars interactive
- don't change node or edge behavior

## Check When Done

- `BoardPresence` is a standalone, reusable component.
- It renders correctly wired into the roadmap board.
- Collaborator avatars exclude the current member.
- Cursors render for other participants only, using their presence color.
- `npm run build` passes.
