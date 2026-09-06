"use client";

import * as React from "react";
import { Megaphone } from "lucide-react";

import { sendBroadcastRequest } from "@/lib/admin/client";
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
import { useToast } from "@/components/ui/toast";

/**
 * Part 2's broadcast composer — all members, one role, one project, or one
 * person.
 *
 * The audience is sent as an intent ("everyone with org:admin"), never as
 * a resolved recipient list: the server expands it against the live Clerk
 * roster, so a broadcast can't reach someone who left the org between the
 * page loading and Send being pressed.
 */

interface BroadcastComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: { id: string; displayName: string }[];
  projects: { id: string; name: string }[];
}

type Audience = "ALL_MEMBERS" | "ROLE" | "PROJECT" | "MEMBER";

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "ALL_MEMBERS", label: "Everyone" },
  { value: "ROLE", label: "One role" },
  { value: "PROJECT", label: "One project" },
  { value: "MEMBER", label: "One member" },
];

export function BroadcastComposer({
  open,
  onOpenChange,
  members,
  projects,
}: BroadcastComposerProps) {
  const { toast } = useToast();
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState<Audience>("ALL_MEMBERS");
  const [audienceRole, setAudienceRole] = React.useState("org:member");
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [memberId, setMemberId] = React.useState(members[0]?.id ?? "");
  const [isSending, setIsSending] = React.useState(false);

  /**
   * Clears on close rather than on open — same result, no effect watching
   * `open` and re-rendering the whole form to do it.
   */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setSubject("");
      setBody("");
      setAudience("ALL_MEMBERS");
    }
    onOpenChange(next);
  }

  const canSend =
    subject.trim() !== "" &&
    body.trim() !== "" &&
    !isSending &&
    (audience !== "PROJECT" || projectId !== "") &&
    (audience !== "MEMBER" || memberId !== "");

  async function send() {
    setIsSending(true);
    try {
      const result = await sendBroadcastRequest({
        subject,
        body,
        audience,
        audienceRole: audience === "ROLE" ? audienceRole : null,
        projectId: audience === "PROJECT" ? projectId : null,
        audienceMemberId: audience === "MEMBER" ? memberId : null,
      });
      toast({ message: result.message, tone: result.ok ? "success" : "error" });
      if (result.ok) handleOpenChange(false);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-copy-primary">
            <Megaphone className="h-4 w-4 text-brand" />
            Broadcast
          </DialogTitle>
          <DialogDescription className="text-copy-secondary">
            Sends an in-app notification. Recipients are resolved from the live Clerk roster when
            you send.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Audience">
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={audience === option.value ? "default" : "outline"}
                  onClick={() => setAudience(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </Field>

          {audience === "ROLE" && (
            <Field label="Role">
              <NativeSelect value={audienceRole} onChange={setAudienceRole}>
                <option value="org:member">Members</option>
                <option value="org:admin">Admins</option>
              </NativeSelect>
            </Field>
          )}

          {audience === "PROJECT" && (
            <Field label="Project">
              <NativeSelect value={projectId} onChange={setProjectId}>
                {projects.length === 0 && <option value="">No projects yet</option>}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          {audience === "MEMBER" && (
            <Field label="Member">
              <NativeSelect value={memberId} onChange={setMemberId}>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          <Field label="Subject">
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="text-copy-primary!"
              placeholder="Dues due Friday"
            />
          </Field>

          <Field label="Message">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              className="text-copy-primary!"
              placeholder="What does everyone need to know?"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!canSend}>
            {isSending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold tracking-wide text-copy-primary uppercase">{label}</span>
      {children}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-xl border border-surface-border bg-base px-3 text-sm text-copy-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {children}
    </select>
  );
}
