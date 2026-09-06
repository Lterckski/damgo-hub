import { prisma } from "@/lib/prisma";
import { formatPHP } from "@/lib/currency";
import type { AdminTableData } from "@/lib/admin/tables";
import type { AdminDrawerTarget, AdminRecordKind } from "@/lib/admin/types";

/**
 * Zone 1 — the ⌘K palette's index: members, transactions, penalties,
 * projects and docs in one flat list.
 *
 * Results are actionable, not navigational: every entry carries a drawer
 * target, and Enter opens that record's drawer over the console. Nothing
 * here produces an href, deliberately — an href is how the old /admin
 * worked and is exactly what this rebuild removes.
 *
 * Built from the table data the console already loaded, plus one extra
 * query for docs (the only searchable kind with no tab of its own), so the
 * palette costs one query rather than five.
 */

export interface SearchEntry {
  id: string;
  /** Group heading in the palette. */
  group: string;
  title: string;
  subtitle: string;
  /** Lowercased haystack — title, subtitle and anything else worth matching. */
  keywords: string;
  drawer: AdminDrawerTarget;
}

function entry(
  kind: AdminRecordKind,
  recordId: string,
  group: string,
  title: string,
  subtitle: string,
  extraKeywords: (string | null | undefined)[] = [],
): SearchEntry {
  return {
    id: `${kind}:${recordId}`,
    group,
    title,
    subtitle,
    keywords: [title, subtitle, ...extraKeywords].filter(Boolean).join(" ").toLowerCase(),
    drawer: { kind, recordId },
  };
}

export async function buildSearchIndex(data: AdminTableData): Promise<SearchEntry[]> {
  const docs = await prisma.doc.findMany({
    select: { id: true, title: true, author: { select: { displayName: true } }, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return [
    ...data.members.map((member) =>
      entry("members", member.id, "Members", member.displayName, member.email, [
        member.orgRole === "org:admin" ? "admin" : "member",
        member.status,
        ...member.functionalRoles,
      ]),
    ),
    ...data.finance.map((transaction) =>
      entry(
        "finance",
        transaction.id,
        "Transactions",
        `${transaction.category} — ${formatPHP(transaction.amountCents)}`,
        `${transaction.type === "INCOME" ? "Income" : "Expense"} · ${transaction.memberName}`,
        [transaction.status, transaction.description],
      ),
    ),
    ...data.penalties.map((penalty) =>
      entry("penalties", penalty.id, "Penalties", penalty.reason, `${penalty.memberName} · ${penalty.status}`, [
        penalty.amountCents ? formatPHP(penalty.amountCents) : null,
      ]),
    ),
    ...data.projects.map((project) =>
      entry("projects", project.id, "Projects", project.name, `${project.status} · ${project.ownerName}`, [
        project.category,
        project.priority,
      ]),
    ),
    ...docs.map((doc) => entry("docs", doc.id, "Docs", doc.title, doc.author.displayName)),
  ];
}
