import { redirect } from "next/navigation";

import { isCurrentMemberAdmin } from "@/lib/current-member";

// The real protection boundary for every route under /admin/* — see
// 20-admin-dashboard.md's Access section. isCurrentMemberAdmin() checks
// the Clerk org:admin role (not any field on Member), same as everywhere
// else in the app that gates Admin-only actions. A server-side redirect,
// not a client-side hidden nav link — a non-admin hitting any /admin/*
// URL directly never even renders the page underneath.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await isCurrentMemberAdmin();
  if (!isAdmin) {
    redirect("/dashboard");
  }

  return children;
}
