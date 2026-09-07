"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs an action at most once per activation.
 *
 * The guard is a ref, set and read in the same synchronous turn as the
 * event, before the handler's first `await`. That is the whole point: a
 * `disabled` prop driven by React state does not reach the DOM until the
 * next commit, and a double click, a fast repeated tap, or a held Enter can
 * land a second event inside that gap. `pending` exists to *show* the
 * member the action is running; `runningRef` is what actually prevents the
 * second submission.
 *
 * See context/ui-context.md — Single-activation action buttons.
 */
export function useActionGuard() {
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Returns true when this activation actually ran, false when it was
   * swallowed because one was already in flight. Callers that need to know
   * (to avoid closing a dialog twice, say) can check it; most can ignore it.
   *
   * The control is always re-enabled afterwards, including when `action`
   * throws — a permanently stuck busy button is worse than a duplicate, so
   * the reset lives in `finally` and never in a success-only branch.
   */
  const run = useCallback(
    async (action: () => void | Promise<void>): Promise<boolean> => {
      if (runningRef.current) return false;
      runningRef.current = true;
      if (mountedRef.current) setPending(true);
      try {
        await action();
        return true;
      } finally {
        runningRef.current = false;
        // Skip the state write when the component unmounted mid-action
        // (a dialog that closes on success), which would otherwise warn.
        if (mountedRef.current) setPending(false);
      }
    },
    [],
  );

  return { pending, run };
}

/**
 * Wraps handlers so each one runs at most once at a time.
 *
 * Same synchronous-ref idea as `useActionGuard`, in the shape that suits an
 * existing handler you do not want to restructure: wrap it at the call site
 * and the second activation is dropped before it can reach `fetch`.
 *
 *     const single = useSingleFlight();
 *     <Button onClick={single(() => remove(row.id), row.id)}>Delete</Button>
 *
 * `key` scopes the guard. Omit it and every wrapped handler in the
 * component shares one in-flight slot, which is what you want for a form's
 * Save/Delete pair. Pass a row id in a list, so acting on one row never
 * blocks a different one.
 */
export function useSingleFlight() {
  const inFlight = useRef<Set<string>>(new Set());

  return useCallback(
    <A extends unknown[]>(
      handler: (...args: A) => void | Promise<void>,
      key = "default",
    ) =>
      async (...args: A): Promise<void> => {
        if (inFlight.current.has(key)) return;
        inFlight.current.add(key);
        try {
          await handler(...args);
        } finally {
          inFlight.current.delete(key);
        }
      },
    [],
  );
}
