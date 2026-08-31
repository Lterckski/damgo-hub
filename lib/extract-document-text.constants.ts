// Split out from extract-document-text.ts, which pulls in mammoth/pdf-parse
// (Node-only) — importing that file from a client component would drag
// those into the browser bundle. This one file is safe for either side.
export const SUPPORTED_EXTRACT_EXTENSIONS = [".pdf", ".docx"];
