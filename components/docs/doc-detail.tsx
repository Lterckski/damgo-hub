"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, HardDrive, Paperclip, Pencil, Trash2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BackButton } from "@/components/shared/back-button";
import { DriveFilePicker, type PickedDriveFile } from "@/components/docs/drive-file-picker";
import { MarkdownContent } from "@/components/docs/markdown-content";
import { collapseDocImages, expandDocImages } from "@/lib/collapse-doc-images";
import { getGoogleDriveEmbedUrl } from "@/lib/google-drive-embed";
import { cn } from "@/lib/utils";
import type { SerializedDoc, SerializedDocAttachment } from "@/lib/docs";

interface DocDetailProps {
  doc: SerializedDoc;
  attachments: SerializedDocAttachment[];
  canEdit: boolean;
}

/**
 * Owns the whole doc page below the top nav — title, meta, actions, content,
 * attachments — as one client component so Edit can swap the title/content
 * straight into editable fields in place, rather than opening a popup. A
 * long extracted document is awkward to edit in a small modal; editing where
 * it's actually read fixes that, per the user's explicit request.
 */
export function DocDetail({ doc, attachments, canEdit }: DocDetailProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(doc.title);
  // Same collapse-for-display / expand-on-save treatment as new-doc-dialog.tsx
  // (lib/collapse-doc-images.ts) — the raw content can hold embedded photos
  // as giant base64 tokens, not something to show while editing.
  const [displayContent, setDisplayContent] = useState("");
  const imagesRef = useRef<Map<number, string>>(new Map());
  const [driveFile, setDriveFile] = useState<PickedDriveFile | null>(
    doc.driveFileId
      ? { id: doc.driveFileId, name: doc.driveFileName ?? "Drive file", mimeType: doc.driveFileMimeType ?? "", url: doc.driveFileUrl ?? "" }
      : null,
  );

  function startEditing() {
    setTitle(doc.title);
    const { display, images } = collapseDocImages(doc.content);
    imagesRef.current = images;
    setDisplayContent(display);
    setDriveFile(
      doc.driveFileId
        ? { id: doc.driveFileId, name: doc.driveFileName ?? "Drive file", mimeType: doc.driveFileMimeType ?? "", url: doc.driveFileUrl ?? "" }
        : null,
    );
    setIsEditing(true);
  }

  async function save() {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/docs/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content: expandDocImages(displayContent, imagesRef.current),
          driveFile,
        }),
      });
      if (response.ok) {
        setIsEditing(false);
        router.refresh();
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteDoc() {
    setIsSaving(true);
    try {
      await fetch(`/api/docs/${doc.id}`, { method: "DELETE" });
      router.push("/docs");
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadAttachment(file: File) {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      await fetch(`/api/docs/${doc.id}/attachments`, { method: "POST", body: formData });
      router.refresh();
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    // A linked Drive file gets a wider column (max-w-5xl vs the usual
    // max-w-3xl reading width) — a live editor benefits from the extra
    // horizontal room the way prose doesn't, per the user's "fill out the
    // page even more" ask.
    <div className={cn("mx-auto p-6", doc.driveFileId ? "max-w-5xl" : "max-w-3xl")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <BackButton />
            {isEditing ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="font-display h-auto py-1 text-3xl text-copy-primary!"
              />
            ) : (
              <h1 className="font-display text-3xl text-copy-primary">{doc.title}</h1>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-copy-secondary">
            {doc.authorName} · updated {new Date(doc.updatedAt).toLocaleDateString()}
          </p>
        </div>

        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            {isEditing ? (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" disabled={isSaving || title.trim() === ""} onClick={save}>
                  Save
                </Button>
              </>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAttachment(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" /> {isUploading ? "Uploading…" : "Attach File"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={startEditing}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-error"
                  onClick={() => setIsDeleting(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Google Drive link — a live embedded editor for a native Docs/
          Sheets/Slides file, or just an "Open in Drive" card for anything
          else Drive has no in-place editor for. Shown even while editing
          the rest of the page, since attaching/replacing/removing it is
          its own thing, not tied to Save. */}
      {isEditing ? (
        <div className="mt-6 rounded-2xl border border-surface-border bg-surface p-4">
          <p className="mb-1.5 text-xs font-bold tracking-wide text-copy-primary uppercase">
            Google Drive link
          </p>
          {driveFile ? (
            <div className="flex items-center justify-between rounded-xl border border-surface-border bg-subtle px-3 py-2">
              <span className="flex items-center gap-2 truncate text-sm font-medium text-copy-primary">
                <HardDrive className="h-4 w-4 shrink-0 text-copy-secondary" />
                {driveFile.name}
              </span>
              <button
                type="button"
                onClick={() => setDriveFile(null)}
                aria-label="Remove Drive link"
                className="shrink-0 text-copy-secondary hover:text-copy-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <DriveFilePicker onPick={setDriveFile} />
          )}
        </div>
      ) : (
        doc.driveFileId && (
          <div className="mt-6">
            {(() => {
              const embedUrl = getGoogleDriveEmbedUrl(doc.driveFileId, doc.driveFileMimeType ?? "");
              return (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-copy-primary uppercase">
                      <HardDrive className="h-3.5 w-3.5" />
                      {embedUrl ? "Linked Google Drive file — editable below" : "Linked Google Drive file"}
                    </p>
                    <a
                      href={doc.driveFileUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                    >
                      Open in Drive <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {embedUrl ? (
                    <iframe
                      src={embedUrl}
                      title={doc.driveFileName ?? "Linked Google Drive file"}
                      className="h-[88vh] w-full rounded-2xl border border-surface-border"
                    />
                  ) : (
                    <a
                      href={doc.driveFileUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-2xl border border-surface-border bg-surface px-4 py-3 text-sm font-medium text-copy-primary transition-colors hover:border-brand/40"
                    >
                      <HardDrive className="h-4 w-4 text-copy-secondary" />
                      {doc.driveFileName ?? "Open in Google Drive"}
                    </a>
                  )}
                </>
              );
            })()}
          </div>
        )
      )}

      <div className="mt-6 rounded-2xl border border-surface-border bg-surface p-6">
        {isEditing ? (
          <>
            <Textarea
              value={displayContent}
              onChange={(e) => setDisplayContent(e.target.value)}
              rows={20}
              // No max-h cap here (unlike the New Doc / old Edit dialogs) —
              // this now lives in the normal page flow, not a fixed-position
              // Dialog, so a tall field just makes the page taller instead
              // of blowing anything out. break-all stays as a safety net
              // for any long pasted/typed run.
              className="w-full text-copy-primary! font-mono text-xs break-all"
            />
            <p className="mt-2 text-xs text-copy-secondary">
              Photos show as short placeholders like{" "}
              <span className="font-mono">![Image 1](image-1)</span> here so this stays readable;
              the actual images still save with the doc. Delete a placeholder line to drop that
              photo.
            </p>
          </>
        ) : doc.content.trim() === "" ? (
          <p className="text-sm text-copy-secondary">This doc has no content yet.</p>
        ) : (
          <MarkdownContent content={doc.content} />
        )}
      </div>

      {attachments.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-bold tracking-wide text-copy-primary uppercase">
            Attachments
          </p>
          <ul className="space-y-2">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <a
                  href={`/api/docs/${doc.id}/attachments/${attachment.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm font-medium text-copy-primary transition-colors hover:border-brand/40"
                >
                  <Paperclip className="h-4 w-4 text-copy-secondary" />
                  {attachment.fileName}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">Delete this doc?</DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsDeleting(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={isSaving} onClick={deleteDoc}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
