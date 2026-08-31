"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DriveFilePicker, type PickedDriveFile } from "@/components/docs/drive-file-picker";

/**
 * "Import from Google Drive" — its own button on the docs list, separate
 * from "New Doc" (per explicit request), not a field buried inside that
 * dialog. Picking a file creates the doc immediately (title from the
 * Drive file's own name, content empty — a Drive-linked doc's real content
 * lives in the embed, see doc-detail.tsx) and goes straight to it.
 */
export function ImportFromDriveButton() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(file: PickedDriveFile) {
    setError(null);
    setIsCreating(true);
    try {
      const response = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: file.name, content: "", driveFile: file }),
      });
      if (!response.ok) {
        setError("Couldn't create the doc from that file.");
        return;
      }
      const { doc } = await response.json();
      router.push(`/docs/${doc.id}`);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div>
      <DriveFilePicker
        onPick={handlePick}
        disabled={isCreating}
        busyLabel={isCreating ? "Creating…" : undefined}
        variant="default"
        size="default"
      />
      {error && <p className="mt-1.5 text-xs font-medium text-error">{error}</p>}
    </div>
  );
}
