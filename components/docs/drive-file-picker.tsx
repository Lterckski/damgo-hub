"use client";

import { useState } from "react";
import { HardDrive } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface PickedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
}

// Native Google Docs/Sheets/Slides — the only mime types Google itself
// offers a live embeddable *editor* for (see doc-detail.tsx). Anything else
// picked (a PDF, an image, an arbitrary uploaded file living in Drive)
// still gets linked, just as an "Open in Drive" reference, not an embed.
export const GOOGLE_EDITABLE_MIME_TYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
];

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
    google?: {
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new (viewId?: string) => GooglePickerView;
        ViewId: { DOCS: string };
        Action: { PICKED: string };
        Response: { ACTION: string; DOCUMENTS: string };
        Document: { ID: string; NAME: string; MIME_TYPE: string; URL: string };
      };
    };
  }
}

interface GooglePickerView {
  setIncludeFolders?: (include: boolean) => GooglePickerView;
}

interface GooglePickerBuilder {
  addView: (view: GooglePickerView) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setCallback: (callback: (data: Record<string, unknown>) => void) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

let scriptLoadPromise: Promise<void> | null = null;

function loadGoogleApiScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.gapi) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google's API script"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

interface DriveFilePickerProps {
  onPick: (file: PickedDriveFile) => void;
  disabled?: boolean;
  /** Overrides the button label while `disabled` — e.g. "Creating…" while
   * a caller's own onPick handler is still doing something (like creating
   * a doc) after the picker itself has already closed. */
  busyLabel?: string;
  /** "outline"/"sm" (default) for a secondary spot like inline doc editing;
   * "default"/"default" for a standalone primary action like the docs
   * list's own button, so it matches "New Doc" next to it. */
  variant?: "default" | "outline";
  size?: "default" | "sm";
}

/**
 * "Import from Google Drive" button — opens Google's own Picker widget
 * (their hosted file-browser UI, not something we build) so a member can
 * select a file from their Drive. Requires external setup — see
 * 09-documentation.md's Google Drive Integration section — until then this
 * shows a clear message instead of silently doing nothing.
 */
export function DriveFilePicker({
  onPick,
  disabled,
  busyLabel,
  variant = "outline",
  size = "sm",
}: DriveFilePickerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPicker() {
    setError(null);
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
    if (!apiKey) {
      setError("Google Drive isn't set up yet — ask whoever manages the Google Cloud project to add it.");
      return;
    }

    setIsLoading(true);
    try {
      const tokenResponse = await fetch("/api/google/drive-token");
      if (!tokenResponse.ok) {
        setError("Connect Google first — via your account portal (the same connection Calendar Sync uses).");
        return;
      }
      const { accessToken } = await tokenResponse.json();

      await loadGoogleApiScript();
      await new Promise<void>((resolve) => window.gapi!.load("picker", resolve));

      const picker = window.google!.picker;
      new picker.PickerBuilder()
        .addView(new picker.DocsView(picker.ViewId.DOCS))
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setCallback((data: Record<string, unknown>) => {
          if (data[picker.Response.ACTION] !== picker.Action.PICKED) return;
          const docs = data[picker.Response.DOCUMENTS] as Record<string, string>[];
          const doc = docs[0];
          onPick({
            id: doc[picker.Document.ID],
            name: doc[picker.Document.NAME],
            mimeType: doc[picker.Document.MIME_TYPE],
            url: doc[picker.Document.URL],
          });
        })
        .build()
        .setVisible(true);
    } catch {
      setError("Couldn't open the Google Drive picker.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <Button type="button" variant={variant} size={size} disabled={disabled || isLoading} onClick={openPicker}>
        <HardDrive className={size === "default" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {busyLabel ?? (isLoading ? "Opening…" : "Import from Google Drive")}
      </Button>
      {error && <p className="mt-1.5 text-xs font-medium text-error">{error}</p>}
    </div>
  );
}
