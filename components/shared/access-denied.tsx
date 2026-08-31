import Link from "next/link";
import { Lock } from "lucide-react";

interface AccessDeniedProps {
  message?: string;
  backHref: string;
  backLabel: string;
}

/**
 * Centered "you can't see this" state — for a project a member isn't the
 * owner or a collaborator on (or that doesn't exist), and any future
 * resource with the same owner/collaborator access model. See
 * 11-project-proposals.md.
 */
export function AccessDenied({
  message = "You don't have access to this — it's only visible to its owner and assigned collaborators.",
  backHref,
  backLabel,
}: AccessDeniedProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-dim text-brand">
        <Lock className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-copy-secondary">{message}</p>
      <Link href={backHref} className="text-sm font-semibold text-brand hover:underline">
        {backLabel}
      </Link>
    </div>
  );
}
