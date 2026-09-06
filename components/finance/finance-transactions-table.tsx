"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, ShieldAlert } from "lucide-react";

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
import { ReceiptFileInput } from "@/components/finance/receipt-file-input";
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
import { Textarea } from "@/components/ui/textarea";
import { formatPHP } from "@/lib/currency";

export interface TransactionRow {
  id: string;
  memberName: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  amountCentavos: number;
  description: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  hasReceipt: boolean;
  createdAt: string;
}

// Preset categories for the Log Transaction dialog, split by Type so the
// list never mixes directions that don't make sense together (we don't
// expense a penalty, and we don't receive an "event cost" as income). Each
// list gets its own "Other" so a custom category is always available.
// "Penalty" is deliberately income-only — penalties are one of the team's
// income sources (see 18-penalty-tracker.md's Link to the financial
// ledger), and the value used ("Penalty") matches exactly what that unit's
// auto-created transactions will use, so manual and automatic entries read
// the same.
const CATEGORY_PRESETS = {
  INCOME: ["Dues", "Penalty", "Sponsorship", "Other"],
  EXPENSE: [
    "Event Cost",
    "Supplies",
    "Subscription",
    "Reimbursement",
    "Registration Fee",
    "Other",
  ],
} as const;
type TransactionType = keyof typeof CATEGORY_PRESETS;

const FIELD_LABEL_CLASS =
  "mb-1.5 block text-xs font-bold tracking-wide text-copy-primary uppercase";

function typeBadge(type: TransactionRow["type"]) {
  return type === "INCOME" ? (
    <Badge className="bg-accent-dim text-success">Income</Badge>
  ) : (
    <Badge variant="secondary">Expense</Badge>
  );
}

function statusBadge(status: TransactionRow["status"]) {
  if (status === "APPROVED") return <Badge>Approved</Badge>;
  if (status === "REJECTED")
    return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

/** "2026-09" — zero-padded so lexicographic order matches chronological order. */
function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

interface MonthGroup {
  key: string;
  label: string;
  rows: TransactionRow[];
}

/**
 * Groups transactions by calendar month, newest first. The current real
 * month always gets a group — even with zero transactions — so it's
 * visible as soon as the month starts; a future month never appears since
 * nothing can be logged with a future timestamp (transactions are always
 * stamped `now()` on creation) and this filters out any group past the
 * current month as a safeguard regardless. Purely date-driven — no month
 * name is ever hardcoded, so a new month's section appears on its own the
 * moment the calendar rolls over.
 */
function groupByMonth(transactions: TransactionRow[]): MonthGroup[] {
  const now = new Date();
  const currentKey = monthKey(now);

  const groups = new Map<string, MonthGroup>();
  groups.set(currentKey, { key: currentKey, label: monthLabel(now), rows: [] });

  for (const transaction of transactions) {
    const createdAt = new Date(transaction.createdAt);
    const key = monthKey(createdAt);
    if (key > currentKey) continue;
    if (!groups.has(key)) {
      groups.set(key, { key, label: monthLabel(createdAt), rows: [] });
    }
    groups.get(key)!.rows.push(transaction);
  }

  return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

interface FinanceTransactionsTableProps {
  transactions: TransactionRow[];
  isAdmin: boolean;
}

export function FinanceTransactionsTable({
  transactions,
  isAdmin,
}: FinanceTransactionsTableProps) {
  const router = useRouter();
  const [isLogging, setIsLogging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [categoryPreset, setCategoryPreset] = useState<string>(
    CATEGORY_PRESETS.EXPENSE[0],
  );
  const [customCategory, setCustomCategory] = useState("");

  function selectType(value: string | null) {
    if (!value) return;
    const nextType = value as TransactionType;
    setType(nextType);
    // The category list is type-specific (see CATEGORY_PRESETS) — reset to
    // that list's first option if the current pick doesn't belong to it,
    // rather than leaving a stale, no-longer-visible category selected.
    const validCategories: readonly string[] = CATEGORY_PRESETS[nextType];
    if (!validCategories.includes(categoryPreset)) {
      setCategoryPreset(validCategories[0]);
      setCustomCategory("");
    }
  }

  function selectCategory(value: string | null) {
    if (!value) return;
    setCategoryPreset(value);
  }

  function resetLogForm() {
    setType("EXPENSE");
    setCategoryPreset(CATEGORY_PRESETS.EXPENSE[0]);
    setCustomCategory("");
  }

  async function submitTransaction(formData: FormData) {
    setIsSubmitting(true);
    try {
      const finalCategory =
        categoryPreset === "Other" ? customCategory.trim() : categoryPreset;
      formData.set("category", finalCategory);
      formData.set("type", type);

      const response = await fetch("/api/finance/transactions", {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        setIsLogging(false);
        resetLogForm();
        router.refresh();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const monthGroups = groupByMonth(transactions);

  async function decide(
    transactionId: string,
    status: "APPROVED" | "REJECTED",
  ) {
    setDecidingId(transactionId);
    try {
      await fetch(`/api/finance/transactions/${transactionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={() => setIsLogging(true)}>Log Transaction</Button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-surface-border">
        <div
          tabIndex={0}
          role="region"
          aria-label="Financial transactions; scroll horizontally for more columns"
          className="overflow-x-auto"
        >
          <p className="px-3 py-2 text-xs text-copy-secondary sm:hidden">
            Scroll sideways for more columns.
          </p>
          <Table>
            <TableHeader>
              <TableRow className="bg-surface">
                <TableHead>Date</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthGroups.map((group) => (
                <Fragment key={group.key}>
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={7}
                      className="bg-subtle px-3 py-2 text-xs font-bold tracking-[0.06em] text-copy-primary uppercase"
                    >
                      {group.label}
                      <span className="ml-2 font-medium tracking-normal text-copy-secondary normal-case">
                        · {group.rows.length} transaction
                        {group.rows.length === 1 ? "" : "s"}
                      </span>
                    </TableCell>
                  </TableRow>
                  {group.rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-6 text-center text-sm text-copy-secondary"
                      >
                        No transactions logged yet this month.
                      </TableCell>
                    </TableRow>
                  )}
                  {group.rows.map((transaction) => (
                    <TableRow
                      key={transaction.id}
                      className="border-t border-surface-border-subtle"
                    >
                      <TableCell className="text-xs font-medium text-copy-secondary">
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-copy-primary">
                        {transaction.memberName}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-copy-primary">
                        <div className="flex items-center gap-2">
                          {transaction.category === "Penalty" && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warning/15 text-warning">
                              <ShieldAlert className="h-3 w-3" />
                            </span>
                          )}
                          {transaction.category}
                          {transaction.hasReceipt && (
                            <a
                              href={`/api/finance/transactions/${transaction.id}/receipt`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-copy-secondary hover:text-brand"
                              aria-label="View receipt"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{typeBadge(transaction.type)}</TableCell>
                      <TableCell className="text-sm font-bold text-copy-primary">
                        {formatPHP(transaction.amountCentavos)}
                      </TableCell>
                      <TableCell>{statusBadge(transaction.status)}</TableCell>
                      <TableCell>
                        {isAdmin && transaction.status === "PENDING" && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={decidingId === transaction.id}
                              onClick={() => decide(transaction.id, "APPROVED")}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={decidingId === transaction.id}
                              onClick={() => decide(transaction.id, "REJECTED")}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={isLogging}
        onOpenChange={(open) => {
          setIsLogging(open);
          if (!open) resetLogForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-copy-primary">
              Log Transaction
            </DialogTitle>
            <DialogDescription>
              Starts as Pending until an Admin approves or rejects it.
            </DialogDescription>
          </DialogHeader>

          <form action={submitTransaction} className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>Type</label>
                {/* items map — <Select.Value> needs it to show a label
                    instead of the raw "INCOME"/"EXPENSE" value before the
                    popup has opened. See new-task-dialog.tsx's comment. */}
                <Select
                  items={{ INCOME: "Income", EXPENSE: "Expense" }}
                  value={type}
                  onValueChange={selectType}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOME">Income</SelectItem>
                    <SelectItem value="EXPENSE">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Amount (₱)</label>
                <Input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="text-copy-primary!"
                />
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL_CLASS}>Category</label>
              <Select value={categoryPreset} onValueChange={selectCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_PRESETS[type].map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {preset}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categoryPreset === "Other" && (
                <Input
                  className="mt-2 text-copy-primary!"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Describe the category…"
                  required
                />
              )}
            </div>

            <div>
              <label className={FIELD_LABEL_CLASS}>
                Description (optional)
              </label>
              <Textarea
                name="description"
                rows={2}
                className="text-copy-primary!"
              />
            </div>

            <div>
              <label className={FIELD_LABEL_CLASS}>Receipt (optional)</label>
              <ReceiptFileInput name="receipt" accept="image/*,.pdf" />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsLogging(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Log Transaction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
