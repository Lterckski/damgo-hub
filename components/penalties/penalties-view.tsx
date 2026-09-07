"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatPHP } from "@/lib/currency";
import type { MemberPickerOption } from "@/lib/members";
import type { SerializedPenalty } from "@/lib/penalties";
import { useSingleFlight } from "@/hooks/use-action-guard";

const FIELD_LABEL_CLASS =
  "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

interface PenaltiesViewProps {
  penalties: SerializedPenalty[];
  isAdmin: boolean;
  members: MemberPickerOption[];
}

function statusBadge(status: string) {
  if (status === "RESOLVED")
    return <Badge className="bg-accent-dim text-success">Resolved</Badge>;
  if (status === "WAIVED") return <Badge variant="secondary">Waived</Badge>;
  return <Badge variant="outline">Open</Badge>;
}

export function PenaltiesView({
  penalties,
  isAdmin,
  members,
}: PenaltiesViewProps) {
  if (!isAdmin) {
    return <MemberPenaltyList penalties={penalties} />;
  }
  return <AdminPenaltiesView penalties={penalties} members={members} />;
}

function MemberPenaltyList({ penalties }: { penalties: SerializedPenalty[] }) {
  if (penalties.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-copy-faint" />
        <p className="text-sm text-copy-secondary">
          No penalties on your record.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {penalties.map((penalty) => (
        <li
          key={penalty.id}
          className="rounded-2xl border border-surface-border bg-surface p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-copy-primary">
                {penalty.reason}
              </p>
              <p className="mt-1 text-xs text-copy-secondary">
                Issued {new Date(penalty.createdAt).toLocaleDateString()}
                {penalty.amountCentavos !== null
                  ? ` · ${formatPHP(penalty.amountCentavos)}`
                  : ""}
              </p>
            </div>
            {statusBadge(penalty.status)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AdminPenaltiesView({
  penalties,
  members,
}: {
  penalties: SerializedPenalty[];
  members: MemberPickerOption[];
}) {
  const router = useRouter();
  const [decidingPenalty, setDecidingPenalty] =
    useState<SerializedPenalty | null>(null);

  return (
    <Tabs defaultValue="all">
      <div className="flex items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger
            value="all"
            className="data-active:bg-elevated data-active:text-brand"
          >
            All Penalties
          </TabsTrigger>
        </TabsList>
        <IssuePenaltyDialog members={members} />
      </div>

      <TabsContent value="all" className="mt-6">
        {penalties.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-copy-faint" />
            <p className="text-sm text-copy-secondary">
              No penalties issued yet.
            </p>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-label="Penalty records; scroll horizontally for more columns"
            className="overflow-x-auto rounded-2xl border border-surface-border bg-surface"
          >
            <p className="px-3 py-2 text-xs text-copy-secondary sm:hidden">
              Scroll sideways for more columns.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Issued By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {penalties.map((penalty) => (
                  <TableRow key={penalty.id}>
                    <TableCell className="font-medium text-copy-primary">
                      {penalty.memberName}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-copy-secondary">
                      {penalty.reason}
                    </TableCell>
                    <TableCell className="text-copy-secondary">
                      {penalty.amountCentavos !== null
                        ? formatPHP(penalty.amountCentavos)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {statusBadge(penalty.status)}
                        {penalty.transactionId && (
                          <Link
                            href="/finance"
                            className="inline-flex items-center gap-0.5 text-xs font-medium text-brand hover:underline"
                            title="View the linked transaction on /finance"
                          >
                            ledger <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-copy-secondary">
                      {new Date(penalty.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-copy-secondary">
                      {penalty.issuedByName}
                    </TableCell>
                    <TableCell className="text-right">
                      {penalty.status === "OPEN" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDecidingPenalty(penalty)}
                        >
                          Resolve / Waive
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <ResolvePenaltyDialog
        penalty={decidingPenalty}
        onOpenChange={(open) => !open && setDecidingPenalty(null)}
        onDecided={() => {
          setDecidingPenalty(null);
          router.refresh();
        }}
      />
    </Tabs>
  );
}

function IssuePenaltyDialog({ members }: { members: MemberPickerOption[] }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [memberId, setMemberId] = useState("");
  const [reason, setReason] = useState("");
  const [amountPesos, setAmountPesos] = useState("");

  const memberItems = Object.fromEntries(
    members.map((m) => [m.id, m.displayName]),
  );

  function reset() {
    setMemberId("");
    setReason("");
    setAmountPesos("");
    setError(null);
  }

  const single = useSingleFlight();

  async function submit() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/penalties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          reason,
          amountPesos: amountPesos.trim() === "" ? null : amountPesos,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Something went wrong.");
        return;
      }
      setIsOpen(false);
      reset();
      router.refresh();
    } catch {
      setError("Couldn't connect to Damgo Hub. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = memberId !== "" && reason.trim() !== "" && !isSubmitting;

  return (
    <>
      <Button type="button" onClick={() => setIsOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Issue Penalty
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">
              Issue Penalty
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="penalty-member" className={FIELD_LABEL_CLASS}>
                Member
              </label>
              <Select
                items={memberItems}
                value={memberId}
                onValueChange={(v) => setMemberId(v ?? "")}
              >
                <SelectTrigger id="penalty-member" className="w-full">
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="penalty-reason" className={FIELD_LABEL_CLASS}>
                Reason
              </label>
              <Textarea
                id="penalty-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="What happened?"
                className="text-copy-primary!"
              />
            </div>

            <div>
              <label htmlFor="penalty-amount" className={FIELD_LABEL_CLASS}>
                Amount (₱) — optional
              </label>
              <Input
                id="penalty-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                placeholder="Leave blank for a non-monetary penalty"
                className="text-copy-primary!"
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={single(submit)}>
              {isSubmitting ? "Issuing…" : "Issue Penalty"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResolvePenaltyDialog({
  penalty,
  onOpenChange,
  onDecided,
}: {
  penalty: SerializedPenalty | null;
  onOpenChange: (open: boolean) => void;
  onDecided: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const single = useSingleFlight();

  async function decide(status: "RESOLVED" | "WAIVED") {
    if (!penalty || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/penalties/${penalty.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Something went wrong.");
        return;
      }
      onDecided();
    } catch {
      setError("Couldn't connect to Damgo Hub. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isMonetary =
    penalty?.amountCentavos !== null && penalty?.amountCentavos !== undefined;

  return (
    <Dialog open={penalty !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-copy-primary">
            Resolve or waive this penalty?
          </DialogTitle>
          <DialogDescription>
            {penalty?.reason}
            {isMonetary && penalty
              ? ` — resolving will log ${formatPHP(penalty.amountCentavos!)} to the financial ledger as income. Waiving logs nothing.`
              : " — this penalty has no amount attached, so neither choice touches the ledger."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-sm font-medium text-error" role="alert">
            {error}
          </p>
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={single(() => decide("WAIVED"), "WAIVED")}
            >
              Waive
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={single(() => decide("RESOLVED"), "RESOLVED")}
            >
              Resolve
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
