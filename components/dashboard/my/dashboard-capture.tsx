"use client";

import * as React from "react";

import {
  QuickCapture,
  type CaptureKind,
} from "@/components/dashboard/my/quick-capture";

interface DashboardCaptureContextValue {
  openCapture: (kind: CaptureKind) => void;
}

const DashboardCaptureContext = React.createContext<
  DashboardCaptureContextValue | undefined
>(undefined);

/** Owns only the shared quick-capture state; server-rendered cards stay children. */
export function DashboardCaptureProvider({
  financeCategories,
  ideasEnabled,
  children,
}: {
  financeCategories: string[];
  ideasEnabled: boolean;
  children: React.ReactNode;
}) {
  const [captureKind, setCaptureKind] = React.useState<CaptureKind | null>(null);
  const value = React.useMemo(
    () => ({ openCapture: setCaptureKind }),
    [],
  );

  return (
    <DashboardCaptureContext.Provider value={value}>
      <div className="flex items-center justify-between gap-3">
        <QuickCapture
          financeCategories={financeCategories}
          ideasEnabled={ideasEnabled}
          openKind={captureKind}
          onOpenKindChange={setCaptureKind}
        />
      </div>
      {children}
    </DashboardCaptureContext.Provider>
  );
}

export function useDashboardCapture(): DashboardCaptureContextValue {
  const context = React.useContext(DashboardCaptureContext);
  if (!context) {
    throw new Error("useDashboardCapture must be used inside its provider");
  }
  return context;
}
