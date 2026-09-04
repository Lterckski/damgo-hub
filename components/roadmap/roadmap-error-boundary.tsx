"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

interface RoadmapErrorBoundaryProps {
  children: ReactNode;
}

interface RoadmapErrorBoundaryState {
  hasError: boolean;
  retryKey: number;
}

/**
 * Catches connection/auth failures thrown by ClientSideSuspense's
 * suspense-mode hooks (useLiveblocksFlow({ suspense: true }), etc.) — see
 * 13-roadmap-board.md's "an error fallback for connection issues". A
 * regular try/catch can't see these; React error boundaries are the only
 * mechanism that can.
 */
export class RoadmapErrorBoundary extends Component<RoadmapErrorBoundaryProps, RoadmapErrorBoundaryState> {
  state: RoadmapErrorBoundaryState = { hasError: false, retryKey: 0 };

  static getDerivedStateFromError(): Pick<RoadmapErrorBoundaryState, "hasError"> {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[34rem] flex-col items-center justify-center gap-3 rounded-2xl border border-surface-border bg-surface text-center">
          <AlertTriangle className="h-6 w-6 text-error" />
          <p className="text-sm font-medium text-copy-primary">Couldn&apos;t connect to the roadmap board.</p>
          <p className="max-w-xs text-xs text-copy-secondary">
            This is usually a dropped connection — try reloading the page.
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
