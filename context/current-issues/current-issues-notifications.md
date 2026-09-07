# Notifications: read state and general audit

Status: **Requirements recorded 2026-09-07; nothing implemented or investigated in a running session.** The header inbox itself shipped in [unit 23](../feature-specs/23-global-search-notifications-header.md) (PR #23, merged 2026-09-06). This file records one defect requirement — an opened notification must stop reading as unread — and the broader audit item it belongs to. Source references below come from reading the checked-in code on `feat/mobile-browser-usability`; no signed-in reproduction has been performed.

## Requirement: opening a notification clears its unread state

An unread notification stops being unread once the member opens it, and every count that describes it agrees, in the same interaction.

- Opening a notification marks it read for that member only, through the per-member `HubNotificationState.readAt` row (`prisma/models/hub.prisma`). A shared org, project, or role notification is never marked read for anyone else.
- The row's unread treatment clears in the same interaction — currently the `bg-accent-dim` background in `components/chrome/notification-bell.tsx` — without waiting for the next poll.
- The bell's unread badge decrements in the same interaction, and its `aria-live` announcement follows the new value rather than repeating the stale one.
- The badge, the list, and the Unread tab stay consistent with each other: after opening every unread item the badge is gone and the Unread tab is empty, with its own empty state.
- Read state is server state. It survives a reload, a refocus, a second tab, and a second device; it is never held only in component state.
- Marking read is idempotent. Re-opening an already-read notification does not rewrite `readAt` or move the count.
- The scope rules are unchanged by this fix: counts, list, and tabs continue to apply the same visibility, preference, and dismissal rules, and marking read never widens or narrows what the member can see.

### Acceptance criteria

- Opening an unread notification from the bell leaves the badge one lower and the row in its read treatment, with no further network round trip needed to observe either.
- Opening the last unread notification removes the badge entirely rather than leaving a `0`.
- A second member receiving the same org-scoped notification still sees it unread, with their own count unchanged.
- Reloading the page after opening a notification shows it read; the state does not revert after the next poll.
- The Unread tab's contents and the badge count never disagree at rest — they are derived from the same per-member state and the same scope rules.
- Re-opening a read notification does not change its `readAt` value or the badge.
- A failure to persist read state surfaces an error and does not leave the row visually read while the server still counts it unread.

## Observed behavior

A lead, not a confirmed root cause — read from source, not reproduced.

- The notification row's click handler in `components/chrome/notification-bell.tsx` posts `{ action: "read", id }`, then closes the popover and navigates. It does not call the component's own `refresh()` afterwards, unlike `act()` (the handler behind the inline and dismiss controls), which does. The badge therefore keeps its pre-open value until the next 15-second poll, a window focus, an `online` event, or a `hub:refresh` event.
- The unread background is driven by `n.read` from the last fetched payload, so the row's appearance depends on that same refresh.
- Whether the server write itself is correct has not been checked; the requirement above covers both halves regardless of which one turns out to be at fault.

## Requirement: general notifications audit

Notifications need one deliberate pass across the whole feature rather than a sequence of per-symptom fixes. The read-state defect above is the known instance and can be fixed on its own; the audit is the broader item, and it produces a written finding for each area below in this file before further notification work is scoped.

Areas the audit must cover:

- **Producers.** Which of the triggers listed in [unit 23 Part B](../feature-specs/23-global-search-notifications-header.md) actually emit in production, and which are wired but never fire. A trigger with no real producer is a gap, not a feature.
- **Counts and scope parity.** Whether the badge, the list, the tabs, and "Mark all as read" apply identical visibility, preference, and dismissal rules, including for a member whose role or project membership changed after the notification was created.
- **Read, dismiss, and delivery state.** Whether read and dismissed are genuinely independent, per member, and durable, and what each one means for the count.
- **Delivery freshness.** Whether the 15-second visible-tab poll, focus refresh, and error backoff behave as documented, and what a member sees while a poll is in flight or failing.
- **Preferences.** Whether type opt-outs are honored at emission and again before send, and whether a later opt-in correctly does not replay suppressed events.
- **Email.** Whether the notification worker's email and the existing meeting outbox still deduplicate against each other, with no double send and no silent drop.
- **Mobile and accessibility.** The bell, popover, tabs, and inline actions against the [mobile browser requirements](../ui-context.md#mobile-browser-requirements), including whether an inline action can be hit accidentally while scrolling the list.
- **Repeat activation.** Mark all as read, dismiss, and the inline actions against [single-activation action buttons](../ui-context.md#single-activation-action-buttons).
- **Empty, loading, and error states.** Whether each is distinguishable from the others, and whether a failed poll is visibly different from "you're all caught up."

### Acceptance criteria

- Each area above has a written finding in this file: verified working, defective (with the observed behavior), or not exercised (with the reason).
- Every defect the audit finds is recorded as its own requirement with acceptance criteria here before any fix is implemented.
- Findings distinguish what was observed in a signed-in session from what was read in source; a source reading is never recorded as verified behavior.
- Anything left unverified because of a missing environment — Resend, the deployed Trigger.dev worker, a real device — says so explicitly rather than being omitted.

## Open questions

Recorded 2026-09-07 with the requirements above. These need a decision before the read-state fix is implemented.

- **What does "opened" mean?** Opening the individual notification (clicking the row), or opening the bell — should the panel mark everything currently visible as read the moment it is opened? The two produce very different unread counts in daily use.
- **Does dismissing an unread notification count as reading it?** Dismiss removes the row from the list. Whether it also clears the unread state, or whether a dismissed-but-unread item keeps contributing to the badge, is currently undefined.
- **Does reaching a record another way clear its notification?** If a member opens the task from search, the dashboard, or a direct URL rather than from the bell, should the related notification become read?
- **What is "Mark all as read" scoped to?** Unit 23 limits bulk reads to the caller's currently visible notifications. Should it stay scoped to the active tab and current page of results, or clear everything the member could see?
- **Is the 15-second poll acceptable as the refresh mechanism for the count?** The requirement above asks for the badge to update in the same interaction, which implies a local decrement or an immediate refetch on open. Confirm that an optimistic local update is acceptable, or that an extra request per open is preferred.
- **How is the audit scheduled?** A blocking item before [PR #24](https://github.com/Lterckski/damgo-hub/pull/24) merges, or its own follow-up unit in `feature-specs/` after it?
