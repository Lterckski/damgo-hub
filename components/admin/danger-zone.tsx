"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";

import { runDangerAction } from "@/lib/admin/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ReasonDialog, type ReasonRequest } from "@/components/admin/reason-dialog";

/**
 * Part 2's Danger Zone. Each action is behind a type-the-name confirmation
 * plus a required reason.
 *
 * Neither guard is decorative: the API re-checks the typed confirmation
 * against the target's real name and rejects a missing reason, so the
 * dialog is the polite half of the rule rather than the enforcing half.
 */

interface DangerZoneProps {
  members: { id: string; displayName: string; isLeader: boolean }[];
  projects: { id: string; name: string; status: string }[];
  currentMemberId: string;
  onDone: () => void;
}

export function DangerZone({ members, projects, currentMemberId, onDone }: DangerZoneProps) {
  const { toast } = useToast();
  const [request, setRequest] = React.useState<ReasonRequest | null>(null);

  const removableMembers = members.filter(
    (member) => !member.isLeader && member.id !== currentMemberId,
  );
  const archivableProjects = projects.filter((project) => project.status !== "ARCHIVED");

  const [memberId, setMemberId] = React.useState(removableMembers[0]?.id ?? "");
  const [projectId, setProjectId] = React.useState(archivableProjects[0]?.id ?? "");

  async function run(payload: Record<string, unknown>, reason: string) {
    const result = await runDangerAction({ ...payload, reason });
    toast({ message: result.message, tone: result.ok ? "success" : "error" });
    if (result.ok) onDone();
  }

  const selectedMember = removableMembers.find((member) => member.id === memberId);
  const selectedProject = archivableProjects.find((project) => project.id === projectId);

  return (
    <>
      <div className="rounded-2xl bg-surface ring-1 ring-state-error/30">
        <div className="flex items-center gap-2 border-b border-state-error/20 px-5 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-state-error/10 text-state-error">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <h3 className="text-xs font-bold tracking-[0.08em] text-copy-primary uppercase">
            Danger zone
          </h3>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-3">
          <Row
            title="Remove member"
            description="Revokes their Clerk org access and marks the local record Removed. Their tasks, docs and financial history stay attributed to them."
          >
            {removableMembers.length === 0 ? (
              <p className="text-sm text-copy-muted">
                No one can be removed — the Leader&apos;s seat is fixed and you can&apos;t remove yourself.
              </p>
            ) : (
              <>
                <Select value={memberId} onChange={setMemberId}>
                  {removableMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!selectedMember}
                  onClick={() =>
                    selectedMember &&
                    setRequest({
                      title: `Remove ${selectedMember.displayName}?`,
                      description:
                        "They lose access to the organization immediately. Their authored content is kept and stays attributed to them.",
                      confirmLabel: "Remove member",
                      destructive: true,
                      confirmationPhrase: selectedMember.displayName,
                      onConfirm: (reason) =>
                        run({ action: "member.remove", targetId: selectedMember.id }, reason),
                    })
                  }
                >
                  Remove…
                </Button>
              </>
            )}
          </Row>

          <Row
            title="Archive project"
            description="Hides it from active views. Tasks, docs and links are preserved."
          >
            {archivableProjects.length === 0 ? (
              <p className="text-sm text-copy-muted">Every project is already archived.</p>
            ) : (
              <>
                <Select value={projectId} onChange={setProjectId}>
                  {archivableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!selectedProject}
                  onClick={() =>
                    selectedProject &&
                    setRequest({
                      title: `Archive ${selectedProject.name}?`,
                      description: "It disappears from active project views. Nothing is deleted.",
                      confirmLabel: "Archive project",
                      destructive: true,
                      confirmationPhrase: selectedProject.name,
                      onConfirm: (reason) =>
                        run({ action: "project.archive", targetId: selectedProject.id }, reason),
                    })
                  }
                >
                  Archive…
                </Button>
              </>
            )}
          </Row>

          <Row
            title="Reset cycle"
            description="Archives every completed project and waives every past-due penalty. The financial ledger is cumulative and is never touched."
          >
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                setRequest({
                  title: "Reset the cycle?",
                  description:
                    "Completed projects are archived and past-due open penalties are waived, in one transaction. Transactions are not affected.",
                  confirmLabel: "Reset cycle",
                  destructive: true,
                  confirmationPhrase: "reset cycle",
                  onConfirm: (reason) => run({ action: "cycle.reset" }, reason),
                })
              }
            >
              Reset cycle…
            </Button>
          </Row>
        </div>
      </div>

      <ReasonDialog request={request} onClose={() => setRequest(null)} />
    </>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-xs font-bold tracking-wide text-copy-primary uppercase">{title}</h4>
      <p className="text-xs leading-relaxed text-copy-muted">{description}</p>
      <div className="mt-auto flex flex-col gap-2 pt-2">{children}</div>
    </section>
  );
}

function Select({
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
