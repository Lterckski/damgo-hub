Read `AGENTS.md` and `context/ui-context.md` before starting.

We're adding the design system and UI primitive components.

Install and configure `shadcn/ui`.

Add these shadcn components:

- Button
- Card
- Dialog
- Input
- Tabs
- Textarea
- ScrollArea
- Table
- Select
- Badge
- Avatar
- DropdownMenu
- Calendar

Do not modify the generated `components/ui/*` files after installation.

Also install `lucide-react`.

Create `lib/utils.ts` with a reusable `cn()` helper for merging Tailwind classes.

Wire up the light (beige) and dark theme tokens from `context/ui-context.md` in `globals.css`: light values on `:root`, dark overrides under `@media (prefers-color-scheme: dark)`, mapped to Tailwind tokens via `@theme inline`. Ensure all installed components read colors through these tokens rather than shadcn's default palette.

### Check when done

- All components import without errors
- `cn()` works properly
- No shadcn default color styling appears in either theme — every surface, border, and text color resolves to a token from `context/ui-context.md`
- Switching the system color scheme between light and dark swaps the beige and muted-dark palettes correctly, with no near-black, pure-white, or neon accent colors
