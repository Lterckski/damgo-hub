import { entityVisibilityWhere } from "@/lib/hub/context";
import { requireWorkspacePage as requireWorkspaceSession } from "@/lib/hub/context";
import Link from "next/link";
import { FileText } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { ImportFromDriveButton } from "@/components/docs/import-from-drive-button";
import { NewDocDialog } from "@/components/docs/new-doc-dialog";

export default async function DocsPage() {
  await requireWorkspaceSession();

  // select, not include: true — the list only ever renders id/title/
  // updatedAt/author.displayName, but this was pulling every doc's full
  // `content` too (extracted PDFs/docx can run tens of KB each) plus the
  // full author Member record, on every /docs visit.
  const docs = await prisma.doc.findMany({
    where: await entityVisibilityWhere("document"),
    select: {
      id: true,
      title: true,
      updatedAt: true,
      author: { select: { displayName: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BackButton />
            <h1 className="font-display text-3xl text-copy-primary">
              Documentation
            </h1>
          </div>
          <p className="mt-1 text-sm text-copy-secondary">
            Shared write-ups, notes, and reference pages for the team.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportFromDriveButton />
          <NewDocDialog />
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 py-10 text-center">
          <FileText className="h-8 w-8 text-copy-faint" />
          <p className="text-sm text-copy-secondary">
            No docs yet — start the first one.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <Link key={doc.id} href={`/docs/${doc.id}`}>
              <Card className="group/doc h-full overflow-hidden border-none py-0 shadow-sm ring-1 ring-surface-border transition-all hover:shadow-md hover:ring-brand/40">
                <div className="h-1 bg-gradient-to-r from-brand to-collab" />
                <CardContent className="p-5">
                  <div className="flex items-start gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-brand">
                      <FileText className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-bold text-copy-primary">
                      {doc.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-xs font-medium text-copy-secondary">
                    {doc.author.displayName} · updated{" "}
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
