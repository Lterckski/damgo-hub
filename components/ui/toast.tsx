"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Minimal toast stack with an Undo affordance.
 *
 * Exists because Zone 4's inline cells update optimistically — the cell
 * changes before the server answers — and an optimistic write with no way
 * back is just an unconfirmed one. `undo` is a callback the caller
 * supplies; the toast doesn't know how to reverse anything itself, it only
 * guarantees the offer stays on screen long enough to take.
 */

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Shown as an "Undo" button; the toast dismisses itself once it resolves. */
  undo?: () => void | Promise<void>;
  /** Milliseconds. Undo-able toasts default to longer, to be reachable. */
  durationMs?: number;
}

interface ToastRecord extends Required<Pick<ToastOptions, "message">> {
  id: number;
  tone: ToastTone;
  undo?: () => void | Promise<void>;
  durationMs: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast() must be used inside <ToastProvider>");
  return context;
}

const TONE_ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

const TONE_CLASS = {
  success: "text-state-success",
  error: "text-state-error",
  info: "text-brand",
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = React.useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setToasts((current) => [
      ...current,
      {
        id,
        message: options.message,
        tone: options.tone ?? "success",
        undo: options.undo,
        durationMs: options.durationMs ?? (options.undo ? 8000 : 4000),
      },
    ]);
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  const [isUndoing, setIsUndoing] = React.useState(false);

  React.useEffect(() => {
    // Pause the auto-dismiss while an undo is in flight — dismissing the
    // row out from under a pending request loses the only feedback the
    // member has that it happened.
    if (isUndoing) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [isUndoing, onDismiss, toast.durationMs, toast.id]);

  const Icon = TONE_ICON[toast.tone];

  async function handleUndo() {
    if (!toast.undo) return;
    setIsUndoing(true);
    try {
      await toast.undo();
    } finally {
      onDismiss(toast.id);
    }
  }

  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center gap-3 rounded-xl bg-elevated px-4 py-3 shadow-lg ring-1 ring-surface-border"
    >
      <Icon className={cn("h-4 w-4 shrink-0", TONE_CLASS[toast.tone])} />
      <p className="flex-1 text-sm text-copy-primary">{toast.message}</p>
      {toast.undo && (
        <Button variant="ghost" size="sm" onClick={handleUndo} disabled={isUndoing}>
          {isUndoing ? "Undoing…" : "Undo"}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
