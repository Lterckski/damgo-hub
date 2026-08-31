/** Shared serialization for Transaction API responses — see 07-financial-tracker.md. */
export interface SerializedTransaction {
  id: string;
  memberId: string;
  memberName: string;
  type: string;
  category: string;
  amountCentavos: number;
  description: string | null;
  status: string;
  hasReceipt: boolean;
  createdAt: string;
}

export function serializeTransaction(transaction: {
  id: string;
  memberId: string;
  member: { displayName: string };
  type: string;
  category: string;
  amount: number;
  description: string | null;
  receiptPath: string | null;
  status: string;
  createdAt: Date;
}): SerializedTransaction {
  return {
    id: transaction.id,
    memberId: transaction.memberId,
    memberName: transaction.member.displayName,
    type: transaction.type,
    category: transaction.category,
    amountCentavos: transaction.amount,
    description: transaction.description,
    status: transaction.status,
    hasReceipt: transaction.receiptPath !== null,
    createdAt: transaction.createdAt.toISOString(),
  };
}
