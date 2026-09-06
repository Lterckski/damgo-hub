"use client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, X, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { hubGet, hubPost } from "./hub-client";
interface Notice {
  id: string;
  recordId: string;
  title: string;
  body: string;
  url: string;
  action: string;
  createdAt: string;
  read: boolean;
  inline: string | null;
  actor: { displayName: string; avatarUrl: string | null } | null;
}
const inlineLabels: Record<string, string> = {
  accept: "Accept task",
  claim_paid: "Mark penalty paid",
  approve: "Approve transaction",
  join: "Join meeting",
};
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });
const day = (value: string | Date) => dayFormatter.format(new Date(value));
export function NotificationBell() {
  const router = useRouter();
  const today = day(new Date());
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [data, setData] = useState<{ unread: number; items: Notice[] } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      clearTimeout(timer);
      if (disposed || inFlight) return;
      if (document.visibilityState !== "hidden" && navigator.onLine) {
        inFlight = true;
        try {
          const next = await hubGet<{ unread: number; items: Notice[] }>(
            `mode=notifications&filter=${filter}`,
            controller.signal,
          );
          if (!disposed) {
            setData(next);
            setError("");
            failures = 0;
          }
        } catch (e) {
          if (!disposed) {
            setError(
              e instanceof Error ? e.message : "Unable to load notifications",
            );
            failures++;
          }
        } finally {
          inFlight = false;
        }
      }
      if (!disposed)
        timer = setTimeout(refresh, Math.min(120000, 15000 * 2 ** failures));
    }
    refreshRef.current = refresh;
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("hub:refresh", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("hub:refresh", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [filter]);
  async function act(action: string, notice?: Notice) {
    if (busy) return;
    setBusy(notice?.id ?? action);
    setError("");
    // Open a blank tab in the click gesture; asynchronous join URL lookup
    // otherwise gets blocked as an unsolicited popup by browsers.
    const tab = action === "join" ? window.open("about:blank", "_blank") : null;
    if (tab) tab.opener = null;
    try {
      const result = await hubPost({
        action,
        id:
          action === "read" || action === "dismiss"
            ? notice?.id
            : notice?.recordId,
      });
      if (action === "join" && typeof result.url === "string") {
        if (tab) tab.location.href = result.url;
        else window.location.assign(result.url);
      }
      refreshRef.current();
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) refreshRef.current();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative shrink-0"
            aria-label="Notifications"
          />
        }
      >
        <Bell className="h-5 w-5" />
        {!data && !error && (
          <span className="absolute right-0 top-0 h-4 w-4 animate-pulse rounded-full bg-subtle" />
        )}
        {!!data?.unread && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand px-1 text-[10px] font-bold text-base"
          >
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
        <span
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {data
            ? `${data.unread} unread notifications`
            : "Loading notifications"}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(26rem,calc(100vw-1rem))] overflow-hidden rounded-2xl p-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
          <h2 className="font-semibold text-copy-primary">Notifications</h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy || !data?.unread}
            onClick={() => void act("read")}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        </div>
        <div
          className="flex gap-1 border-b border-surface-border px-3 pb-2"
          role="group"
          aria-label="Filter notifications"
        >
          {["all", "unread", "mentions"].map((tab) => (
            <button
              key={tab}
              aria-pressed={filter === tab}
              onClick={() => setFilter(tab)}
              className={`min-h-11 rounded-lg px-3 py-1.5 text-sm capitalize outline-none focus-visible:ring-2 focus-visible:ring-brand ${tab === filter ? "bg-accent-dim text-brand" : "text-copy-secondary"}`}
            >
              {tab}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="px-4 py-3 text-sm text-error">
            {error}
          </p>
        )}
        <div className="max-h-[65vh] overflow-y-auto">
          {!data && !error && (
            <p className="p-6 text-copy-secondary">
              Loading your notifications…
            </p>
          )}
          {data && !data.items.length && (
            <div className="px-6 py-10 text-center">
              <Bell className="mx-auto mb-3 h-7 w-7 text-brand" />
              <p className="font-medium text-copy-primary">
                You’re all caught up
              </p>
              <p className="mt-1 text-sm text-copy-secondary">
                Assignments, mentions, and team updates will appear here.
              </p>
            </div>
          )}
          {["Today", "Earlier"].map((group) => {
            const items =
              data?.items.filter(
                (n) =>
                  (day(n.createdAt) === today) ===
                  (group === "Today"),
              ) ?? [];
            return (
              items.length > 0 && (
                <section key={group}>
                  <h3 className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-copy-secondary">
                    {group}
                  </h3>
                  {items.map((n) => (
                    <article
                      key={n.id}
                      className={`flex gap-3 border-t border-surface-border px-4 py-3 ${n.read ? "" : "bg-accent-dim"}`}
                    >
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-subtle">
                        {n.actor?.avatarUrl ? (
                          <Avatar>
                            <AvatarImage src={n.actor.avatarUrl} alt="" />
                            <AvatarFallback>
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <User className="h-4 w-4 text-copy-secondary" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <button
                          className="block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          onClick={() => {
                            void hubPost({ action: "read", id: n.id })
                              .then(() => {
                                setOpen(false);
                                router.push(n.url);
                              })
                              .catch((e) => setError(e.message));
                          }}
                        >
                          <p className="text-xs text-copy-secondary">
                            {n.actor?.displayName ?? "Damgo Hub"} ·{" "}
                            {n.action
                              .split(".")
                              .slice(1)
                              .join(" ")
                              .replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 text-sm font-medium text-copy-primary">
                            {n.title}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-copy-secondary">
                            {n.body}
                          </p>
                          <p className="mt-2 text-[11px] text-copy-secondary">
                            {formatDistanceToNow(new Date(n.createdAt), {
                              addSuffix: true,
                            })}
                          </p>
                        </button>
                        {n.inline && (
                          <Button
                            className="mt-2"
                            variant="outline"
                            size="sm"
                            disabled={!!busy}
                            onClick={() => void act(n.inline!, n)}
                          >
                            {busy === n.id
                              ? "Working…"
                              : inlineLabels[n.inline]}
                          </Button>
                        )}
                      </div>
                      <button
                        className="h-6 rounded p-1 text-copy-secondary outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-brand"
                        aria-label={`Dismiss ${n.title}`}
                        disabled={!!busy}
                        onClick={() => void act("dismiss", n)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </article>
                  ))}
                </section>
              )
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
