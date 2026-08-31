Build the live collaborative agenda board on the meeting detail page's "Live Agenda" tab (stubbed in `16-meeting-scheduling.md`), backed by Liveblocks + React Flow (`12-liveblocks-setup.md`), reusing the presence and autosave infrastructure from `14-presence-avatars-cursors.md` and `15-board-autosave.md`.

Unlike the roadmap board, an agenda is inherently ordered rather than a general graph — nodes here represent agenda items in sequence, editable live by everyone in the meeting.

## Implementation

1. Create a client-side `AgendaBoard` wrapper for the Live Agenda tab.

   - `LiveblocksProvider` using `/api/liveblocks-auth`
   - `RoomProvider` using room ID `meeting:{meetingId}`
   - `ClientSideSuspense` with a loading state and connection error fallback
   - wire `useLiveblocksFlow` starting from empty nodes/edges

2. When the board first loads for a meeting with no existing nodes, seed it from that meeting's `ACCEPTED` agenda proposals (`16-meeting-scheduling.md`) — one `agendaItemNode` per accepted proposal, laid out top-to-bottom, connected in sequence by edges. Only seed once; never re-seed if the room already has content (same rule as board autosave's load behavior).

3. Define the agenda item node data shape in `types/roadmap.ts` alongside the milestone node type:

   - `text` — the agenda item content, editable inline
   - `notes` — free-form live notes for that item, shown expanded under the item text
   - node type name: `agendaItemNode`

4. Render `agendaItemNode` as a wide card:

   - `bg-surface` card, `border-default` at rest, brighter border when selected
   - item text at the top, editable inline on double-click (same textarea-over-label pattern as node label editing elsewhere)
   - a `notes` area below, always visible and live-editable by any participant, growing with content
   - top/bottom connection handles only — agenda order is linear, not a general graph

5. Sequence edges connect items top-to-bottom automatically when a new item is inserted between two existing ones; dragging an item to a new vertical position should not be required to reorder — provide an explicit "Move up" / "Move down" control on each card instead, to keep ordering unambiguous during a live meeting.

6. Add "Add Agenda Item" and reuse the roadmap board's control bar pattern (zoom, fit view, undo/redo via Liveblocks history).

7. Wire in `BoardPresence` (`14-presence-avatars-cursors.md`) and autosave (`15-board-autosave.md`) using `Meeting.agendaSnapshotPath` as the owning field.

## Scope Limits

- don't add dependency-style freeform connections — ordering stays linear
- don't add the milestone-specific fields (status/due date/assignees) to agenda items
- don't touch the roadmap board or its node type

## Check When Done

- Live Agenda tab connects to a Liveblocks room scoped to the meeting.
- Accepted agenda proposals seed the board on first load only.
- Agenda item text and notes are live-editable by all participants.
- "Move up"/"Move down" reorders items unambiguously.
- Presence avatars/cursors and autosave work the same as on the roadmap board.
- `npm run build` passes without type errors.
