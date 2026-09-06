"use client";

import * as React from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/currency";
import { MEMBER_STATUS_LABEL } from "@/lib/member-status";
import type {
  MemberDetail,
  PenaltyDetail,
  ProjectDetail,
  RecordDetail,
  RelatedItem,
  TaskDetail,
  TransactionDetail,
} from "@/lib/admin/detail";
import type { AdminDrawerTarget } from "@/lib/admin/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/**
 * The console's detail surface. One drawer component for all six record
 * kinds rather than six drawers, so the header/body/footer rhythm and the
 * action-footer position are identical wherever you opened from — the
 * queue, the table, or the ⌘K palette.
 *
 * Nothing here navigates. The footer's actions run through the same API
 * the table's inline cells use, and the console refreshes underneath.
 */

export interface DrawerAction {
  id: string;
  label: string;
  variant?: "default" | "outline" | "destructive";
  onRun: () => void;
}

export interface RecordDrawerProps {
  target: AdminDrawerTarget | null;
  onClose: () => void;
  /** Built by the console — it owns the mutation handlers, not the drawer. */
  buildActions: (detail: RecordDetail) => DrawerAction[];
  /** Bumped by the console after a mutation, to re-fetch the open drawer. */
  refreshToken: number;
}

/**
 * The fetching half lives in `Loader`, which is mounted only while a
 * target exists and is keyed to that target — so a new record starts from
 * a clean loading state by mounting, and there is no effect clearing stale
 * detail when the drawer closes.
 */
export function RecordDrawer({
  target,
  onClose,
  buildActions,
  refreshToken,
}: RecordDrawerProps) {
  return (
    <Drawer open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <div className="h-1 shrink-0 bg-gradient-to-r from-brand to-collab" />
        {target && (
          <Loader
            key={`${target.kind}:${target.recordId}`}
            target={target}
            onClose={onClose}
            buildActions={buildActions}
            refreshToken={refreshToken}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function Loader({
  target,
  onClose,
  buildActions,
  refreshToken,
}: {
  target: AdminDrawerTarget;
  onClose: () => void;
  buildActions: (detail: RecordDetail) => DrawerAction[];
  refreshToken: number;
}) {
  const [detail, setDetail] = React.useState<RecordDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const { kind, recordId } = target;

  React.useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/admin/records/${kind}/${recordId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        const data = (payload ?? {}) as Record<string, unknown>;
        if (!response.ok)
          throw new Error(
            typeof data.error === "string" ? data.error : "Failed to load",
          );
        setDetail(data.detail as RecordDetail);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError")
          return;
        setError(cause instanceof Error ? cause.message : "Failed to load");
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [kind, recordId, refreshToken]);

  const actions = detail ? buildActions(detail) : [];

  return (
    <>
      {isLoading && !detail && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      )}

      {error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-semibold text-state-error">{error}</p>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      )}

      {detail && (
        <>
          {detail.kind === "members" && <MemberBody member={detail.member} />}
          {detail.kind === "finance" && (
            <TransactionBody transaction={detail.transaction} />
          )}
          {detail.kind === "penalties" && (
            <PenaltyBody penalty={detail.penalty} />
          )}
          {detail.kind === "projects" && (
            <ProjectBody project={detail.project} />
          )}
          {detail.kind === "activity" && <TaskBody task={detail.task} />}
          {detail.kind === "docs" && (
            <>
              <DrawerHeader className="px-6 pt-6 pb-4">
                <DrawerTitle>{detail.doc.title}</DrawerTitle>
                <DrawerDescription>
                  {detail.doc.authorName}
                  {detail.doc.projectName ? ` · ${detail.doc.projectName}` : ""}
                </DrawerDescription>
              </DrawerHeader>
              <DrawerBody>
                <Section title="Excerpt">
                  <p className="whitespace-pre-wrap text-sm text-copy-secondary">
                    {detail.doc.excerpt ??
                      "This document has no text content yet."}
                  </p>
                </Section>
                <Section title="Open">
                  <a
                    href={`/docs/${detail.doc.id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                  >
                    Open the full document
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Section>
              </DrawerBody>
            </>
          )}

          {actions.length > 0 && (
            <DrawerFooter>
              {actions.map((action) => (
                <Button
                  key={action.id}
                  variant={action.variant ?? "default"}
                  size="sm"
                  onClick={action.onRun}
                >
                  {action.label}
                </Button>
              ))}
            </DrawerFooter>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-2 text-xs font-bold tracking-[0.08em] text-copy-primary uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-xs font-semibold text-copy-secondary">{label}</dt>
          <dd className="text-sm text-copy-primary">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

const TONE_CLASS: Record<NonNullable<RelatedItem["tone"]>, string> = {
  default: "border-surface-border",
  warning: "border-state-warning",
  critical: "border-state-error",
  success: "border-state-success",
};

function RelatedList({
  items,
  empty,
}: {
  items: RelatedItem[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-copy-muted">{empty}</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "rounded-xl border-l-2 bg-base px-3 py-2",
            TONE_CLASS[item.tone ?? "default"],
          )}
        >
          <p className="text-sm text-copy-primary">{item.label}</p>
          {item.meta && (
            <p className="mt-0.5 text-xs text-copy-muted">{item.meta}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-base px-3 py-2.5 ring-1 ring-surface-border">
      <p className="text-[10px] font-bold tracking-[0.08em] text-copy-secondary uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold text-copy-primary tabular-nums">
        {value}
      </p>
      {hint && <p className="text-[10px] text-copy-muted">{hint}</p>}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function readableRole(role: string): string {
  return role
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

// ---------------------------------------------------------------------------
// Member 360
// ---------------------------------------------------------------------------

function MemberBody({ member }: { member: MemberDetail }) {
  return (
    <>
      <DrawerHeader className="border-b border-surface-border px-6 pt-6 pb-4">
        <div className="flex items-start gap-3 pr-10">
          <Avatar className="h-12 w-12">
            {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
            <AvatarFallback>{initials(member.displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <DrawerTitle className="truncate">{member.displayName}</DrawerTitle>
            <DrawerDescription className="truncate">
              {member.email}
            </DrawerDescription>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {member.isLeader && <Badge>Leader</Badge>}
              {member.orgRole === "org:admin" && !member.isLeader && (
                <Badge>Assistant Leader</Badge>
              )}
              <Badge
                variant={member.status === "ACTIVE" ? "default" : "secondary"}
              >
                {MEMBER_STATUS_LABEL[
                  member.status as keyof typeof MEMBER_STATUS_LABEL
                ] ?? member.status}
              </Badge>
              {!member.inClerkOrg && (
                <Badge variant="destructive">Not in Clerk org</Badge>
              )}
            </div>
          </div>
        </div>
      </DrawerHeader>

      <DrawerBody>
        <Section title="At a glance">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              label="Open tasks"
              value={String(member.stats.openTasks)}
            />
            <StatTile
              label="Completed"
              value={String(member.stats.completedTasks)}
            />
            <StatTile
              label="Owed"
              value={formatPHP(member.stats.penaltyOwedCents)}
              hint={`${member.stats.openPenalties} open`}
            />
            <StatTile
              label="Meetings"
              value={`${member.stats.meetingsAttended}/${member.stats.meetingsHeld}`}
              // MeetingParticipant records who was invited, not who showed
              // up — there is no attended flag in the schema, so the label
              // says "on the list" rather than claiming attendance.
              hint="on the list"
            />
          </div>
        </Section>

        <Section title="Roles">
          <Facts
            rows={[
              ["Org role", member.orgRole === "org:admin" ? "Admin" : "Member"],
              [
                "Functional",
                member.functionalRoles.length
                  ? member.functionalRoles.map(readableRole).join(", ")
                  : "—",
              ],
              [
                "Work distribution",
                member.workDistributionRoles.length
                  ? member.workDistributionRoles.map(readableRole).join(", ")
                  : "—",
              ],
              ["Joined", new Date(member.createdAt).toLocaleDateString()],
            ]}
          />
        </Section>

        <Section title="Tasks">
          <RelatedList items={member.tasks} empty="No tasks assigned." />
        </Section>

        <Section title="Penalties">
          <RelatedList
            items={member.penalties}
            empty="No penalties on record."
          />
        </Section>

        <Section title="Contributions">
          <RelatedList
            items={member.contributions}
            empty="No approved transactions."
          />
        </Section>

        <Section title="Recent admin activity">
          <RelatedList
            items={member.recentActivity}
            empty="Nothing recorded against this member yet."
          />
        </Section>
      </DrawerBody>
    </>
  );
}

// ---------------------------------------------------------------------------
// Other kinds
// ---------------------------------------------------------------------------

function TransactionBody({ transaction }: { transaction: TransactionDetail }) {
  return (
    <>
      <DrawerHeader className="border-b border-surface-border px-6 pt-6 pb-4">
        <DrawerTitle className="pr-10">
          {transaction.category} · {formatPHP(transaction.amountCents)}
        </DrawerTitle>
        <DrawerDescription>
          {transaction.type === "INCOME" ? "Income" : "Expense"} from{" "}
          {transaction.memberName}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <Section title="Details">
          <Facts
            rows={[
              ["Status", <Badge key="s">{transaction.status}</Badge>],
              ["Amount", formatPHP(transaction.amountCents)],
              ["Category", transaction.category],
              ["Description", transaction.description ?? "—"],
              [
                "Receipt",
                transaction.hasReceipt ? (
                  <a
                    href={`/api/finance/transactions/${transaction.id}/receipt`}
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    View receipt <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-state-warning">Not attached</span>
                ),
              ],
              ["Submitted", new Date(transaction.createdAt).toLocaleString()],
              ...(transaction.penaltyReason
                ? ([["From penalty", transaction.penaltyReason]] as [
                    string,
                    React.ReactNode,
                  ][])
                : []),
            ]}
          />
        </Section>
        <Section title="History">
          <RelatedList
            items={transaction.history}
            empty="No admin actions on this record yet."
          />
        </Section>
      </DrawerBody>
    </>
  );
}

function PenaltyBody({ penalty }: { penalty: PenaltyDetail }) {
  return (
    <>
      <DrawerHeader className="border-b border-surface-border px-6 pt-6 pb-4">
        <DrawerTitle className="pr-10">{penalty.reason}</DrawerTitle>
        <DrawerDescription>
          Issued to {penalty.memberName} by {penalty.issuedByName}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <Section title="Details">
          <Facts
            rows={[
              [
                "Status",
                <Badge
                  key="s"
                  variant={penalty.isPastDue ? "destructive" : "default"}
                >
                  {penalty.isPastDue ? "OPEN · PAST DUE" : penalty.status}
                </Badge>,
              ],
              [
                "Amount",
                penalty.amountCents === null
                  ? "Non-monetary"
                  : formatPHP(penalty.amountCents),
              ],
              [
                "Due",
                `${new Date(penalty.dueAt).toLocaleDateString()}${penalty.dueAtIsInferred ? " (estimated from org settings)" : ""}`,
              ],
              ["Issued", new Date(penalty.createdAt).toLocaleDateString()],
              [
                "Resolved",
                penalty.resolvedAt
                  ? new Date(penalty.resolvedAt).toLocaleDateString()
                  : "—",
              ],
              [
                "Ledger entry",
                penalty.linkedTransactionId ? "Created on resolution" : "None",
              ],
            ]}
          />
        </Section>
        <Section title="History">
          <RelatedList
            items={penalty.history}
            empty="No admin actions on this record yet."
          />
        </Section>
      </DrawerBody>
    </>
  );
}

function ProjectBody({ project }: { project: ProjectDetail }) {
  return (
    <>
      <DrawerHeader className="border-b border-surface-border px-6 pt-6 pb-4">
        <DrawerTitle className="pr-10">{project.name}</DrawerTitle>
        <DrawerDescription>
          {project.status} · owned by {project.ownerName}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <Section title="Details">
          <Facts
            rows={[
              ["Priority", project.priority],
              [
                "Category",
                project.category ? readableRole(project.category) : "—",
              ],
              [
                "Budget",
                project.estimatedBudgetCents === null
                  ? "—"
                  : formatPHP(project.estimatedBudgetCents),
              ],
              [
                "Timeline",
                [
                  project.startDate
                    ? new Date(project.startDate).toLocaleDateString()
                    : "—",
                  project.targetEndDate
                    ? new Date(project.targetEndDate).toLocaleDateString()
                    : "—",
                ].join(" → "),
              ],
              [
                "Last activity",
                new Date(project.updatedAt).toLocaleDateString(),
              ],
            ]}
          />
        </Section>
        {project.objectives && (
          <Section title="Objectives">
            <p className="text-sm whitespace-pre-wrap text-copy-secondary">
              {project.objectives}
            </p>
          </Section>
        )}
        <Section title="Collaborators">
          <RelatedList
            items={project.members}
            empty="No collaborators beyond the owner."
          />
        </Section>
        <Section title="Tasks">
          <RelatedList
            items={project.tasks}
            empty="No tasks on this project."
          />
        </Section>
        <Section title="History">
          <RelatedList
            items={project.history}
            empty="No admin actions on this record yet."
          />
        </Section>
      </DrawerBody>
    </>
  );
}

function TaskBody({ task }: { task: TaskDetail }) {
  return (
    <>
      <DrawerHeader className="border-b border-surface-border px-6 pt-6 pb-4">
        <DrawerTitle className="pr-10">{task.title}</DrawerTitle>
        <DrawerDescription>
          {task.status.replace("_", " ")} · {task.projectName ?? "No project"}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <Section title="Details">
          <Facts
            rows={[
              ["Priority", task.priority],
              ["Type", task.type],
              ["Created by", task.createdByName],
              ["Start", new Date(task.startDate).toLocaleDateString()],
              [
                "Due",
                <span
                  key="d"
                  className={
                    task.isOverdue
                      ? "font-semibold text-state-error"
                      : undefined
                  }
                >
                  {new Date(task.dueDate).toLocaleDateString()}
                  {task.isOverdue ? " · overdue" : ""}
                </span>,
              ],
              [
                "Assignees",
                task.assignees.length
                  ? task.assignees.map((a) => a.displayName).join(", ")
                  : "Unassigned",
              ],
            ]}
          />
        </Section>
        {task.description && (
          <Section title="Description">
            <p className="text-sm whitespace-pre-wrap text-copy-secondary">
              {task.description}
            </p>
          </Section>
        )}
        <Section title="History">
          <RelatedList
            items={task.history}
            empty="No admin actions on this record yet."
          />
        </Section>
      </DrawerBody>
    </>
  );
}
