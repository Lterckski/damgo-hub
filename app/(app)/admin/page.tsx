import { isCurrentMemberAdmin } from "@/lib/current-member";
import { AccessDenied } from "@/components/shared/access-denied";
import { BackButton } from "@/components/shared/back-button";
import { ComingSoon } from "@/components/shared/coming-soon";

// 20-admin-dashboard.md hasn't been built yet — this route exists (the
// dock already links here, admin-only) so visiting it says so plainly
// instead of 404ing. Gated the same way the dock icon itself is gated
// (isAdmin), as defense in depth against a non-admin hitting the URL
// directly. Member management (edit role tags, activate/deactivate,
// delete) already lives on /members, not here — this page is reserved for
// whatever unit 20 actually turns out to need beyond that.
export default async function AdminPage() {
  const isAdmin = await isCurrentMemberAdmin();
  if (!isAdmin) {
    return <AccessDenied backHref="/dashboard" backLabel="Back to Dashboard" />;
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="font-display text-3xl text-copy-primary">Admin</h1>
      </div>
      <ComingSoon feature="The admin dashboard" />
    </div>
  );
}
