import Image from "next/image";
import Link from "next/link";

interface AppNavbarProps {
  /** Right section slot — the Clerk UserButton today; search/settings land here later, per ui-context.md. */
  rightSlot?: React.ReactNode;
}

export function AppNavbar({ rightSlot }: AppNavbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-border bg-surface px-4">
      <Link href="/dashboard" className="flex items-center gap-3">
        <Image
          src="/brand/logo.jpeg"
          alt="Damgo Hub"
          width={28}
          height={28}
          className="rounded-lg"
          priority
        />
        <span className="text-sm font-semibold text-copy-primary">
          Damgo Hub
        </span>
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-3">{rightSlot}</div>
    </header>
  );
}
