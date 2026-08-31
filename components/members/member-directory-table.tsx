"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Crown, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface MemberRow {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  isLeader: boolean;
  orgRole: string;
  functionalRoles: string[];
  workDistributionRoles: string[];
  createdAt: string;
}

const FUNCTIONAL_ROLE_OPTIONS = [
  { value: "PITCHING", label: "Pitching" },
  { value: "DOCUMENTS", label: "Documents" },
  { value: "CREATIVES", label: "Creatives" },
  { value: "PRODUCTION", label: "Production" },
  { value: "QUALITY_ASSURANCE", label: "Quality Assurance" },
  { value: "MARKETING", label: "Marketing" },
  { value: "MODEL", label: "Model" },
];

const WORK_DISTRIBUTION_OPTIONS = [
  { value: "HACKATHON_HUNTER", label: "Hackathon Hunter" },
  { value: "PROJECT_SCAVENGER_CREATOR", label: "Project Scavenger / Creator" },
];

function labelFor(value: string, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === value)?.label ?? value;
}

function roleBadge(member: MemberRow) {
  if (member.isLeader) {
    return (
      <Badge className="gap-1 bg-accent-dim text-brand">
        <Crown className="h-3 w-3" /> Leader
      </Badge>
    );
  }
  if (member.orgRole === "org:admin") {
    return (
      <Badge className="gap-1 bg-accent-dim text-brand">
        <ShieldCheck className="h-3 w-3" /> Assistant Leader
      </Badge>
    );
  }
  return <Badge variant="secondary">Member</Badge>;
}

interface MemberDirectoryTableProps {
  members: MemberRow[];
  isAdmin: boolean;
  isLeader: boolean;
  currentMemberId: string;
}

export function MemberDirectoryTable({
  members,
  isAdmin,
  isLeader,
  currentMemberId,
}: MemberDirectoryTableProps) {
  const router = useRouter();
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);
  const [assigningLeader, setAssigningLeader] = useState(false);
  const [deletingMember, setDeletingMember] = useState<MemberRow | null>(null);
  const [pendingRoles, setPendingRoles] = useState<{
    functional: string[];
    workDistribution: string[];
  }>({ functional: [], workDistribution: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentAssistantLeader = members.find(
    (m) => !m.isLeader && m.orgRole === "org:admin",
  );

  function openEditDialog(member: MemberRow) {
    setEditingMember(member);
    setPendingRoles({
      functional: member.functionalRoles,
      workDistribution: member.workDistributionRoles,
    });
  }

  function toggleRole(
    kind: "functional" | "workDistribution",
    value: string,
  ) {
    setPendingRoles((prev) => {
      const set = new Set(prev[kind]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, [kind]: [...set] };
    });
  }

  async function saveRoleTags() {
    if (!editingMember) return;
    setIsSaving(true);
    try {
      await Promise.all([
        fetch(`/api/members/${editingMember.id}/functional-roles`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles: pendingRoles.functional }),
        }),
        fetch(`/api/members/${editingMember.id}/work-distribution-roles`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles: pendingRoles.workDistribution }),
        }),
      ]);
      setEditingMember(null);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus(member: MemberRow) {
    const nextStatus = member.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await fetch(`/api/members/${member.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    router.refresh();
  }

  async function assignAssistantLeader(memberId: string) {
    setIsSaving(true);
    try {
      await fetch(`/api/members/${memberId}/assistant-leader`, {
        method: "POST",
      });
      setAssigningLeader(false);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function revokeAssistantLeader(memberId: string) {
    setIsSaving(true);
    try {
      await fetch(`/api/members/${memberId}/assistant-leader`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMember() {
    if (!deletingMember) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/members/${deletingMember.id}`, { method: "DELETE" });
      if (response.ok) {
        setDeletingMember(null);
        router.refresh();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {isLeader && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setAssigningLeader(true)}>
            Assign Assistant Leader
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-surface-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface">
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Member Roles</TableHead>
              <TableHead>Work Distribution</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              {isAdmin && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id} className="border-t border-surface-border-subtle">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatarUrl ?? undefined} />
                      <AvatarFallback>
                        {member.displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium text-copy-primary">
                        {member.displayName}
                      </div>
                      <div className="text-xs text-copy-muted">{member.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{roleBadge(member)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {member.functionalRoles.length === 0 && (
                      <span className="text-xs text-copy-faint">—</span>
                    )}
                    {member.functionalRoles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {labelFor(role, FUNCTIONAL_ROLE_OPTIONS)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {member.workDistributionRoles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {labelFor(role, WORK_DISTRIBUTION_OPTIONS)}
                      </Badge>
                    ))}
                    {member.workDistributionRoles.length === 0 &&
                      !member.isLeader &&
                      member.orgRole !== "org:admin" && (
                        <span className="text-xs text-copy-faint">—</span>
                      )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={member.status === "ACTIVE" ? "default" : "secondary"}>
                    {member.status === "ACTIVE" ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-copy-muted">
                  {new Date(member.createdAt).toLocaleDateString()}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-xs">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEditDialog(member)}>
                          Edit role tags
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleStatus(member)}>
                          {member.status === "ACTIVE"
                            ? "Set inactive"
                            : "Set active"}
                        </DropdownMenuItem>
                        {/* Not for the Leader (fixed seat) or yourself — same
                            rule the API enforces, hidden here rather than
                            shown and left to error. */}
                        {!member.isLeader && member.id !== currentMemberId && (
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeletingMember(member)}
                          >
                            Delete member
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit role tags */}
      <Dialog open={editingMember !== null} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">
              Edit role tags
            </DialogTitle>
            <DialogDescription>
              {editingMember?.displayName} — Member Roles and Work Distribution.
              Admin access itself isn&apos;t set here; use &ldquo;Assign Assistant
              Leader&rdquo; for that.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div>
              <p className="mb-2 text-xs font-bold tracking-wide text-copy-primary uppercase">
                Member Roles
              </p>
              <div className="grid grid-cols-2 gap-2">
                {FUNCTIONAL_ROLE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm text-copy-primary"
                  >
                    <Checkbox
                      checked={pendingRoles.functional.includes(option.value)}
                      onCheckedChange={() => toggleRole("functional", option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold tracking-wide text-copy-primary uppercase">
                Work Distribution
              </p>
              <div className="grid grid-cols-2 gap-2">
                {WORK_DISTRIBUTION_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm text-copy-primary"
                  >
                    <Checkbox
                      checked={pendingRoles.workDistribution.includes(option.value)}
                      onCheckedChange={() =>
                        toggleRole("workDistribution", option.value)
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingMember(null)}>
              Cancel
            </Button>
            <Button onClick={saveRoleTags} disabled={isSaving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Assistant Leader — Leader only, deliberately separate from the row action menu */}
      <Dialog open={assigningLeader} onOpenChange={setAssigningLeader}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">
              Assign Assistant Leader
            </DialogTitle>
            <DialogDescription>
              There is only one Assistant Leader seat. Picking someone new
              revokes it from whoever holds it now.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {members
              .filter((m) => !m.isLeader)
              .map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-xl border border-surface-border px-3 py-2"
                >
                  <div className="text-sm font-medium text-copy-primary">
                    {member.displayName}
                    {member.id === currentAssistantLeader?.id && (
                      <span className="ml-2 text-xs font-medium text-copy-secondary">
                        (current Assistant Leader)
                      </span>
                    )}
                  </div>
                  {member.id === currentAssistantLeader?.id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => revokeAssistantLeader(member.id)}
                    >
                      Revoke
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => assignAssistantLeader(member.id)}
                    >
                      Assign
                    </Button>
                  )}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete member — permanent; tasks/docs/transactions/events/projects
          they created move to whoever's deleting them, per the confirmed
          design (see 22-dashboard-data-wiring.md-adjacent progress-tracker
          entry). */}
      <Dialog open={deletingMember !== null} onOpenChange={(open) => !open && setDeletingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">Delete member?</DialogTitle>
            <DialogDescription>
              This permanently removes {deletingMember?.displayName} from the org — they&apos;ll lose
              access immediately. Anything they created (tasks, docs, transactions, events, projects)
              stays, reassigned to you, so nothing is lost. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingMember(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isDeleting} onClick={deleteMember}>
              Delete member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
