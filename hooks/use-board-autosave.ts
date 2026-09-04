"use client";

import { useEffect, useRef, useState } from "react";

export type BoardAutosaveStatus = "loading" | "idle" | "saving" | "saved" | "error";

export interface BoardSnapshot<N, E> {
  nodes: N[];
  edges: E[];
}

interface UseBoardAutosaveOptions<N, E> {
  roomId: string;
  nodes: N[];
  edges: E[];
  /**
   * Called once, only if the room was empty on mount and a saved snapshot
   * had real content, with the loaded nodes/edges to apply (e.g. via
   * `onNodesChange`/`onEdgesChange` "add" changes).
   */
  onLoadSnapshot: (snapshot: BoardSnapshot<N, E>) => void;
  /** How long to wait after the last change before saving. */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 1500;

/**
 * Generic board autosave — see 15-board-autosave.md. Debounces saves of
 * whatever nodes/edges the caller passes through `PUT
 * /api/boards/[roomId]/snapshot`, and loads a previously-saved snapshot on
 * mount, but only if the Liveblocks room was otherwise empty at that point
 * — so a fresh page load never clobbers content other participants are
 * actively editing live. Deliberately generic (no roadmap-specific typing)
 * so `19-ideas-board.md` can reuse this exact hook once that unit exists.
 */
export function useBoardAutosave<N, E>({
  roomId,
  nodes,
  edges,
  onLoadSnapshot,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseBoardAutosaveOptions<N, E>) {
  // Both lazy `useState` initializers, not refs — this project's lint
  // config (`react-hooks/refs`) forbids reading/writing `ref.current`
  // during render, even the common "compute a ref once" idiom, so a value
  // that needs to freeze at first render and also be read during render
  // has to be real state instead. Neither ever gets its setter called
  // again — `nodes`/`edges` only matter here at the exact moment of the
  // first render, not as the board fills up during normal use.
  const [wasInitiallyEmpty] = useState(() => nodes.length === 0 && edges.length === 0);
  const [status, setStatus] = useState<BoardAutosaveStatus>(() => (wasInitiallyEmpty ? "loading" : "idle"));

  const hasAppliedSnapshotRef = useRef(false);
  const onLoadSnapshotRef = useRef(onLoadSnapshot);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keeps `onLoadSnapshotRef` current without ever writing to it during
  // render (also forbidden by `react-hooks/refs`) — a ref update belongs
  // in an effect's commit phase, which runs after render, not during it.
  useEffect(() => {
    onLoadSnapshotRef.current = onLoadSnapshot;
  });

  // Load-on-mount. Guarded by `hasAppliedSnapshotRef` (not by skipping the
  // fetch itself) so React Strict Mode's dev-only double-effect can safely
  // re-run the (idempotent) GET without ever applying a loaded snapshot
  // twice — applying it twice would double up every loaded node/edge.
  useEffect(() => {
    if (!wasInitiallyEmpty) return;

    let cancelled = false;
    fetch(`/api/boards/${encodeURIComponent(roomId)}/snapshot`)
      .then((res) => (res.ok ? (res.json() as Promise<BoardSnapshot<N, E>>) : null))
      .then((snapshot) => {
        if (cancelled || !snapshot || hasAppliedSnapshotRef.current) return;
        if (snapshot.nodes.length > 0 || snapshot.edges.length > 0) {
          hasAppliedSnapshotRef.current = true;
          onLoadSnapshotRef.current(snapshot);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      })
      .finally(() => {
        if (!cancelled) setStatus((current) => (current === "error" ? current : "idle"));
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, wasInitiallyEmpty]);

  // Debounced save — skipped entirely while the initial load is still in
  // flight, so a fresh mount never races a save against its own load and
  // (worse) writes an empty board over a real saved snapshot before it's
  // even been read.
  // `status` is read only to gate against saving before the initial load
  // settles; it isn't something a save should re-trigger itself on (that
  // would re-arm this effect every time status flips through
  // saving/saved), so it's deliberately left out of the dependency array.
  useEffect(() => {
    if (status === "loading") return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setStatus("saving");
      fetch(`/api/boards/${encodeURIComponent(roomId)}/snapshot`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      })
        .then((res) => setStatus(res.ok ? "saved" : "error"))
        .catch(() => setStatus("error"));
    }, debounceMs);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, roomId, debounceMs]);

  return { status };
}
