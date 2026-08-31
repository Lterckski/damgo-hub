import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/chrome/app-shell";
import { isCurrentMemberAdmin } from "@/lib/current-member";

// The real protection boundary for every route under (app) — per
// proxy.ts, this is where "protect everything except sign-in/sign-up"
// actually happens now, not middleware path matching.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const isAdmin = await isCurrentMemberAdmin();

  return (
    <AppShell isAdmin={isAdmin} navbarRightSlot={<UserButton />}>
      {children}
    </AppShell>
  );
}
