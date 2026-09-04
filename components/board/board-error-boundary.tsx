"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

interface BoardErrorBoundaryProps {
  children: ReactNode;
  /** e.g. "roadmap board", "ideas board" — used in the fallback copy. */
  boardLabel: string;
  /** Matches the board's own fixed height so the fallback doesn't jump the layout. */
  heightClassName?: string;
}

interface BoardErrorBoundaryState {
  hasError: boolean;
  retryKey: number;
}

/**
 * Catches render, connection, and auth failures anywhere in a
 * collaborative board's Liveblocks provider tree — generic across every
 * board surface (originally built for the roadmap board in
 * 13-roadmap-board.md as `RoadmapErrorBoundary`, extracted here for
 * 19-ideas-board.md to reuse as-is rather than duplicate). A regular
 * try/catch can't see errors thrown while React renders descendants; an
 * error boundary can.
 */
export class BoardErrorBoundary extends Component<BoardErrorBoundaryProps, BoardErrorBoundaryState> {
  state: BoardErrorBoundaryState = { hasError: false, retryKey: 0 };

  static getDerivedStateFromError(): Pick<BoardErrorBoundaryState, "hasError"> {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={`flex ${this.props.heightClassName ?? "h-[34rem]"} flex-col items-center justify-center gap-3 rounded-2xl border border-surface-border bg-surface text-center`}
        >
          <AlertTriangle className="h-6 w-6 text-error" />
          <p className="text-sm font-medium text-copy-primary">Couldn&apos;t load the {this.props.boardLabel}.</p>
          <p className="max-w-xs text-xs text-copy-secondary">
            Try again or reload the page. If the problem continues, contact an admin.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => this.setState((s) => ({ hasError: false, retryKey: s.retryKey + 1 }))}
          >
            Try again
          </Button>
        </div>
      );
    }

    // Keying on retryKey forces a full remount of the RoomProvider /
    // ClientSideSuspense subtree on retry, not just a re-render — a plain
    // re-render would immediately re-throw the same stale error.
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}
