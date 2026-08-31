# Financial Tracker

## Goal

Build the organization's shared financial ledger: schema, API, and UI, in one unit.

## Currency

All money in this app is **Philippine Pesos (PHP)** — this is a single-currency ledger, no currency field or multi-currency support anywhere. Store every amount as an integer number of **centavos** (`amount` is still named/typed the same as any "cents" quantity elsewhere in the codebase — for PHP that's centavos, 1 peso = 100 centavos), never a float, per `architecture-context.md`'s money-handling invariant. Format for display with a `formatPHP(cents: number)` helper in `lib/currency.ts` that renders `₱1,250.00`-style output (peso sign, thousands separators, two decimal places) — every amount shown anywhere in the app (finance page, penalty amounts in `18-penalty-tracker.md`, dashboard widgets) goes through this one helper, not ad-hoc `toLocaleString` calls scattered across components.

## Schema

Create `prisma/models/transaction.prisma`.

Add `Transaction`:

- `id`
- `memberId` — relation to `Member`, who logged it
- `type` enum: `INCOME`, `EXPENSE`
- `category` — free-text (dues, event cost, reimbursement, etc.)
- `amount` — store as integer centavos (PHP), never a float — see Currency above
- `description` — optional
- `receiptPath` — optional Vercel Blob URL
- `status` enum: `PENDING`, `APPROVED`, `REJECTED` — defaults to `PENDING`
- `penaltyId` — optional, unique, relation to `Penalty` (`18-penalty-tracker.md`); set only on the `Transaction` auto-created when an Admin resolves a monetary penalty — never set by the manual `POST` flow below
- timestamps
- indexes on `memberId` and `type`

Transactions are never edited or deleted once `APPROVED` — corrections happen via a new offsetting `Transaction`, per the invariant in `architecture-context.md`.

## Routes

Create REST endpoints under `app/api/finance`:

- `GET /api/finance/transactions` — list transactions (any authenticated member); support `?status=` filter
- `POST /api/finance/transactions` — create a transaction, `status: PENDING`, optional receipt upload to Vercel Blob first. Does not accept `penaltyId` — that path only comes from the penalty-resolve flow in `18-penalty-tracker.md`.
- `PATCH /api/finance/transactions/[transactionId]` — Admin only, change `status` to `APPROVED`/`REJECTED`; reject if the transaction is already `APPROVED`
- `GET /api/finance/summary` — running balance + this-month income/expense totals, all in centavos (PHP)

## Page

Create `app/(app)/finance/page.tsx`.

- summary cards at the top: balance, this month's income, this month's expenses — every figure formatted with `formatPHP()`
- shadcn `Table` of transactions: date, member, category, type badge, amount (`formatPHP()`), status badge
- **grouped by calendar month**, newest first, each with its own section header ("September 2026") and a running count. The current real month's section always renders — even with zero transactions, its own empty state — so it's there from the first day of the month; a future month never appears (nothing can be logged with a future timestamp, and the grouping logic filters one out regardless as a safeguard). Purely date-driven off each transaction's own `createdAt` — never hardcode a month name — so October's section simply appears on its own once the calendar rolls into October, with no code change needed.
- a transaction created from a resolved penalty shows a small "Penalty" tag next to its category, linking back to `/penalties`
- "Log Transaction" button opens a `Dialog` with amount (peso input, e.g. a `₱` prefix on the `Input`), type, category, description, and an optional receipt file input
- **category presets are split by Type** rather than one shared list — Income gets Dues/Penalty/Sponsorship/Other, Expense gets Event Cost/Supplies/Subscription/Reimbursement/Registration Fee/Other, each with its own "Other" revealing a custom text field. Don't merge them back into one list: a category that only makes sense in one direction (Penalty, Event Cost) showing up under the other is confusing, not flexible. Switching Type resets the category selection if the current one doesn't belong to the new list.
- the receipt file input is a custom control (`components/finance/receipt-file-input.tsx`), not a bare `Input type="file"` — a native file input's "No file chosen" text can't be recolored (see `ui-context.md`'s Contrast rule), so it's hidden and replaced with a styled trigger button + our own filename display
- Admins see approve/reject row actions for `PENDING` transactions; other members see status only
- receipt attachments open in a new tab via a signed/authenticated download, not a raw Blob URL

## Check When Done

- transactions can be logged by any member and default to `PENDING`
- only Admins can approve/reject, and only while still `PENDING`
- summary totals only count `APPROVED` transactions
- every amount anywhere in the app renders through `formatPHP()` — no bare numbers, no other currency symbol
- receipts upload to Vercel Blob; `Transaction.receiptPath` stores the URL, not the file content
- `npm run build` passes
