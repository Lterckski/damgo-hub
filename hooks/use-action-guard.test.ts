import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useActionGuard, useSingleFlight } from "./use-action-guard";

/** A promise plus the handle to settle it, so a test can hold an action
 *  "in flight" and fire a second activation while it is still running. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useActionGuard", () => {
  it("drops a second activation while the first is in flight", async () => {
    const { result } = renderHook(() => useActionGuard());
    const gate = deferred();
    let calls = 0;

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = result.current.run(async () => {
        calls += 1;
        await gate.promise;
      });
      // Same synchronous turn as the first — this is the double click.
      second = result.current.run(async () => {
        calls += 1;
      });
    });

    expect(await second).toBe(false);
    expect(calls).toBe(1);

    await act(async () => {
      gate.resolve();
      await first;
    });
    expect(calls).toBe(1);
  });

  it("allows the next activation once the first finishes", async () => {
    const { result } = renderHook(() => useActionGuard());
    let calls = 0;

    await act(async () => {
      await result.current.run(async () => {
        calls += 1;
      });
    });
    await act(async () => {
      await result.current.run(async () => {
        calls += 1;
      });
    });

    expect(calls).toBe(2);
  });

  it("releases the guard when the action throws", async () => {
    const { result } = renderHook(() => useActionGuard());
    let calls = 0;

    await act(async () => {
      await expect(
        result.current.run(async () => {
          calls += 1;
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
    });

    // A failed action must not leave the control stuck busy forever.
    expect(result.current.pending).toBe(false);
    await act(async () => {
      await result.current.run(async () => {
        calls += 1;
      });
    });
    expect(calls).toBe(2);
  });
});

describe("useSingleFlight", () => {
  it("drops a repeat activation of the same handler", async () => {
    const { result } = renderHook(() => useSingleFlight());
    const gate = deferred();
    let calls = 0;

    const handler = result.current(async () => {
      calls += 1;
      await gate.promise;
    });

    let first!: Promise<void>;
    await act(async () => {
      first = handler();
      void handler();
    });
    expect(calls).toBe(1);

    await act(async () => {
      gate.resolve();
      await first;
    });
    expect(calls).toBe(1);
  });

  it("keys separate rows independently", async () => {
    const { result } = renderHook(() => useSingleFlight());
    const gate = deferred();
    const started: string[] = [];

    const run = (id: string) =>
      result.current(async () => {
        started.push(id);
        await gate.promise;
      }, id);

    await act(async () => {
      void run("row-a")();
      void run("row-b")();
    });

    // Acting on one row must never block a different row.
    expect(started).toEqual(["row-a", "row-b"]);
    await act(async () => {
      gate.resolve();
    });
  });

  it("releases the key after the handler rejects", async () => {
    const { result } = renderHook(() => useSingleFlight());
    let calls = 0;
    const handler = result.current(async () => {
      calls += 1;
      throw new Error("nope");
    });

    await act(async () => {
      await expect(handler()).rejects.toThrow("nope");
      await expect(handler()).rejects.toThrow("nope");
    });
    expect(calls).toBe(2);
  });
});
