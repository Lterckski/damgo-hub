# Mobile browser checks

Run `npx playwright install chromium` once, then `npm run test:mobile`.
To use an installed Chrome instead, run `PLAYWRIGHT_CHANNEL=chrome npm run test:mobile`.

The runner starts an isolated Vite fixture server on localhost port 3109. It renders the real app components and CSS, with synthetic records and explicit Clerk/Next router stand-ins. It never starts the authenticated app, reads production data, or writes through a real API. Fixture files live outside the Next.js app routes.

Seven viewport/input configurations cover phone widths 320/375/390/430, phone landscape, touch tablet and desktop. Assertions check viewport containment, horizontal overflow, tap navigation, forms/nested date pickers, calendar views and board editing/connections. Header search/inbox checks run at phone portrait widths. Notification preferences are checked in every configuration. Failures retain screenshots and traces in `test-results/`.

This suite is layout and component-interaction verification. Real iOS Safari/Android Chrome sign-in, organization changes, browser keyboards/safe areas, uploads, Liveblocks collaboration and external integration callbacks still need device QA. Next.js font loading and Clerk's own UI are not certified by these fixtures.

The desktop project also runs `performance.pw.ts`: a 1,000-row admin table fixture under 4× Chrome CPU throttling. It records Event Timing samples, verifies the 50-row render bound, and checks cross-page selection/export and search. Run only that workload with `PLAYWRIGHT_CHANNEL=chrome npx playwright test --config tests/mobile/playwright.config.ts performance.pw.ts --project desktop`. Timings are attached to test results; they are diagnostic samples, not field INP or a fixed CI latency gate. See the [audit](../../context/current-issues/current-issues-interaction-performance.md) for the baseline comparison.

The desktop `rum.pw.ts` fixture verifies real `web-vitals` attribution and the separate slow-interaction collector using two deliberately blocked test buttons. Telemetry requests are intercepted and validated; nothing is sent to production. Run it with `PLAYWRIGHT_CHANNEL=chrome npx playwright test --config tests/mobile/playwright.config.ts rum.pw.ts --project desktop`. The fixture supplies its own public build-release value, since Vite does not compile Next.js environment variables.
