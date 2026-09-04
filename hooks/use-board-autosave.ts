"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
type SnapshotLoadState = "loading" | "ready" | "error";

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
  const [needsInitialLoad] = useState(() => nodes.length === 0 && edges.length === 0);
  const [loadState, setLoadState] = useState<SnapshotLoadState>(() => (needsInitialLoad ? "loading" : "ready"));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [status, setStatus] = useState<BoardAutosaveStatus>(() => (needsInitialLoad ? "loading" : "idle"));

  const hasAppliedSnapshotRef = useRef(false);
  const latestBoardRef = useRef({ nodes, edges });
  const onLoadSnapshotRef = useRef(onLoadSnapshot);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keeps `onLoadSnapshotRef` current without ever writing to it during
  // render (also forbidden by `react-hooks/refs`) — a ref update belongs
  // in an effect's commit phase, which runs after render, not during it.
  useEffect(() => {
    onLoadSnapshotRef.current = onLoadSnapshot;
  });

  // The GET may resolve after Liveblocks has received local or remote edits.
  // Keep the most recently committed board available to the async callback so
  // it never restores a stale snapshot over an active room.
  useEffect(() => {
    latestBoardRef.current = { nodes, edges };
  }, [nodes, edges]);

  // Load-on-mount. Guarded by `hasAppliedSnapshotRef` (not by skipping the
  // fetch itself) so React Strict Mode's dev-only double-effect can safely
  // re-run the (idempotent) GET without ever applying a loaded snapshot
  // twice — applying it twice would double up every loaded node/edge.
  useEffect(() => {
    if (!needsInitialLoad) return;

    let cancelled = false;
    fetch(`/api/boards/${encodeURIComponent(roomId)}/snapshot`)
      .then((res) => {
        if (!res.ok) throw new Error(`Snapshot load failed with status ${res.status}`);
        return res.json() as Promise<BoardSnapshot<N, E>>;
      })
      .then((snapshot) => {
        if (cancelled) return;

        const latestBoard = latestBoardRef.current;
        const roomIsStillEmpty = latestBoard.nodes.length === 0 && latestBoard.edges.length === 0;
        if (roomIsStillEmpty && !hasAppliedSnapshotRef.current && (snapshot.nodes.length > 0 || snapshot.edges.length > 0)) {
          hasAppliedSnapshotRef.current = true;
          onLoadSnapshotRef.current(snapshot);
        }

        setLoadState("ready");
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadAttempt, needsInitialLoad, roomId]);

  const retryLoad = useCallback(() => {
    if (loadState !== "error") return;
    setLoadState("loading");
    setStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  }, [loadState]);

  // Debounced save. Loading failures remain blocked until retryLoad completes
  // a successful GET. Including loadState means an edit committed while the
  // GET was pending is scheduled as soon as the load safely reaches "ready".
  useEffect(() => {
    if (loadState !== "ready") return;

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
  }, [nodes, edges, roomId, debounceMs, loadState]);

  return { status, canRetryLoad: loadState === "error", retryLoad };
}
