# Documentation

## Goal

Build shared organizational documentation: schema, API, and UI, in one unit.

## Schema

Create `prisma/models/doc.prisma`.

Add `Doc`:

- `id`
- `title`
- `content` — Markdown, stored directly in the database (docs are plain text, not large generated artifacts — unlike attachments, they don't need Blob storage)
- `authorId` — relation to `Member`
- `projectId` — optional relation to `Project`, connected once `Project` exists (`11-project-proposals.md`)
- timestamps
- index on `projectId`

Add `DocAttachment`:

- `docId` relation, cascade delete
- `fileName`
- `filePath` — Vercel Blob URL
- `createdAt`

## Routes

Create REST endpoints under `app/api/docs`:

- `GET /api/docs` — list docs; support `?projectId=` filter
- `GET /api/docs/[docId]` — fetch one doc with its attachments
- `POST /api/docs` — create a doc
- `PATCH /api/docs/[docId]` — update title/content; author or Admin only
- `DELETE /api/docs/[docId]` — author or Admin only
- `POST /api/docs/[docId]/attachments` — upload a file to Vercel Blob, create a `DocAttachment` record
- `POST /api/docs/extract` — any authenticated member; reads an uploaded PDF or `.docx` and returns extracted Markdown-ish text (`{ content }`), without touching the database. Used by "New Doc" to seed the content field from an upload — see Document Upload below.

## Page

Create `app/(app)/docs/page.tsx` (list) and `app/(app)/docs/[docId]/page.tsx` (detail).

- list page: shadcn `Table` or card grid of docs — title, author, last updated
- detail page (`components/docs/doc-detail.tsx`): rendered Markdown content, attachment list with download links. **Edit is inline, not a popup** — clicking Edit (author/Admin only) swaps the title `<h1>` for an `Input` and the rendered content for a `Textarea` right where they already sit, with Save/Cancel replacing the Attach File/Edit/Delete buttons; nothing about the page moves or opens elsewhere. Changed from an earlier `Dialog`-based edit per explicit user feedback — a small fixed-size modal is a poor place to edit a document that can run to a full extracted PDF's worth of text, and it's also what made the field-blowout bug (see Document Upload below) so disruptive in the first place, since a `Dialog` has nowhere to grow. Delete still confirms in a small `Dialog` (a yes/no prompt has none of the "editing a long document" problem a modal was actually bad at).
- "New Doc" button on the list page opens a `Dialog`: title + initial content — this one stays a `Dialog`, since starting a new page is a short, bounded action unlike editing a potentially-long existing one

## Document Upload (create Docs from a PDF/.docx, text and photos both)

Per the user's explicit request, "New Doc" isn't limited to typing content by hand — it can pull the body, images included, in from an uploaded file:

- `lib/extract-document-text.ts` — `extractDocumentText(file: File): Promise<string>`, server-only (imports `mammoth` and `pdf-parse`, both Node-only). Dispatches on file extension:
  - **`.docx`** — `mammoth.convertToHtml` then `turndown` (HTML → Markdown), so headings/lists/bold survive. Images: mammoth's default `convertImage` behavior already embeds each one as a `data:` URI directly on the `<img>` it replaces, in place — turndown carries that straight through to `![](data:...)` at the same spot in the Markdown, no extra wiring.
  - **`.pdf`** — `pdf-parse`'s `PDFParse.getText({ pageJoiner: "" })`; PDFs have no structural markup to recover, so this is plain text only, page-number markers suppressed (`pageJoiner: ""`, otherwise pdf-parse appends a `-- N of M --` line per page). **Every line goes through `escapeMarkdown()`** (backslash-escapes every CommonMark-special character — `` \ ` * _ { } [ ] ( ) # + - ! | > ~ ``, plus a targeted guard on a leading `N.` ordinal) before it's treated as Markdown at all: raw PDF text is just characters pdf-parse read off the page, not real Markdown, and technical notes (set theory, SQL, math) are full of brackets/parens/asterisks that would otherwise get *parsed* as accidental link/image/bold/list syntax instead of showing as the literal characters they are — confirmed as a real bug, not a theoretical one (see Session Notes below). Lines within what pdf-parse still calls one "paragraph" (a run with no blank line) are joined with a Markdown hard break (two trailing spaces + newline) instead of being flattened into a single run-on sentence — pdf-parse's own line-break detection (`lineEnforce`, on by default) already does reasonable work here; collapsing it back out was the earlier bug. A genuine blank line in the source still becomes a real paragraph break. Images: `parser.getImage({ imageDataUrl: true })` appended as their own `## Images` section (PDF text has no positional link back to where an image sat on the page, so — unlike `.docx` — they can't be interleaved, only appended; each image's internal resource name is also stripped of `[`/`]` before being used as alt text) — **best-effort**: `getImage()` throws a `DataCloneError` specifically inside this app's bundled server route (confirmed directly: the identical call works in plain Node outside the bundler, and fails here even on a page with zero qualifying images) — a `pdf-parse`/Turbopack worker-transfer incompatibility, not something fixable from this codebase. Wrapped in its own `try/catch` so a PDF's images are skipped (`console.warn`, not thrown) rather than failing the whole extraction — text always comes through either way.
  - `.docx` doesn't need the same escaping — `turndown` (HTML → Markdown) already escapes any literal special character it finds in real text content as part of correctly round-tripping HTML to Markdown; this is standard, well-tested behavior for that kind of converter, not something added here.
  - `components/docs/markdown-content.tsx`'s `img` renderer also guards `src === ""` (not just non-string), and renders nothing rather than passing an empty `src` through — an empty `src` on a real DOM `<img>` makes the browser re-request the current page as an "image" (a distinct bug React itself warns about at runtime), which is what an unescaped `[Figure]()`\-shaped run of PDF text used to produce once parsed as a Markdown image with an empty destination.
  - **Real bordered tables render as real Markdown tables**, not a flattened line of cell text — `pdf-parse`'s `getTable()` detects tables by analyzing vector drawing operators (actual ruled/bordered tables, not just visually-aligned whitespace), confirmed working through this app's bundled server (unlike `getImage()`, which throws there — see above) via a direct test. `getText()` emits one line per visual row, joining that row's cells with a space; before a page's plain text is escaped/rendered, any line matching a detected table row's own `cells.join(" ")` (case-insensitive) is filtered out, so the table's content shows up once — as a table — not twice. Best-effort like `getImage()`: wrapped in its own `try/catch`, degrades to "no tables, text unaffected" rather than failing the whole extraction. `.docx` doesn't need this — mammoth/turndown already convert a real Word table to a Markdown table directly.
  - Neither format uploads extracted images anywhere separately (no attachment, no Blob) — they're embedded as base64 `data:` URIs directly inside the returned Markdown string. The doc doesn't exist yet at extraction time (this runs before "Create Doc" is even pressed), so there's no attachment to upload to; this also matches `Doc.content`'s own design as a single self-contained plain-text field (see `doc.prisma`) — a data URI is still just text. Trade-off: a photo-heavy source file makes for a large content row; fine for team documentation, not meant for scanned-book-sized PDFs.
  - anything else throws `UnsupportedDocumentTypeError` — older binary `.doc` isn't supported (`mammoth` only reads the zip-based `.docx` format).
  - `lib/extract-document-text.constants.ts` holds just `SUPPORTED_EXTRACT_EXTENSIONS` (`[".pdf", ".docx"]`) — split out so `new-doc-dialog.tsx` (a Client Component) can read the accepted-extensions list for its file `accept` attribute without pulling `mammoth`/`pdf-parse` into the browser bundle.
- `next.config.ts` sets `serverExternalPackages: ["pdf-parse", "mammoth"]` — required, not optional. `pdf-parse` (via `pdfjs-dist`) sets up a worker through a dynamic `import()` of `pdf.worker.mjs` resolved from `node_modules`; bundling it rewrites that into a nonexistent Turbopack chunk path and text extraction throws on every call without this. Confirmed by reproducing the exact failure first, then confirming the fix, both through the real dev server (not just a standalone Node script, which doesn't hit the same bundling path at all).
- `components/docs/markdown-content.tsx` gained an `img` component override (`max-w-full rounded-xl border`) so an embedded photo — from a `.docx` inline or a PDF's `## Images` section — renders sized to the doc's content column instead of at its native (possibly huge) pixel size.
- `NewDocDialog` (`components/docs/new-doc-dialog.tsx`) gained a "Choose File" control above the Content field. Selecting a file POSTs it to `/api/docs/extract`, fills the Content textarea with the result (still a normal editable textarea — review/edit before or after creating, same as typed content), and seeds Title from the filename if Title is still empty. The original file is kept: once the doc is created, it's also uploaded as a `DocAttachment` via the existing attachments route, so the source file stays downloadable even though its text/images were copied out.
- Extraction failures (corrupted file, unsupported type) show inline under the file control rather than blocking the rest of the dialog — Title/Content stay usable either way.
- **Fixed: a photo-heavy extraction could blow the whole Dialog out to full-page, unusable size — and per the user's follow-up ("simplify the markdown... not something users need to see"), photos are now collapsed to placeholders in the editable field entirely, not just CSS-contained.** A confirmed real bug, not theoretical — an embedded photo's base64 `data:` URI is one giant *unbroken* text token, and the generated `Textarea` uses `field-sizing: content` (auto-sizes the box to fit its value). With no `overflow-wrap` set, an unbreakable token can't be wrapped, so its min-content width is the token's full rendered length — which `field-sizing: content` then sizes the textarea (and, via CSS Grid's default `min-width: auto`, the whole `DialogContent`) to fit, edge-to-edge, with no scroll. A first pass (`overflow-wrap`/`break-words` on the textarea) only partially worked — the two utilities landed on the same CSS property at ambiguous cascade precedence and the box still blew out sideways — so the real fix goes further than CSS: `lib/collapse-doc-images.ts` (`collapseDocImages`/`expandDocImages`) swaps between the doc's real content (what's stored and rendered — unchanged, embedded `data:` URIs, same trade-off as before) and a **display** version the Textarea actually shows, where every `![alt](data:...)` collapses to a short `![Image N](image-N)` placeholder. Both `new-doc-dialog.tsx` and `doc-actions.tsx`'s Edit Doc dialog now hold the *display* string in state, expanding placeholders back to real content only at submit time; deleting a placeholder line drops that image, editing its label is fine (expansion keys off the `(image-N)` marker, not the bracket text). Verified the round-trip, delete, and relabel cases directly via a throwaway script before deleting it. `max-h-64 overflow-y-auto break-all` stays on both `Textarea`s and `max-h-[85vh] overflow-y-auto` stays on both `DialogContent`s as a safety net for any other long pasted/typed run, but the placeholder swap is what actually keeps the dialog visibly small and side-scroll-free for the normal case now.

## Google Drive Integration

Per the user's explicit request — and their explicit choice, when asked directly, between two levels of integration: not just picking a file from Drive, but a **live-embedded** Google editor right on the doc page, not just importing its text or linking out to Drive.

### Schema

`Doc` gained four nullable columns, always set together: `driveFileId`, `driveFileName`, `driveFileMimeType`, `driveFileUrl`. `content` (Markdown) isn't replaced by a Drive link — it stays available as a place for the team's own notes alongside the embedded file, not removed when one is attached.

### One-time setup (external, not app code) — same shape as `10-calendar.md`'s Google Calendar Sync

This rides on the same Clerk-managed Google connection Calendar Sync already uses, not a separate OAuth flow:

1. **Google Cloud Console** (the same project already used for Calendar Sync): enable the **Google Drive API** and the **Google Picker API**.
2. **Create an API key** (not the OAuth Client ID/Secret — a separate browser-facing key) under Credentials, and restrict it to the Picker API with an HTTP referrer restriction for the app's actual domain(s) — this key is intentionally exposed client-side (the Picker widget runs entirely in the browser; Google has no server-side Picker API), so the referrer restriction is what keeps it from being usable elsewhere.
3. Add that key to `.env` as `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` — the `NEXT_PUBLIC_` prefix is required (and correct here, unlike the Calendar Sync Client ID/Secret) since the Picker runs client-side.
4. **Clerk Dashboard → Google connection → additional scopes**: add `https://www.googleapis.com/auth/drive.file` (the same place `calendar.events` was added). This is Google's *per-file* scope — it only grants access to files a member explicitly opens through the Picker, not their whole Drive.
5. Same caveat as Calendar Sync: a member who connected Google **before** this scope was added needs to disconnect and reconnect via Clerk's account portal for it to take effect — existing connections don't retroactively pick up new scopes.

Until this is done, `DriveFilePicker` shows a clear inline message rather than silently failing — it checks for the env var itself before attempting anything.

### How it works

- `components/docs/drive-file-picker.tsx` — loads Google's `apis.google.com/js/api.js` script on demand (not on every page load), fetches the current member's Google access token from `GET /api/google/drive-token` (`lib/google-oauth-token.ts`'s existing `getMemberGoogleAccessToken`, reused as-is), then opens Google's own Picker widget (their hosted file-browser UI — not something built here) configured with that token and the API key. Returns `{ id, name, mimeType, url }` for whatever the member picks.
- **Only native Google Docs/Sheets/Slides get a live embedded editor** (`application/vnd.google-apps.document` / `.spreadsheet` / `.presentation`) — `lib/google-drive-embed.ts`'s `getGoogleDriveEmbedUrl()` returns `https://docs.google.com/{document|spreadsheets|presentation}/d/{id}/edit?embedded=true` for those three mime types, `null` for anything else (a PDF, an image, any other file living in Drive) — Drive simply has no generic live editor for those, so they get an "Open in Drive" link/card instead, not an iframe.
- **The Docs embed is well-documented and reliable; Sheets/Slides use the identical URL shape and are expected to work the same way, but that's not been confirmed in a real browser** — worth the doc owner actually checking once after linking a Sheet or Slide, rather than assuming.
- `doc-detail.tsx` renders the embed (a `70vh`-tall `<iframe>`) or the link card above the doc's own Markdown content — never in place of it — plus an "Open in Drive ↗" link either way. Attaching/replacing/removing the link is available inline whenever the doc is in edit mode, alongside the title/content fields, via the same `DriveFilePicker`.
- `NewDocDialog` gets the same picker, so a Drive file can be linked right at doc creation — if picked before Title is filled in, Title seeds from the Drive file's own name, same pattern as the PDF/docx upload flow.
- **A real, unavoidable limitation, not an oversight**: the embedded iframe is Google's own editor, so **Google's own sharing permissions decide who can actually edit inside it** — completely separate from who Damgo Hub considers a project collaborator. Linking a Drive file that's only shared with its owner means every other Damgo Hub member sees a Google permission wall inside the iframe despite having full access to the doc page itself. `NewDocDialog` and `doc-detail.tsx` both say this directly next to the picker — the doc owner needs to actually share the Drive file with the team (or set it to "anyone with the link can edit") for this to work as expected, and nothing in this app can do that sharing step for them.

## Check When Done

- docs can be created, edited by their author or an Admin, and browsed by anyone
- attachments upload to Vercel Blob and list correctly on the doc detail page
- Markdown content renders correctly
- uploading a PDF or `.docx` in "New Doc" fills the Content field with its extracted text (and embedded photos where the format allows), and the original file is kept as an attachment
- a member can link a Google Drive file from "New Doc" or from an existing doc's Edit mode; a native Docs/Sheets/Slides file renders as a live embedded editor, anything else as an "Open in Drive" link
- `npm run build` passes
