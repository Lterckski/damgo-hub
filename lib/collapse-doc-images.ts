/**
 * A doc's real Markdown content can hold embedded photos as
 * `![alt](data:image/png;base64,…)` — each one a single giant, unbreakable
 * text token. Showing that raw in an editable `Textarea` is what blew the
 * New Doc / Edit Doc dialogs out to full-page size (see 09-documentation.md)
 * and, separately, isn't something a person needs to look at to edit a doc.
 *
 * These two functions swap between the real content (what's actually
 * stored and rendered) and a display version (what the Textarea shows):
 * every `![alt](data:...)` collapses to a short `![Image N](image-N)`
 * placeholder for editing, and expands back before saving. Client-safe,
 * pure string functions — no server-only imports, used by both
 * `new-doc-dialog.tsx` and `doc-actions.tsx`.
 *
 * Deleting a placeholder line removes that image from the saved content
 * (nothing to expand back). Editing the bracketed label is fine — expansion
 * keys off the `(image-N)` marker, not the label text.
 */

const DATA_IMAGE_TAG = /!\[[^\]]*\]\(data:[^)]+\)/g;
const PLACEHOLDER_TAG = /!\[[^\]]*\]\(image-(\d+)\)/g;

export function collapseDocImages(markdown: string): { display: string; images: Map<number, string> } {
  const images = new Map<number, string>();
  let counter = 0;
  const display = markdown.replace(DATA_IMAGE_TAG, (match) => {
    counter += 1;
    images.set(counter, match);
    return `![Image ${counter}](image-${counter})`;
  });
  return { display, images };
}

export function expandDocImages(display: string, images: Map<number, string>): string {
  return display.replace(PLACEHOLDER_TAG, (match, indexStr) => images.get(Number(indexStr)) ?? match);
}
