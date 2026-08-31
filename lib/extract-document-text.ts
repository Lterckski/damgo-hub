import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import TurndownService from "turndown";

import { SUPPORTED_EXTRACT_EXTENSIONS } from "@/lib/extract-document-text.constants";

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

export class UnsupportedDocumentTypeError extends Error {}

// PDF text extraction has no real structure — it's just characters pdf-parse
// read off the page. Treating that raw as Markdown is what caused two real
// bugs: (1) an accidental `[...]()`/`![...]()`-shaped run of characters
// (extremely common in technical notes — set theory, SQL, math all lean on
// brackets and parens) gets parsed as a broken link/image; (2) unescaped
// `*`/`_`/`#`/etc. can trigger bold/italic/heading formatting nobody wrote.
// Escaping every Markdown-special character makes the source text render as
// itself, literally, with zero risk of accidental syntax.
const MARKDOWN_SPECIAL_CHARS = /[\\`*_{}[\]()#+\-!|>~]/g;
function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL_CHARS, (char) => `\\${char}`);
}

// "." isn't in MARKDOWN_SPECIAL_CHARS (escaping every period would mangle
// plain numbers like "3.14" for no reason) but "1. " at the very start of a
// line is CommonMark's ordered-list marker regardless — guard that one
// specific position instead.
function escapeLeadingOrdinal(line: string): string {
  return line.replace(/^(\s*)(\d+)\./, "$1$2\\.");
}

function renderMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const escapedRows = rows.map((row) => row.map((cell) => escapeMarkdown(cell.trim())));
  const columnCount = Math.max(...escapedRows.map((row) => row.length));
  const pad = (row: string[]) => Array.from({ length: columnCount }, (_, i) => row[i] ?? "");
  const [header, ...body] = escapedRows;
  const lines = [
    `| ${pad(header).join(" | ")} |`,
    `| ${pad(header)
      .map(() => "---")
      .join(" | ")} |`,
    ...body.map((row) => `| ${pad(row).join(" | ")} |`),
  ];
  return lines.join("\n");
}

/**
 * Pulls Markdown-ish text — and any embedded photos — out of an uploaded PDF
 * or .docx so it can seed a Doc's content field — used by the "New Doc"
 * flow's optional file upload (09-documentation.md). Not a full-fidelity
 * converter: PDFs lose layout entirely (plain text, paragraph breaks only)
 * since PDF has no structural markup to recover; .docx keeps
 * headings/lists/bold via mammoth -> HTML -> Markdown (turndown). Older
 * binary .doc isn't supported — mammoth only reads the zip-based .docx
 * format.
 *
 * Images come back as `![](data:image/…;base64,…)` Markdown, embedded right
 * in the returned text rather than uploaded anywhere separately — the doc
 * doesn't exist yet at extraction time (this runs before "Create Doc" is
 * even pressed), so there's no attachment to upload them to. This also
 * matches `Doc.content`'s own design: a single self-contained plain-text
 * Markdown field, no Blob storage (see `doc.prisma`) — a data URI is still
 * just text. Trade-off: a photo-heavy source file makes for a large content
 * row; fine for team documentation, not meant for scanned-book-sized PDFs.
 */
export async function extractDocumentText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".docx")) {
    // mammoth's default `convertImage` already embeds each image as a
    // `data:` URI right on the `<img>` it replaces, in place — turndown
    // then carries that straight through to `![](data:...)` at the same
    // spot in the Markdown, no extra wiring needed.
    const { value: html } = await mammoth.convertToHtml({ buffer });
    return turndown.turndown(html).trim();
  }

  if (name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      // pageJoiner: "" — otherwise pdf-parse appends a "-- N of M --" marker
      // after every page, which would leak into the doc's Markdown content.
      const { pages: textPages } = await parser.getText({ pageJoiner: "" });

      // Best-effort, not required: getTable() analyzes vector drawing
      // operators (real ruled/bordered tables — not just visually-aligned
      // whitespace) — confirmed working under this app's bundled server
      // (unlike getImage(), which doesn't — see below), so a real bordered
      // table like a symbol/definition reference table renders as an
      // actual Markdown table instead of one flattened, unreadable line.
      // Still wrapped in try/catch on principle, matching getImage()'s
      // pattern, in case some PDF's table geometry trips it up.
      let tablesByPage = new Map<number, string[][][]>();
      try {
        const { pages: tablePages } = await parser.getTable();
        tablesByPage = new Map(tablePages.map((page) => [page.num, page.tables]));
      } catch (error) {
        console.warn("PDF table extraction skipped (text still extracted)", error);
      }

      const text = textPages
        .map((page) => {
          const tables = tablesByPage.get(page.num) ?? [];
          // getText() emits one line per visual row, joining that row's
          // cells with a space (confirmed directly) — the same shape a
          // detected table's own rows join into. Filtering matching lines
          // out of the plain text before it renders avoids showing every
          // table's contents twice: once flattened, once as a real table.
          const tableLineSignatures = new Set(
            tables.flatMap((table) => table.map((row) => row.join(" ").trim().toLowerCase())),
          );

          const paragraphs = page.text
            .split(/\n{2,}/) // real paragraph breaks — where pdf-parse left a blank line
            .map((paragraph) =>
              paragraph
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line !== "" && !tableLineSignatures.has(line.toLowerCase()))
                .map((line) => escapeLeadingOrdinal(escapeMarkdown(line)))
                .join("  \n"), // two trailing spaces = a Markdown hard line break, so pdf-parse's own line breaks survive instead of every line inside a paragraph getting flattened into one run-on sentence — this was the "must keep the same format... so chaotic" bug
            )
            .filter(Boolean);

          const tableBlocks = tables.map(renderMarkdownTable).filter(Boolean);
          return [...paragraphs, ...tableBlocks].join("\n\n");
        })
        .filter(Boolean)
        .join("\n\n");

      // Best-effort, not required: getImage() renders each page's raster
      // content through pdf.js's worker, which throws a DataCloneError in
      // this app's bundled server route (confirmed directly — it fails
      // there even on a page with zero qualifying images, but the identical
      // call works fine outside the bundler in plain Node) — a pdf-parse/
      // Turbopack worker-transfer incompatibility, not something fixable
      // from here. Text extraction never depends on it, so a page's photos
      // just get skipped rather than the whole upload failing.
      let imagesSection = "";
      try {
        const { pages: imagePages } = await parser.getImage({ imageBuffer: false, imageDataUrl: true });
        // PDF text has no positional link to where an image sat on the
        // page, so images can't be interleaved the way .docx's can —
        // append them as their own section instead of guessing a spot.
        const images = imagePages.flatMap((page) => page.images);
        if (images.length > 0) {
          // image.name is a pdf.js-internal resource name, not user text,
          // but strip `[`/`]` defensively anyway — either would break the
          // `![alt](...)` syntax it's placed into.
          imagesSection = `\n\n## Images\n\n${images.map((image) => `![${image.name.replace(/[[\]]/g, "")}](${image.dataUrl})`).join("\n\n")}`;
        }
      } catch (error) {
        console.warn("PDF image extraction skipped (text still extracted)", error);
      }

      return `${text}${imagesSection}`.trim();
    } finally {
      await parser.destroy();
    }
  }

  throw new UnsupportedDocumentTypeError(
    `Unsupported file type — only ${SUPPORTED_EXTRACT_EXTENSIONS.join(" and ")} can be read into a doc's content.`,
  );
}
