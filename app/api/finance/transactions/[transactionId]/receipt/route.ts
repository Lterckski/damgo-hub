import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";

import { prisma } from "@/lib/prisma";

// GET /api/finance/transactions/[transactionId]/receipt — streams a
// transaction's receipt to any authenticated member. The receipt itself is
// stored as a private Vercel Blob (see the POST handler in
// app/api/finance/transactions/route.ts); this route is the only way to
// read it, so receipts never render as a raw, unauthenticated Blob URL —
// per 07-financial-tracker.md.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { transactionId } = await params;
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });

  if (!transaction?.receiptPath) {
    return NextResponse.json({ error: "This transaction has no receipt" }, { status: 404 });
  }

  const blob = await get(transaction.receiptPath, { access: "private" });

  if (!blob?.stream) {
    return NextResponse.json({ error: "Receipt not found in storage" }, { status: 404 });
  }

  const filename = transaction.receiptPath.split("/").pop() ?? "receipt";

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
