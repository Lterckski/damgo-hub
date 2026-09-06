import { AppNavbar } from "@/components/chrome/app-navbar";
import { AppDock } from "@/components/chrome/app-dock";

interface AppShellProps {
  isAdmin: boolean;
  /** Right section slot for the navbar — the Clerk UserButton, wired in by 03-auth.md. */
  navbarRightSlot?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  isAdmin,
  navbarRightSlot,
  header,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full min-h-screen flex-col bg-base">
      {header ?? <AppNavbar rightSlot={navbarRightSlot} />}
      {/* min-h-0 overrides a flex item's default min-height:auto — without
          it, a tall page (a long extracted doc, a big textarea) can grow
          `main` past its flex-basis allocation, which grows this whole
          column past min-h-screen and forces the *body* to scroll instead
          of main's own overflow-y-auto — dragging the navbar/dock along
          with the page content instead of leaving them fixed in place. */}
      <main className="min-h-0 flex-1 overflow-y-auto pb-24">{children}</main>
      <AppDock isAdmin={isAdmin} />
    </div>
  );
}
