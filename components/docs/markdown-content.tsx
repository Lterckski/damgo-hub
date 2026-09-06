import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders Doc content as Markdown. No `@tailwindcss/typography` plugin —
 * component overrides map every element to our own tokens directly, same
 * "no hardcoded colors" rule as everywhere else (ui-context.md).
 */
export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-copy-secondary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-6 text-2xl font-bold text-copy-primary first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 text-xl font-bold text-copy-primary first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 text-base font-bold text-copy-primary first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="text-copy-secondary">{children}</p>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand hover:underline"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => {
            // Guard an empty string too, not just non-string — an
            // accidental `[...]()`-shaped run in extracted PDF text used to
            // parse as a real (empty-src) image node before extraction
            // started escaping Markdown special characters; `src=""` makes
            // React re-request the current page as an "image" (a real,
            // separate bug React itself warns about), so skip rendering
            // entirely rather than pass that through.
            if (typeof src !== "string" || src === "") return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element -- data: URIs (from doc-upload extraction) and arbitrary remote URLs both need a plain <img>, not next/image's fixed-domain optimizer.
              <img src={src} alt={alt ?? ""} className="max-w-full rounded-xl border border-surface-border" />
            );
          },
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="text-copy-secondary">{children}</li>,
          strong: ({ children }) => <strong className="font-bold text-copy-primary">{children}</strong>,
          code: ({ children }) => (
            <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-xs text-copy-primary">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-xl bg-subtle p-3 font-mono text-xs text-copy-primary">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-brand pl-3 text-copy-secondary italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-surface-border" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-surface-border px-2 py-1.5 text-left font-bold text-copy-primary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-surface-border-subtle px-2 py-1.5 text-copy-secondary">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
