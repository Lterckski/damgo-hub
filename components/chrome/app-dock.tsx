"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  Wallet,
  FileText,
  Calendar,
  Video,
  ShieldAlert,
  Users,
  Lightbulb,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
  { label: "Finance", href: "/finance", icon: Wallet },
  { label: "Documentation", href: "/docs", icon: FileText },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Meetings", href: "/meetings", icon: Video },
  { label: "Penalties", href: "/penalties", icon: ShieldAlert },
  { label: "Members", href: "/members", icon: Users },
  { label: "Ideas", href: "/ideas", icon: Lightbulb },
];

const ADMIN_ITEM: NavItem = { label: "Admin", href: "/admin", icon: ShieldCheck };

interface AppDockProps {
  isAdmin: boolean;
}

/**
 * Floating bottom taskbar-style nav — icon-only, hover reveals a label
 * tooltip above each icon. Replaces the old side sidebar entirely; see
 * ui-context.md's Layout Patterns > Bottom dock.
 *
 * Collapsed by default — a small handle is the only persistent hint it's
 * there. The whole bottom strip of the viewport is the hover/focus trigger
 * zone (not just the handle), so it reveals as soon as the pointer nears
 * the bottom edge, the same way it would if the dock itself were already
 * visible. Keyboard users get the same reveal via focus-within, so tabbing
 * to a nav item still works without a mouse.
 */
export function AppDock({ isAdmin }: AppDockProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <div className="group/dock fixed inset-x-0 bottom-0 z-50 flex h-6 justify-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-2 h-1 w-10 rounded-full bg-copy-faint/60 transition-opacity duration-200 group-hover/dock:opacity-0 group-focus-within/dock:opacity-0"
      />
      <nav
        className="absolute bottom-3 translate-y-[130%] opacity-0 transition-all duration-200 ease-out group-hover/dock:translate-y-0 group-hover/dock:opacity-100 group-focus-within/dock:translate-y-0 group-focus-within/dock:opacity-100"
      >
        <div className="flex items-center gap-1 rounded-full border border-surface-border bg-elevated px-2 py-2 shadow-lg shadow-black/20">
          {NAV_ITEMS.map((item) => (
            <DockIcon key={item.href} item={item} isActive={isActive(item.href)} />
          ))}
          {isAdmin && (
            <>
              <div className="mx-1 h-6 w-px bg-surface-border" />
              <DockIcon item={ADMIN_ITEM} isActive={isActive(ADMIN_ITEM.href)} />
            </>
          )}
        </div>
      </nav>
    </div>
  );
}

function DockIcon({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      className={cn(
        "group relative flex h-10 w-10 items-center justify-center rounded-full transition-colors",
        isActive
          ? "bg-accent-dim text-brand"
          : "text-copy-secondary hover:bg-subtle hover:text-copy-primary",
      )}
    >
      <item.icon className="h-5 w-5" />
      <span
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-surface-border bg-elevated px-2 py-1 text-xs text-copy-primary opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100"
        role="tooltip"
      >
        {item.label}
      </span>
    </Link>
  );
}
