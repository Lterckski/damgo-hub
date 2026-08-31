import { dark } from "@clerk/ui/themes";
import type { Appearance } from "@clerk/ui";

/**
 * Clerk appearance shared by ClerkProvider and the sign-in/sign-up pages.
 * Built on the `dark` base theme per 03-auth.md, with every color pointed
 * at our own CSS custom properties (context/ui-context.md) instead of
 * hardcoded values, so it follows the same light/dark media query as the
 * rest of the app with no separate light/dark config needed here.
 */
export const clerkAppearance: Appearance = {
  theme: dark,
  variables: {
    colorPrimary: "var(--accent-primary)",
    colorPrimaryForeground: "var(--bg-elevated)",
    colorDanger: "var(--state-error)",
    colorSuccess: "var(--state-success)",
    colorWarning: "var(--state-warning)",
    colorNeutral: "var(--text-primary)",
    colorForeground: "var(--text-primary)",
    colorMuted: "var(--bg-subtle)",
    colorMutedForeground: "var(--text-muted)",
    colorBackground: "var(--bg-elevated)",
    colorInputForeground: "var(--text-primary)",
    colorInput: "var(--bg-surface)",
    colorBorder: "var(--border-default)",
    colorRing: "var(--accent-primary)",
    fontFamily: "var(--font-geist-sans)",
    fontFamilyMono: "var(--font-geist-mono)",
    borderRadius: "0.625rem",
  },
};
