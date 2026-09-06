"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/shared/date-time-picker";
import { hubPost } from "./hub-client";
interface Props {
  recordId: string;
  entityType: string;
  status: string;
  isAdmin: boolean;
  isOwner: boolean;
  canManageProject: boolean;
  members: { id: string; displayName: string }[];
  comments: {
    id: string;
    body: string;
    authorName: string;
    createdAt: string;
  }[];
  milestones: {
    id: string;
    title: string;
    dueAt: string;
    completed: boolean;
    blockedReason: string | null;
  }[];
}
export function RecordActions(props: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [blocked, setBlocked] = useState<Record<string, string>>({});
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const tab = action === "join" ? window.open("about:blank", "_blank") : null;
    if (tab) tab.opener = null;
    try {
      const result = await hubPost({ action, id: props.recordId, ...extra });
      if (action === "join" && typeof result.url === "string") {
        if (tab) tab.location.href = result.url;
        else window.location.assign(result.url);
      }
      setMessage(action === "accept" ? "Task accepted" : "Saved");
      if (action === "comment") {
        setText("");
        setMentions([]);
      }
      router.refresh();
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-brand">
          {message}
        </p>
      )}
      <div className="flex gap-3">
        {props.entityType === "task" && props.status !== "DONE" && (
          <Button disabled={busy} onClick={() => void act("accept")}>
            Accept task
          </Button>
        )}
        {props.entityType === "penalty" &&
          props.isOwner &&
          props.status === "OPEN" && (
            <Button disabled={busy} onClick={() => void act("claim_paid")}>
              Mark penalty paid
            </Button>
          )}
        {props.entityType === "transaction" &&
          props.isAdmin &&
          props.status === "PENDING" && (
            <Button disabled={busy} onClick={() => void act("approve")}>
              Approve transaction
            </Button>
          )}
        {props.entityType === "meeting" && (
          <Button disabled={busy} onClick={() => void act("join")}>
            Join meeting
          </Button>
        )}
      </div>
      {props.entityType === "project" && (
        <section className="space-y-4 rounded-2xl border border-surface-border bg-surface p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-copy-primary">
            Milestones
          </h2>
          {!props.milestones.length && (
            <p className="text-sm text-copy-secondary">
              No dated milestones yet.
            </p>
          )}
          {props.milestones.map((m) => (
            <div
              key={m.id}
              className="space-y-2 border-t border-surface-border pt-3"
            >
              <p className="font-medium">
                {m.title} ·{" "}
                {m.completed
                  ? "Completed"
                  : m.blockedReason
                    ? "Blocked"
                    : "Upcoming"}
              </p>
              <p className="text-sm text-copy-secondary">
                {new Date(m.dueAt).toLocaleDateString()}{" "}
                {m.blockedReason && `· ${m.blockedReason}`}
              </p>
              {props.canManageProject && !m.completed && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void act("milestoneComplete", { milestoneId: m.id })
                    }
                  >
                    Mark reached
                  </Button>
                  <Input
                    aria-label={`Blocked reason for ${m.title}`}
                    placeholder="What's blocking this?"
                    className="w-auto text-copy-primary!"
                    value={blocked[m.id] ?? ""}
                    onChange={(e) =>
                      setBlocked({ ...blocked, [m.id]: e.target.value })
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !blocked[m.id]?.trim()}
                    onClick={() =>
                      void act("milestoneBlock", {
                        milestoneId: m.id,
                        reason: blocked[m.id],
                      })
                    }
                  >
                    Mark blocked
                  </Button>
                </div>
              )}
            </div>
          ))}
          {props.canManageProject && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void act("milestone", { title, dueAt });
              }}
            >
              <label className="grid gap-2 text-sm font-medium">
                New milestone
                <Input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-copy-primary!"
                />
              </label>
              <DateTimePicker
                label="Due date"
                value={dueAt}
                onChange={setDueAt}
              />
              <Button disabled={busy || !dueAt || !title.trim()}>
                Add milestone
              </Button>
            </form>
          )}
        </section>
      )}
      <section className="space-y-4 rounded-2xl border border-surface-border bg-surface p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-copy-primary">
          Comments & mentions
        </h2>
        {!props.comments.length && (
          <p className="text-sm text-copy-secondary">Start the conversation.</p>
        )}
        {props.comments.map((c) => (
          <article key={c.id} className="border-t border-surface-border pt-3">
            <p className="text-sm font-semibold">
              {c.authorName}
              <span className="ml-2 font-normal text-copy-secondary">
                {new Date(c.createdAt).toLocaleString()}
              </span>
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-copy-primary">
              {c.body}
            </p>
          </article>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("comment", { text, mentions });
          }}
          className="grid gap-3"
        >
          <label className="grid gap-2 text-sm font-medium">
            Comment
            <Textarea
              required
              maxLength={5000}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="text-copy-primary!"
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm text-copy-secondary">
              Mention teammates (only people with access are notified)
            </legend>
            <div className="flex flex-wrap gap-3">
              {props.members.map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-brand"
                    checked={mentions.includes(member.id)}
                    onChange={(e) =>
                      setMentions((old) =>
                        e.target.checked
                          ? [...old, member.id]
                          : old.filter((id) => id !== member.id),
                      )
                    }
                  />
                  {member.displayName}
                </label>
              ))}
            </div>
          </fieldset>
          <Button disabled={busy || !text.trim()}>
            {busy ? "Saving…" : "Post comment"}
          </Button>
        </form>
      </section>
    </div>
  );
}
