"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  CheckSquare,
  Receipt,
  Users,
  Calendar,
  Folder,
  Lightbulb,
  Megaphone,
  Gavel,
  ArrowUpRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { hubGet, hubPost, type HubResult } from "./hub-client";
import type { CreateKind } from "./header-create-types";

export type { CreateKind } from "./header-create-types";
const icons = {
  task: CheckSquare,
  transaction: Receipt,
  member: Users,
  meeting: Calendar,
  project: Folder,
  idea: Lightbulb,
  announcement: Megaphone,
  penalty: Gavel,
  document: FileText,
};
const labels: Record<string, string> = {
  task: "Tasks",
  transaction: "Transactions",
  member: "Members",
  meeting: "Meetings",
  project: "Projects",
  idea: "Ideas",
  announcement: "Announcements",
  penalty: "Penalties",
  document: "Documents",
};
function Highlight({ text, query }: { text: string; query: string }) {
  const start = query
    ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
    : -1;
  return start < 0 ? (
    text
  ) : (
    <>
      {text.slice(0, start)}
      <mark className="rounded bg-accent-dim text-brand">
        {text.slice(start, start + query.length)}
      </mark>
      {text.slice(start + query.length)}
    </>
  );
}
interface Item {
  id: string;
  title: string;
  body?: string | null;
  entityType?: string;
  status?: string;
  url?: string;
  create?: CreateKind;
}
export function SearchPalette({
  open,
  onClose,
  isAdmin,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onCreate: (kind: CreateKind) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<{
    results?: HubResult[];
    recents?: HubResult[];
    needs?: HubResult[];
  }>({});
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [version, setVersion] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setPending(true);
        setError("");
        hubGet<typeof payload>(
          `mode=search&q=${encodeURIComponent(query)}`,
          controller.signal,
        )
          .then((data) => {
            if (!controller.signal.aborted) {
              setPayload(data);
              setActive(0);
            }
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setPending(false);
          });
      },
      query ? 150 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, version]);
  const groups: { title: string; items: Item[] }[] = query.trim()
    ? Object.entries(labels)
        .map(([type, title]) => ({
          title,
          items: (payload.results ?? []).filter((r) => r.entityType === type),
        }))
        .filter((g) => g.items.length)
    : [
        { title: "Recent", items: payload.recents ?? [] },
        {
          title: "Quick actions",
          items: (
            [
              ["task", "New task"],
              ["expense", "Log expense"],
              ["idea", "New idea"],
              ["meeting", "New meeting"],
            ] as [CreateKind, string][]
          ).map(([create, title]) => ({ id: create, title, create })),
        },
        { title: "Needs you", items: payload.needs ?? [] },
        {
          title: "Jump to",
          items: [
            "Dashboard",
            "Tasks",
            "Finance",
            "Calendar",
            "Projects",
            "Docs",
            ...(isAdmin ? ["Admin"] : []),
          ].map((title) => ({
            id: title,
            title,
            url: `/${title.toLowerCase()}`,
          })),
        },
      ];
  const all = groups.flatMap((g) => g.items);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  function choose(item: Item | undefined, newTab = false) {
    if (!item || pending) return;
    if (item.create) {
      onClose();
      onCreate(item.create);
      return;
    }
    if (item.url) {
      if (newTab) window.open(item.url, "_blank", "noopener,noreferrer");
      else router.push(item.url);
      onClose();
    }
  }
  let index = 0;
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] max-w-full flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[80vh] sm:max-w-2xl sm:rounded-3xl">
        <DialogTitle className="sr-only">Search Damgo Hub</DialogTitle>
        <DialogDescription className="sr-only">
          Find records, create something, or jump to a page. Use the arrow keys
          and Enter.
        </DialogDescription>
        <div className="flex items-center gap-3 border-b border-surface-border px-5 py-5 pr-12">
          <Search className="h-5 w-5 text-brand" />
          <input
            autoFocus
            aria-label="Search all records"
            role="combobox"
            aria-expanded="true"
            aria-controls="hub-results"
            aria-activedescendant={
              all[active] ? `search-item-${active}` : undefined
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPending(true);
              setActive(0);
            }}
            placeholder="Search anything…"
            className="min-w-0 flex-1 bg-transparent text-lg text-copy-primary outline-none"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) =>
                  all.length
                    ? (i + (event.key === "ArrowDown" ? 1 : -1) + all.length) %
                      all.length
                    : 0,
                );
              }
              if (event.key === "Enter") {
                event.preventDefault();
                choose(all[active], event.metaKey || event.ctrlKey);
              }
            }}
          />
        </div>
        <div
          ref={list}
          id="hub-results"
          role="listbox"
          aria-label="Search results and actions"
          aria-busy={pending}
          className="min-h-0 flex-1 overflow-y-auto p-3 sm:max-h-[58vh]"
        >
          {error && (
            <p role="alert" className="p-3 text-error">
              {error}
            </p>
          )}
          {pending && (
            <p role="status" className="p-3 text-copy-secondary">
              Searching…
            </p>
          )}
          {!pending && !error && query.trim() && !all.length && (
            <p className="p-6 text-copy-secondary">
              No matching records. Try a name, title, or a shorter phrase.
            </p>
          )}
          {!pending &&
            !error &&
            groups.map((group) => (
              <section
                key={group.title}
                aria-label={group.title}
                className="mb-3"
              >
                <div className="flex justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider text-copy-secondary">
                  <span>{group.title}</span>
                  {group.title === "Recent" && !!group.items.length && (
                    <button
                      className="text-brand hover:underline"
                      onClick={() =>
                        void hubPost({ action: "clearRecents" })
                          .then(() => setVersion((v) => v + 1))
                          .catch((e) => setError(e.message))
                      }
                    >
                      Clear recent
                    </button>
                  )}
                </div>
                {!group.items.length && (
                  <p className="px-3 py-2 text-sm text-copy-secondary">
                    {group.title === "Recent"
                      ? "Records you open will appear here."
                      : "You're all caught up."}
                  </p>
                )}
                {group.items.map((item) => {
                  const current = index++;
                  const Icon =
                    icons[item.entityType as keyof typeof icons] ??
                    ArrowUpRight;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      id={`search-item-${current}`}
                      role="option"
                      aria-selected={active === current}
                      data-index={current}
                      onMouseMove={() => setActive(current)}
                      onClick={(e) => choose(item, e.metaKey || e.ctrlKey)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand ${active === current ? "bg-accent-dim" : "hover:bg-subtle"}`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-brand" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-copy-primary">
                          <Highlight text={item.title} query={query.trim()} />
                        </div>
                        {item.body && (
                          <div className="truncate text-xs text-copy-secondary">
                            <Highlight text={item.body} query={query.trim()} />
                          </div>
                        )}
                      </div>
                      {item.status && (
                        <span className="shrink-0 rounded-md bg-subtle px-2 py-1 text-[10px] text-copy-secondary">
                          {item.status}
                        </span>
                      )}
                    </button>
                  );
                })}
              </section>
            ))}
        </div>
        <div className="border-t border-surface-border px-5 py-3 text-xs text-copy-secondary">
          ↑ ↓ Navigate · Enter Open · ⌘/Ctrl Enter New tab · Esc Close
        </div>
      </DialogContent>
    </Dialog>
  );
}
