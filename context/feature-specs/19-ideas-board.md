Build the open Ideas board: a single, organization-wide collaborative canvas any authenticated member can post to and browse, backed by Liveblocks + React Flow (`12-liveblocks-setup.md`), reusing presence and autosave from `14-presence-avatars-cursors.md` and `15-board-autosave.md`.

Unlike the roadmap and agenda boards, this one has no owning project/meeting record and no per-node structure beyond a freeform sticky note.

## Schema

Create `prisma/models/ideas-board.prisma`.

Add a single `IdeasBoard` row (effectively a singleton — there is only ever one) to hold `snapshotPath`, the Vercel Blob URL for the board's autosaved JSON, so it fits the same storage pattern as `15-board-autosave.md` without inventing a new one. Seed this single row in the migration if the pattern requires a fixed ID to look up.

## Route

Create `app/(app)/ideas/page.tsx`.

## Implementation

1. Create a client-side `IdeasBoard` wrapper.

   - `LiveblocksProvider` using `/api/liveblocks-auth`
   - `RoomProvider` using the fixed room ID `ideas`
   - `ClientSideSuspense` with a loading state and connection error fallback
   - wire `useLiveblocksFlow` starting from empty nodes/edges

2. Define the idea node data shape in `types/roadmap.ts` alongside the other node types:

   - `text` — the idea content, editable inline by anyone (open board, no per-idea ownership)
   - `authorId` — set once at creation, shown as a small avatar/name tag on the note, never editable afterward
   - node type name: `ideaNode`

3. Render `ideaNode` as a sticky-note card:

   - use the existing node color palette from `ui-context.md` — cycle through the 8 color pairs as new ideas are added so the board reads as varied rather than uniform
   - author avatar/name tag pinned to the bottom corner of the note
   - double-click to edit the idea text inline (same textarea-over-label pattern as other nodes)

4. No edges. Ideas are freeform — omit connection handles and edge rendering entirely for this board.

5. Add a floating "New Idea" button that drops a new note at a default (or slightly randomized, to avoid exact overlap) position, immediately focused for text entry.

6. Wire in `BoardPresence` and `useBoardAutosave` using `IdeasBoard.snapshotPath` as the owning field.

## Scope Limits

- don't add project or meeting scoping — this board is global
- don't add edges/connections
- don't add moderation/deletion restrictions beyond what's listed — any member can edit any note's text, since the board is explicitly open to all

## Check When Done

- `/ideas` connects to the single global Liveblocks room.
- Any authenticated member can add and edit idea notes.
- Notes cycle through the node color palette and show their original author.
- Presence avatars/cursors and autosave work the same as the other boards.
- `npm run build` passes without type errors.
