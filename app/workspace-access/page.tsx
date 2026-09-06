import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import Link from "next/link";
export default function WorkspaceAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-base p-6">
      <div className="max-w-md space-y-5 rounded-3xl border border-surface-border bg-surface p-8">
        <h1 className="font-display text-2xl">
          Choose your Damgo Hub organization
        </h1>
        <p className="text-sm text-copy-secondary">
          This workspace is connected to one organization. Select that
          organization to continue, or ask your team leader to confirm your
          membership.
        </p>
        <div className="flex items-center justify-between">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
          />
          <UserButton />
        </div>
        <Link href="/dashboard" className="inline-block text-sm text-brand">
          Try the dashboard again →
        </Link>
      </div>
    </main>
  );
}
