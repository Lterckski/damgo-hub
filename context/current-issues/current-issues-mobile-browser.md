# Mobile Browser Usability

Status: **Mobile UI changes implemented on `feat/mobile-browser-usability`; authenticated device verification pending.** The project-wide requirement was recorded on 2026-09-06 and the user then authorized applying it.

The requirement covers all existing and future screens, including member/admin flows and collaborative boards. Follow the [product requirement](../project-overview.md#required-browser-support), [UI requirements](../ui-context.md#mobile-browser-requirements), and [verification workflow](../ai-workflow-rules.md#mobile-browser-verification).

## Implementation

- [x] **Bottom navigation:** `AppDock` now provides a visible Navigate button and a focus-managed dialog with labeled destinations on narrow screens and coarse-pointer devices. The desktop hover/focus dock remains. Admin visibility and active-route semantics are preserved.
- [x] **Forms:** task, project, meeting, finance, member, and milestone forms reflow to one column where needed. Shared app-level dialog/drawer bounds follow the visible viewport; date triggers and touch controls have larger targets. Notification preferences stack on phones. Detail-page action bars wrap beneath headings.
- [x] **Collaborative boards:** milestones have an explicit Edit button; the Connections dialog adds/removes edges through the existing Liveblocks callbacks without dragging. Ideas have an explicit Edit dialog with save/cancel/delete controls, while existing inline editing remains available. Board toolbars wrap and presence moves away from touch controls. Callback functions remain outside shared node data.
- [x] **Dense screens:** phones default to the calendar agenda and can switch to Month, where selecting a date exposes readable actionable rows. Desktop retains the month/agenda layout. Finance/member/penalty/admin tables keep bounded horizontal scrolling with visible guidance; admin search and detail fields adapt to narrow widths.
- [x] **Viewport behavior:** the root viewport enables safe-area layout and content resizing without disabling zoom. `BrowserViewport` tracks the visual viewport for keyboard-safe shell/overlay bounds and ignores pinch-zoom changes. Safe-area padding and larger touch targets are applied through app-level CSS; generated UI primitives are unchanged.

## Verification evidence

- `npm run test:mobile` is a repeatable Playwright suite backed by a separate Vite fixture server. Seven configurations passed using installed Chrome: 320×740, 375×812, 390×844, 430×932, 844×390 landscape, 768×1024 touch tablet, and 1280×800 desktop.
- The suite renders actual app components and styles with synthetic records and Clerk/router stand-ins. It checks viewport containment, horizontal overflow, touch navigation, task/meeting/project forms, nested date pickers, notification preferences, table layouts, calendar views, milestone editing/connections, and idea editing. Phone portrait checks additionally cover search and the notification popover. A 320px task dialog screenshot was visually inspected after animations settled.
- Component tests cover member/admin navigation, connection creation/deduplication/removal, viewport resizing/cleanup, and preservation of browser pinch zoom. Final build and unit-test results are recorded in [progress](../progress-tracker.md).
- The in-app browser connection failed to initialize. The authenticated local Next.js attempt encountered a Clerk session-refresh loop. Consequently the automated browser evidence comes from the isolated fixture environment, not an authenticated application session. No production data was used. See [test setup and limitations](../../tests/mobile/README.md).

## Remaining device QA

- [ ] Verify real iOS Safari and Android Chrome keyboard behavior, safe-area insets, toolbar resizing, rotation, browser zoom and touch gestures. Desktop Chrome touch emulation does not certify these device behaviors.
- [ ] Verify authenticated sign-in and organization/account switching, member/admin authorization flows, creation/editing and uploads/attachments on phones.
- [ ] Verify real Liveblocks collaboration and external Google/meeting/integration redirects on phones. The isolated fixture tests do not exercise backend writes, real Clerk UI, network delivery, or Next.js font loading.

Record browser/device versions and checked flows before closing the remaining items. This implementation does not add PWA installation or native packaging, and does not certify every production workflow as mobile-ready.
