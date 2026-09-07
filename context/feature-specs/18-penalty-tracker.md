# Penalty Tracker

## Goal

Build the penalty tracker: schema, API, and UI, in one unit.

## Schema

Create `prisma/models/penalty.prisma`.

Add `Penalty`:

- `id`
- `memberId` — relation to `Member`, who the penalty was issued against
- `issuedById` — relation to `Member`, must be an Admin at issuance time
- `reason`
- `amountCents` — optional integer centavos, PHP (see Currency in `07-financial-tracker.md`); set when the penalty is monetary (most of them, for this team), left unset for a purely behavioral/warning penalty
- `status` enum: `OPEN`, `RESOLVED`, `WAIVED` — defaults to `OPEN`. `RESOLVED` means the fine was paid (or the non-monetary penalty was addressed); `WAIVED` means it was forgiven with no payment collected.
- `resolvedAt` — optional
- timestamps
- indexes on `memberId` and `status`

Resolved or waived penalties are not edited — status changes are recorded via `resolvedAt` and `status`, not by rewriting `reason` or `amountCents`, per the immutability invariant in `architecture-context.md`.

### Link to the financial ledger

A monetary penalty (`amountCents` set) that gets marked `RESOLVED` automatically creates a matching entry in the shared ledger from `07-financial-tracker.md` — the team doesn't track "who owes what" in two disconnected places. The foreign key lives on `Transaction`, not `Penalty` (see `07-financial-tracker.md`'s `Transaction.penaltyId`), since the transaction is the thing created after the fact.

## Routes

Create REST endpoints under `app/api/penalties`:

- `GET /api/penalties` — Admins see all; a member sees only their own
- `POST /api/penalties` — Admin only; accepts an optional `amountCents`
- `PATCH /api/penalties/[penaltyId]` — Admin only, change `status` to `RESOLVED`/`WAIVED` and set `resolvedAt`. Reject with `409` if the penalty isn't currently `OPEN` (no re-resolving/re-waiving). When transitioning to `RESOLVED` and `amountCents` is set, create the linked `Transaction` in the same operation (wrap both writes in a `prisma.$transaction`):
  - `type: INCOME`, `category: "Penalty"`, `amount: penalty.amountCents`, `status: APPROVED` (auto-approved — only an Admin can reach this path, same gate the manual approve flow uses), `memberId` set to the resolving Admin (the one "logging" it, consistent with `Transaction.memberId`'s meaning in `07-financial-tracker.md`), `penaltyId` set to this penalty, `description` auto-filled from the penalty's `reason`
  - transitioning to `WAIVED`, or `RESOLVED` with no `amountCents`, never creates a `Transaction`

Security: unauthenticated requests return `401`; non-Admin `POST`/`PATCH` return `403`.

## Page

Create `app/(app)/penalties/page.tsx`.

- for a regular member: a simple list of their own penalties — reason, amount (`formatPHP()`, if set), status badge, issued date
- for an Admin: shadcn `Tabs` — "All Penalties" (table: member, reason, amount, status, issued date, issued by) and "Issue Penalty" action
- "Issue Penalty" opens a `Dialog`: member picker, then a **reason `Select`** (see Preset Reasons below), and a free-text reason plus optional amount **only when "Other" is chosen**
- Admins can resolve/waive an `OPEN` penalty via a row action, with a small confirmation `Dialog`; for a monetary penalty, the resolve confirmation says the amount will be logged to the ledger, so it isn't a silent side effect
- a resolved monetary penalty's row links to its `Transaction` on `/finance` for traceability

## Preset Reasons (2026-09-08)

The reason is chosen from a dropdown, not typed. Options come from
`OrgSettings.penaltyRules` — the `[{ label, amountCents }]` list the admin
console's Settings block already edits — plus a fixed `"Other"` entry.

- Each preset carries its own **fixed** amount, shown next to the label in
  the dropdown (`Late to a meeting — ₱50.00`) and again, read-only, once
  selected. It is not editable in this dialog; changing it means changing
  the rule in Settings.
- A preset whose `amountCents` is `0` is a non-monetary penalty and stores
  `amountCents: null`, the same as leaving the amount blank always did.
- **"Other" is the only option that accepts typed input** — a free-text
  reason (required) and an optional amount, exactly the old behaviour.
- The amount is **not** taken from the request for a preset. The client
  sends `reasonChoice` only; the server looks the label up in
  `OrgSettings` and uses that amount, so a hand-crafted request cannot
  issue a preset reason for an arbitrary sum. A label that matches neither
  a configured rule nor `"Other"` is a `400`, never a silent fall-through
  to free text.
- Labels are matched case-insensitively, so a rule literally named "Other"
  cannot produce two identical-looking dropdown entries.
- With no rules configured the dropdown offers only "Other", and the dialog
  links to Admin → Settings to add some. **The list ships empty**: the
  team's actual reasons and amounts are theirs to enter, not something this
  spec invents.

### Acceptance criteria

- Selecting a preset hides the free-text reason and amount inputs entirely.
- Selecting "Other" reveals both, and Issue stays disabled until a reason is typed.
- A penalty issued from a preset stores the rule's label as its `reason` and the rule's amount, regardless of what the request body contains.
- `POST /api/penalties` returns `400` for a `reasonChoice` that is not a configured rule or "Other", and for "Other" with an empty reason.
- Editing a rule's amount in Settings changes what new penalties cost; already-issued penalties keep their original `reason`/`amountCents`, per the immutability rule above.

## Check When Done

- members only ever see their own penalties; Admins see everyone's
- only Admins can issue, resolve, or waive penalties
- resolved/waived penalties keep their original `reason` and `amountCents` intact
- resolving a monetary `OPEN` penalty creates exactly one `APPROVED` `Transaction` linked via `penaltyId`; waiving one, or resolving a non-monetary one, creates none
- a penalty that isn't `OPEN` can't be resolved or waived again (`409`)
- the reason dropdown offers every configured rule plus "Other"; only "Other" accepts a typed reason, and a preset's amount comes from `OrgSettings`, not the request
- `npm run build` passes
