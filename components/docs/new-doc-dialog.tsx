"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Plus, X } from "lucide-react";

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
import { collapseDocImages, expandDocImages } from "@/lib/collapse-doc-images";
import { SUPPORTED_EXTRACT_EXTENSIONS } from "@/lib/extract-document-text.constants";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

// Strips the extension off a filename to seed the Title field, e.g.
// "Sponsorship Deck.docx" -> "Sponsorship Deck".
function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

export function NewDocDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  // `content` is the DISPLAY value the Textarea shows — any embedded photos
  // are collapsed to short `![Image N](image-N)` placeholders. `imagesRef`
  // holds what each placeholder really expands back to at submit time. See
  // lib/collapse-doc-images.ts.
  const [content, setContent] = useState("");
  const imagesRef = useRef<Map<number, string>>(new Map());
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTitle("");
    setContent("");
    imagesRef.current = new Map();
    setSourceFile(null);
    setExtractError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileSelect(file: File) {
    setExtractError(null);
    setIsExtracting(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/docs/extract", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setExtractError(data.error ?? "Couldn't read that file.");
        return;
      }
      setSourceFile(file);
      const { display, images } = collapseDocImages(data.content);
      imagesRef.current = images;
      setContent(display);
      if (!title.trim()) setTitle(titleFromFileName(file.name));
    } catch {
      setExtractError("Couldn't read that file.");
    } finally {
      setIsExtracting(false);
    }
  }

  function clearSourceFile() {
    setSourceFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function createDoc() {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content: expandDocImages(content, imagesRef.current),
        }),
      });
      if (!response.ok) return;
      const { doc } = await response.json();

      // Keep the original upload attached too, so the source file stays
      // downloadable even though its text was copied into the content.
      if (sourceFile) {
        const attachFormData = new FormData();
        attachFormData.set("file", sourceFile);
        await fetch(`/api/docs/${doc.id}/attachments`, { method: "POST", body: attachFormData });
      }

      setIsOpen(false);
      reset();
      router.push(`/docs/${doc.id}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4" /> New Doc
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">New Doc</DialogTitle>
            <DialogDescription>
              Start a page — or upload a PDF/.docx to pull its text in, then keep editing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div>
              <label className={FIELD_LABEL_CLASS}>Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="text-copy-primary!"
              />
            </div>

            <div>
              <label className={FIELD_LABEL_CLASS}>Upload PDF or .docx (optional)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept={SUPPORTED_EXTRACT_EXTENSIONS.join(",")}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              {sourceFile ? (
                <div className="flex items-center justify-between rounded-xl border border-surface-border bg-subtle px-3 py-2">
                  <span className="truncate text-sm font-medium text-copy-primary">{sourceFile.name}</span>
                  <button
                    type="button"
                    onClick={clearSourceFile}
                    aria-label="Remove file"
                    className="shrink-0 text-copy-secondary hover:text-copy-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isExtracting}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="h-3.5 w-3.5" />
                  {isExtracting ? "Reading file…" : "Choose File"}
                </Button>
              )}
              {extractError && <p className="mt-1.5 text-xs font-medium text-error">{extractError}</p>}
            </div>

            <div>
              <label className={FIELD_LABEL_CLASS}>Content (Markdown, optional)</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder={isExtracting ? "Reading file…" : undefined}
                disabled={isExtracting}
                // Embedded photos are collapsed to short placeholders
                // before this ever renders (see collapseDocImages above),
                // so this shouldn't see a giant unbroken token in practice
                // — max-h/overflow-y-auto/break-all stay on anyway as a
                // safety net for any other long pasted/typed run, since
                // that's what actually blew this field (and, via
                // field-sizing-content, the whole Dialog) out to full-page
                // size with no scroll before. See 09-documentation.md.
                className="max-h-64 overflow-y-auto text-copy-primary! font-mono text-xs break-all"
              />
              <p className="mt-1 text-xs text-copy-secondary">
                Uploading a file fills this in from its text — review and edit it before creating,
                or after, any time. Photos show as short placeholders like{" "}
                <span className="font-mono">![Image 1](image-1)</span> here so this stays readable;
                the actual images still save with the doc. Delete a placeholder line to drop that
                photo.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSubmitting || isExtracting || title.trim() === ""}
                onClick={createDoc}
              >
                Create Doc
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
