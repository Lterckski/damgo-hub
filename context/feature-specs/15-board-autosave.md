Add autosave and loading for collaborative boards so state is persisted. Board JSON is stored in Vercel Blob, and the saved blob URL is stored on the owning Prisma record — per the storage model in `architecture-context.md`. Build this generically so the roadmap board (`13-roadmap-board.md`) uses it now and the ideas board (`19-ideas-board.md`) reuses the same hook and routes later.

## What to Install

- `@vercel/blob`

## Implementation

1. `Project.roadmapSnapshotPath` already exists (added in `11-project-proposals.md`) for the roadmap board. Confirm it's there before continuing.

2. Add generic board save/load API routes:

   Create: `PUT /api/boards/[roomId]/snapshot`

   - receive the latest board JSON (nodes + edges)
   - resolve which owning record the `roomId` maps to (`project:{id}` → `Project.roadmapSnapshotPath`; `ideas` is wired once that unit exists)
   - verify the caller has access to that room (reuse the same access check as `/api/liveblocks-auth`)
   - upload the JSON to Vercel Blob
   - store the returned blob URL on the matching record

   Create: `GET /api/boards/[roomId]/snapshot`

   - verify access
   - read the saved blob URL from the owning record
   - fetch and return the saved board JSON

3. Add a reusable `useBoardAutosave` hook in `hooks/`.

   - takes a `roomId` and the current nodes/edges
   - debounces saves to avoid excessive writes
   - saves through the snapshot API route
   - tracks save status: `saving`, `saved`, `error`

4. Load saved board state when a board mounts.

   - if the Liveblocks room already has nodes or edges, skip loading — don't overwrite active collaboration
   - if the room is empty and a saved snapshot exists, fetch and load it

5. Wire `useBoardAutosave` and the load-on-mount behavior into the roadmap board from `13-roadmap-board.md`. Add a small save-status indicator near the board's control bar (saving / saved / error).

## Storage Pattern

- Prisma stores the owning record's metadata and the snapshot blob URL.
- Vercel Blob stores the actual board JSON.

## Check When Done

- `@vercel/blob` is installed.
- Snapshot routes save/load correctly and enforce the same access checks as the room's Liveblocks auth.
- `useBoardAutosave` debounces saves and reports status.
- Roadmap board loads a saved snapshot only when the room is otherwise empty.
- `npm run build` passes.
