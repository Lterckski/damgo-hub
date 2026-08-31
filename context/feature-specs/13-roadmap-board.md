Build the collaborative milestone roadmap on the project detail page's "Roadmap" tab (stubbed in `11-project-proposals.md`), backed by Liveblocks + React Flow (`12-liveblocks-setup.md`).

Milestones here are a simpler, purpose-built node type — not a generic shape/diagramming system. Each node represents one milestone; edges represent "depends on" ordering between milestones.

## Implementation

1. Keep the project detail page server-side. Create a client-side `RoadmapBoard` wrapper for the Roadmap tab that sets up the Liveblocks room.

   - `LiveblocksProvider` using `/api/liveblocks-auth`
   - `RoomProvider` using room ID `project:{projectId}`
   - initial presence with `cursor: null`
   - `ClientSideSuspense` with a loading state
   - an error fallback for connection issues

2. Wire React Flow to Liveblocks state using `useLiveblocksFlow`, enabled with suspense, starting from empty nodes/edges.

3. Define the milestone node data shape in `types/roadmap.ts`:

   - `title`
   - `status`: `NOT_STARTED` | `IN_PROGRESS` | `DONE`
   - `dueDate` — optional
   - `assigneeIds` — member IDs, shown as avatar chips
   - node type name: `milestoneNode`

4. Render `milestoneNode` as a card:

   - rounded card using `bg-surface`, `border-default` at rest
   - left accent bar or badge colored by status (`--text-muted` for `NOT_STARTED`, `--accent-primary` for `IN_PROGRESS`, `--state-success` for `DONE`)
   - title, due date (if set), and up to 3 assignee avatar chips with a `+N` overflow
   - connection handles on all four sides: small circles matching `--border-default`, hidden by default, faded in on hover
   - brighter border when selected

5. Add a floating "Add Milestone" button (top of the canvas). Clicking it creates a new `milestoneNode` at a default position with an empty title and `NOT_STARTED` status, then immediately opens it for editing (step 6).

6. Add a milestone edit `Dialog` (shadcn `Dialog`), opened by double-clicking a node:

   - title input
   - status `Select`
   - due date picker (shadcn `Calendar` in a popover)
   - assignee multi-select from project collaborators
   - delete button (destructive)
   - all changes write through the existing Liveblocks-synced node data — no separate save step

7. Add dependency edges:

   - default edge style: thin stroke using `--border-default` at rest, `--accent-primary` when hovered/selected, with an arrowhead
   - clean right-angle (smooth-step) routing
   - no edge labels needed — dependency direction is the only information an edge carries

8. Add a small control bar (bottom-left): zoom in, zoom out, fit view, undo, redo.

   - zoom/fit view use the React Flow instance
   - undo/redo use Liveblocks history; disable and dim the button when there's nothing to undo/redo

## Scope Limits

- don't build a generic multi-shape system — one card node type is enough for this feature
- don't add starter templates or a shape drag-and-drop panel
- don't add persistence logic yet — that's `15-board-autosave.md`
- don't add presence avatars/cursors yet — that's `14-presence-avatars-cursors.md`

## Check When Done

- Roadmap tab sets up a Liveblocks room scoped to the project.
- Milestone nodes can be added, edited (title/status/due date/assignees), and deleted through the edit dialog.
- Node status visually reflects `NOT_STARTED` / `IN_PROGRESS` / `DONE`.
- Dependency edges can be drawn between milestones.
- Zoom, fit view, undo, and redo work from the control bar.
- `npm run build` passes without type errors.
