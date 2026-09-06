"use client";

import * as React from "react";
import { Check, Pencil, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Zone 4's inline cells.
 *
 * Every editor here is optimistic: the displayed value changes immediately
 * and the request goes out behind it. The console's `commitEdit` supplies
 * `onCommit`, which surfaces an Undo toast on success and rolls the cell
 * back on failure — so "optimistic" never means "unverified", it means the
 * confirmation arrives after the change instead of before it.
 *
 * A cell stops click propagation on its own: the row underneath opens a
 * drawer, and editing a cell must not do both.
 */

interface EditorShellProps {
  children: React.ReactNode;
  className?: string;
}

function Stop({ children, className }: EditorShellProps) {
  return (
    <div
      className={cn("inline-flex items-center gap-1.5", className)}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

export interface InlineSelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onCommit: (next: T) => void;
  disabled?: boolean;
  /** Why the control is disabled — shown as a title so it isn't a mystery. */
  disabledReason?: string;
  className?: string;
}

/**
 * A native <select> rather than the app's shadcn Select: this sits inside a
 * clickable table row, and the popover-based control fights the row's own
 * click target and the horizontal scroll container around it.
 */
export function InlineSelect<T extends string>({
  value,
  options,
  onCommit,
  disabled,
  disabledReason,
  className,
}: InlineSelectProps<T>) {
  return (
    <Stop>
      <select
        value={value}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onChange={(event) => {
          const next = event.target.value as T;
          if (next !== value) onCommit(next);
        }}
        className={cn(
          "h-7 rounded-lg border border-surface-border bg-base px-2 text-xs font-medium text-copy-primary outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-brand",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-brand/50",
          className,
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Stop>
  );
}

interface InlineAmountProps {
  /** Integer centavos, or null for "no amount". */
  valueCents: number | null;
  onCommit: (nextCents: number | null) => void;
  disabled?: boolean;
  disabledReason?: string;
  allowEmpty?: boolean;
}

/** Money editor. Displays pesos, commits centavos — never a float in the payload. */
export function InlineAmount({
  valueCents,
  onCommit,
  disabled,
  disabledReason,
  allowEmpty = false,
}: InlineAmountProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  function start() {
    setDraft(valueCents === null ? "" : (valueCents / 100).toFixed(2));
    setIsEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (allowEmpty) onCommit(null);
      setIsEditing(false);
      return;
    }
    const pesos = Number.parseFloat(trimmed);
    if (Number.isFinite(pesos) && pesos >= 0) {
      const cents = Math.round(pesos * 100);
      if (cents !== valueCents) onCommit(cents);
    }
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <Stop>
        <span className="tabular-nums text-copy-primary">
          {valueCents === null ? "—" : formatPHP(valueCents)}
        </span>
        {!disabled && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={start}
            aria-label="Edit amount"
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
        {disabled && disabledReason && (
          <span className="sr-only">{disabledReason}</span>
        )}
      </Stop>
    );
  }

  return (
    <Stop>
      <Input
        autoFocus
        value={draft}
        inputMode="decimal"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setIsEditing(false);
        }}
        className="h-7 w-24 text-copy-primary!"
      />
      <Button variant="ghost" size="icon-xs" onClick={commit} aria-label="Save">
        <Check className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={() => setIsEditing(false)} aria-label="Cancel">
        <X className="h-3 w-3" />
      </Button>
    </Stop>
  );
}

interface InlineDateProps {
  /** ISO string. */
  value: string | null;
  onCommit: (isoDate: string) => void;
  /** Rendered muted with a note when the date was derived rather than set. */
  isInferred?: boolean;
  isOverdue?: boolean;
  disabled?: boolean;
}

export function InlineDate({ value, onCommit, isInferred, isOverdue, disabled }: InlineDateProps) {
  const [isEditing, setIsEditing] = React.useState(false);

  const display = value ? new Date(value).toLocaleDateString() : "—";

  if (!isEditing) {
    return (
      <Stop>
        <span
          className={cn(
            "tabular-nums",
            isOverdue ? "font-semibold text-state-error" : "text-copy-primary",
            isInferred && !isOverdue && "text-copy-muted",
          )}
          title={isInferred ? "Derived from the org's penalty due-days setting" : undefined}
        >
          {display}
          {isInferred && <span className="ml-1 text-[10px] uppercase">est.</span>}
        </span>
        {!disabled && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsEditing(true)}
            aria-label="Edit due date"
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </Stop>
    );
  }

  return (
    <Stop>
      {/* A bare native date input, deliberately, and only here: ui-context.md
          bans it for member-facing forms because its picker's "Today"
          shortcut is easy to hit by accident. This is an admin correcting
          one cell with an Undo toast one click away, not a member filling
          in a form they can't take back — and DateTimePicker is a modal
          dialog, which can't open from inside a row that is itself a
          click target for the drawer. */}
      <input
        type="date"
        autoFocus
        defaultValue={value ? new Date(value).toISOString().slice(0, 10) : ""}
        onBlur={() => setIsEditing(false)}
        onChange={(event) => {
          if (!event.target.value) return;
          onCommit(new Date(`${event.target.value}T12:00:00`).toISOString());
          setIsEditing(false);
        }}
        className="h-7 rounded-lg border border-surface-border bg-base px-2 text-xs text-copy-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
    </Stop>
  );
}
