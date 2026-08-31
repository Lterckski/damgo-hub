import Link from "next/link";
import { Construction } from "lucide-react";

interface ComingSoonProps {
  feature: string;
}

/**
 * Centered "not built yet" state for a nav destination whose feature-spec
 * unit hasn't been implemented — Meetings (16/17), Penalties (18), Ideas
 * (19), Admin (20). Styled to match components/shared/access-denied.tsx,
 * the app's other "here's why there's nothing here" state, rather than
 * inventing a third visual language for the same kind of page.
 */
export function ComingSoon({ feature }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-dim text-brand">
        <Construction className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-copy-secondary">
        {feature} isn&apos;t available yet — this part of Damgo Hub is still being built.
      </p>
      <Link href="/dashboard" className="text-sm font-semibold text-brand hover:underline">
        Back to Dashboard
      </Link>
    </div>
  );
}
