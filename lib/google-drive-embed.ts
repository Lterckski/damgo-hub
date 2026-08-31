import { GOOGLE_EDITABLE_MIME_TYPES } from "@/components/docs/drive-file-picker";

/**
 * The live-embeddable edit URL for a native Google Docs/Sheets/Slides file
 * — `null` for any other mime type, since Drive has no generic live editor
 * for arbitrary files (a PDF, an image, a plain uploaded file). The `/edit
 * ?embedded=true` pattern is well-documented for Docs; Sheets and Slides
 * use the same shape and it's expected to work the same way, but — unlike
 * Docs — that's not something confirmable without a real browser, so it's
 * worth the doc owner actually checking once after linking a Sheet/Slide.
 * See 09-documentation.md's Google Drive Integration section.
 */
export function getGoogleDriveEmbedUrl(fileId: string, mimeType: string): string | null {
  if (!GOOGLE_EDITABLE_MIME_TYPES.includes(mimeType)) return null;
  switch (mimeType) {
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${fileId}/edit?embedded=true`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${fileId}/edit?embedded=true`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${fileId}/edit?embedded=true`;
    default:
      return null;
  }
}
