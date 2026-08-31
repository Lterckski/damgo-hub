import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { pesosToCentavos } from "@/lib/currency";
import { serializeTransaction } from "@/lib/finance";
import type { TransactionStatus, TransactionType } from "@/app/generated/prisma/enums";

const VALID_STATUSES: TransactionStatus[] = ["PENDING", "APPROVED", "REJECTED"];
const VALID_TYPES: TransactionType[] = ["INCOME", "EXPENSE"];

// GET /api/finance/transactions — any authenticated member; ?status= filters.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");

  if (statusParam && !VALID_STATUSES.includes(statusParam as TransactionStatus)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const transactions = await prisma.transaction.findMany({
    where: statusParam ? { status: statusParam as TransactionStatus } : undefined,
    include: { member: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ transactions: transactions.map(serializeTransaction) });
}

// POST /api/finance/transactions — any authenticated member logs a
// transaction; always starts PENDING. multipart/form-data so an optional
// receipt file can ride along in the same request.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await getCurrentMember();
  const formData = await request.formData();

  const type = formData.get("type");
  const category = formData.get("category");
  const amountPesosRaw = formData.get("amount");
  const description = formData.get("description");
  const receipt = formData.get("receipt");

  if (typeof type !== "string" || !VALID_TYPES.includes(type as TransactionType)) {
    return NextResponse.json({ error: "type must be INCOME or EXPENSE" }, { status: 400 });
  }
  if (typeof category !== "string" || category.trim() === "") {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }

  const amountPesos = Number(amountPesosRaw);
  if (!Number.isFinite(amountPesos) || amountPesos <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  let receiptPath: string | undefined;
  if (receipt instanceof File && receipt.size > 0) {
    const blob = await put(`receipts/${member.id}-${Date.now()}-${receipt.name}`, receipt, {
      access: "private",
      addRandomSuffix: true,
    });
    receiptPath = blob.pathname;
  }

  const transaction = await prisma.transaction.create({
    data: {
      memberId: member.id,
      type: type as TransactionType,
      category: category.trim(),
      amount: pesosToCentavos(amountPesos),
      description:
        typeof description === "string" && description.trim() !== ""
          ? description.trim()
          : null,
      receiptPath,
      status: "PENDING",
    },
    include: { member: true },
  });

  return NextResponse.json({ transaction: serializeTransaction(transaction) }, { status: 201 });
}
