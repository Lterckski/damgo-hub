import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBoardAutosave, type BoardSnapshot } from "./use-board-autosave";

type TestNode = { id: string };
type TestEdge = { id: string };

function jsonResponse(snapshot: BoardSnapshot<TestNode, TestEdge>) {
  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useBoardAutosave", () => {
  it("blocks PUTs after a failed GET until an explicit retry succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ nodes: [{ id: "server" }], edges: [] }))
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ nodes }) =>
        useBoardAutosave({
          roomId: "project:test",
          nodes,
          edges: [] as TestEdge[],
          onLoadSnapshot: vi.fn(),
          debounceMs: 5,
        }),
      { initialProps: { nodes: [] as TestNode[] } },
    );

    await waitFor(() => expect(result.current.canRetryLoad).toBe(true));
    rerender({ nodes: [{ id: "local" }] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => result.current.retryLoad());
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
    );
  });

  it("does not restore a saved snapshot when the board changes while GET is pending", async () => {
    const pendingGet = deferred<Response>();
    const onLoadSnapshot = vi.fn();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => pendingGet.promise)
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderHook(
      ({ nodes }) =>
        useBoardAutosave({
          roomId: "project:test",
          nodes,
          edges: [] as TestEdge[],
          onLoadSnapshot,
          debounceMs: 5,
        }),
      { initialProps: { nodes: [] as TestNode[] } },
    );

    rerender({ nodes: [{ id: "live" }] });
    await act(async () => pendingGet.resolve(jsonResponse({ nodes: [{ id: "saved" }], edges: [] })));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
    );
    expect(onLoadSnapshot).not.toHaveBeenCalled();
  });

  it("saves an edit made while the initial load is pending once loading succeeds", async () => {
    const pendingGet = deferred<Response>();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => pendingGet.promise)
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderHook(
      ({ nodes }) =>
        useBoardAutosave({
          roomId: "project:test",
          nodes,
          edges: [] as TestEdge[],
          onLoadSnapshot: vi.fn(),
          debounceMs: 5,
        }),
      { initialProps: { nodes: [] as TestNode[] } },
    );

    rerender({ nodes: [{ id: "pending-edit" }] });
    await act(async () => pendingGet.resolve(jsonResponse({ nodes: [], edges: [] })));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(putCall).toBeDefined();
      expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ nodes: [{ id: "pending-edit" }], edges: [] });
    });
  });
});
