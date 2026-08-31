"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ReceiptFileInputProps {
  name: string;
  accept?: string;
}

/**
 * A native `<input type="file">`'s "No file chosen" text renders through
 * the browser's own UA shadow root in Chrome/Safari — it ignores author
 * `color` entirely, no CSS override can fix it (see ui-context.md's
 * Contrast rule). This hides the native control and renders our own
 * styled trigger button + filename text instead, fully under our tokens.
 */
export function ReceiptFileInput({ name, accept }: ReceiptFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        name={name}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Paperclip className="h-3.5 w-3.5" /> Choose File
      </Button>
      <span className="truncate text-sm text-copy-secondary">
        {fileName ?? "No file chosen"}
      </span>
    </div>
  );
}
