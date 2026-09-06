import Image from "next/image";
import { Check } from "lucide-react";

interface AuthSplitLayoutProps {
  children: React.ReactNode;
}

const FEATURES = [
  "Project proposals & milestones",
  "Task assignment",
  "Financial tracking",
  "Meetings & agendas",
];

/**
 * Shared two-panel layout for the sign-in and sign-up pages. Large screens
 * get the left brand panel; small screens fall back to the form alone. See
 * ui-context.md's Contrast rule and Cards/widgets note — the left panel
 * uses the same accent-bar + high-contrast treatment as a dashboard widget
 * rather than shadcn's muted defaults, per 06-dashboard-home.md's reference.
 */
export function AuthSplitLayout({ children }: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-dvh bg-base">
      <div className="relative hidden w-full max-w-md flex-col justify-center gap-8 overflow-hidden border-r border-surface-border bg-surface px-12 lg:flex">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand to-collab" />
        <div>
          <Image
            src="/brand/logo.jpeg"
            alt="Damgo Hub"
            width={48}
            height={48}
            className="rounded-xl"
            priority
          />
          <h1 className="font-display mt-4 text-3xl text-copy-primary">
            Damgo Hub
          </h1>
          <p className="mt-2 text-sm text-copy-secondary">
            The shared workspace for our hackathon team.
          </p>
        </div>
        <ul className="space-y-3">
          {FEATURES.map((feature) => (
            <li
              key={feature}
              className="flex items-center gap-2.5 text-sm font-medium text-copy-primary"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-dim text-brand">
                <Check className="h-3 w-3" />
              </span>
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex min-w-0 flex-1 items-start justify-center px-2 py-6 sm:items-center sm:p-6">
        {children}
      </div>
    </div>
  );
}
