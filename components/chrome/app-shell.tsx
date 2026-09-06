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
    <div className="app-shell flex min-h-0 min-w-0 flex-col bg-base">
      {header ?? <AppNavbar rightSlot={navbarRightSlot} />}
      {/* The shell follows the visible viewport; min-h-0 keeps scrolling
          inside main when the browser chrome or on-screen keyboard changes. */}
      <main className="app-main min-h-0 min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
      <AppDock isAdmin={isAdmin} />
    </div>
  );
}
