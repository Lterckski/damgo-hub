"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useActionGuard } from "@/hooks/use-action-guard";

type ButtonProps = ComponentProps<typeof Button>;

interface ActionButtonProps extends Omit<ButtonProps, "onClick"> {
  /**
   * The action to run. Awaited, and guaranteed to run at most once per
   * activation — a second click while it is in flight is dropped.
   */
  onAction: () => void | Promise<void>;
  /** Label shown while the action runs. Defaults to the button's children. */
  pendingLabel?: ReactNode;
}

/**
 * A Button that cannot fire its action twice.
 *
 * Wraps the generated `components/ui/button.tsx` rather than editing it —
 * that file is shadcn-generated and stays untouched per code-standards.md.
 * Reach for this at any call site that mutates; it is the enforceable form
 * of the project-wide requirement in ui-context.md, "Single-activation
 * action buttons".
 *
 * Handlers with their own local busy state (a dialog form tracking its own
 * `submitting`, say) can use `useActionGuard()` directly instead — the
 * requirement is the synchronous ref guard, not this specific component.
 */
export function ActionButton({
  onAction,
  pendingLabel,
  children,
  disabled,
  ...props
}: ActionButtonProps) {
  const { pending, run } = useActionGuard();

  return (
    <Button
      {...props}
      // `disabled` here is feedback for the member, not the mechanism —
      // the ref inside useActionGuard is what actually drops the second
      // activation, because this attribute lands a commit too late.
      disabled={disabled || pending}
      onClick={() => {
        void run(onAction);
      }}
    >
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </Button>
  );
}
