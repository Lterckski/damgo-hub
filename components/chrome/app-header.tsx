"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  OrganizationSwitcher,
  useOrganization,
  UserButton,
} from "@clerk/nextjs";
import {
  Search,
  Plus,
  Settings,
  Moon,
  Building2,
  Shield,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SearchPalette, type CreateKind } from "./search-palette";
import { NotificationBell } from "./notification-bell";
import { HeaderCreate, createLabels } from "./header-create";
import { NotificationPreferences } from "./notification-preferences";

export function AppHeader({
  isAdmin,
  isRealAdmin,
  isViewingAsMember,
  memberName,
}: {
  isAdmin: boolean;
  isRealAdmin: boolean;
  isViewingAsMember: boolean;
  memberName: string;
}) {
  const { organization, isLoaded } = useOrganization();
  const [search, setSearch] = useState(false);
  const [create, setCreate] = useState<CreateKind | null>(null);
  const [preferences, setPreferences] = useState(false);
  const [orgPicker, setOrgPicker] = useState(false);
  const [themePicker, setThemePicker] = useState(false);
  const [createMenu, setCreateMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setSearch((value) => !value);
      }
    }
    const main = document.querySelector("main");
    function scroll() {
      setScrolled((main?.scrollTop ?? 0) > 4);
    }
    window.addEventListener("keydown", key);
    main?.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", key);
      main?.removeEventListener("scroll", scroll);
    };
  }, []);
  const [chosenTheme, setChosenTheme] = useState<string | null>(null);
  useEffect(() => {
    if (!chosenTheme) return;
    const value = chosenTheme;
    document.cookie = `damgo_theme=${value}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.dataset.theme = value;
  }, [chosenTheme]);
  function theme(value: string) {
    setChosenTheme(value);
    setThemePicker(false);
  }
  const kinds: CreateKind[] = [
    "task",
    "expense",
    "idea",
    "meeting",
    "doc",
    ...(isAdmin ? ["announcement" as const] : []),
  ];
  return (
    <>
      <header
        className={`z-30 flex h-16 shrink-0 items-center gap-3 border-b border-surface-border px-3 sm:gap-5 sm:px-5 ${scrolled ? "bg-surface/90 shadow-sm backdrop-blur-xl" : "bg-surface"}`}
      >
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Image
              src="/brand/logo.jpeg"
              width={30}
              height={30}
              alt="Damgo Hub"
              priority
              className="rounded-lg"
            />
            <span className="hidden text-sm font-semibold text-copy-primary lg:inline">
              Damgo Hub
            </span>
          </Link>
          <div className="hidden border-l border-surface-border pl-4 md:block">
            <OrganizationSwitcher
              hidePersonal
              afterSelectOrganizationUrl="/dashboard"
              afterSelectPersonalUrl="/dashboard"
            />
          </div>
        </div>
        <button
          type="button"
          aria-label="Search Damgo Hub"
          onClick={() => setSearch(true)}
          className="mx-auto hidden h-10 min-w-0 max-w-xl flex-1 items-center gap-3 rounded-xl border border-surface-border bg-base px-3 text-sm text-copy-secondary outline-none hover:border-brand focus-visible:ring-2 focus-visible:ring-brand md:flex"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Search anything…</span>
          <kbd className="rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[11px]">
            ⌘ K / Ctrl K
          </kbd>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            className="md:hidden"
            onClick={() => setSearch(true)}
          >
            <Search className="h-5 w-5" />
          </Button>
          <div className="hidden md:block">
            <Popover open={createMenu} onOpenChange={setCreateMenu}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Quick create"
                  />
                }
              >
                <Plus className="h-5 w-5" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 rounded-2xl p-2">
                <p className="px-3 py-2 text-xs font-bold uppercase text-copy-secondary">
                  Quick create
                </p>
                {kinds.map((kind) => (
                  <button
                    key={kind}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent-dim focus-visible:ring-2 focus-visible:ring-brand"
                    onClick={() => {
                      setCreateMenu(false);
                      setCreate(kind);
                    }}
                  >
                    {createLabels[kind]}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <NotificationBell />
          <span className="hidden rounded-md bg-accent-dim px-2 py-1 text-[10px] font-semibold text-brand xl:block">
            {isAdmin ? "Admin" : "Member"}
          </span>
          <div className="ml-1 flex h-8 w-8 items-center justify-center">
            {!isLoaded ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-subtle" />
            ) : (
              <UserButton>
                <UserButton.MenuItems>
                  <UserButton.Action
                    label={`${memberName} · ${isAdmin ? "Admin" : "Member"}`}
                    labelIcon={<Shield className="h-4 w-4" />}
                    onClick={() => {}}
                  />
                  <UserButton.Action
                    label={`${organization?.name ?? "Organization"} · Switch organization`}
                    labelIcon={<Building2 className="h-4 w-4" />}
                    onClick={() => setOrgPicker(true)}
                  />
                  <UserButton.Action
                    label="Notification preferences"
                    labelIcon={<Settings className="h-4 w-4" />}
                    onClick={() => setPreferences(true)}
                  />
                  <UserButton.Action
                    label="Theme"
                    labelIcon={<Moon className="h-4 w-4" />}
                    onClick={() => setThemePicker(true)}
                  />
                  {kinds.map((kind) => (
                    <UserButton.Action
                      key={kind}
                      label={createLabels[kind]}
                      labelIcon={<Plus className="h-4 w-4" />}
                      onClick={() => setCreate(kind)}
                    />
                  ))}
                  {isAdmin && (
                    <UserButton.Link
                      label="Admin"
                      href="/admin"
                      labelIcon={<Shield className="h-4 w-4" />}
                    />
                  )}
                  {isRealAdmin && (
                    <UserButton.Action
                      label={
                        isViewingAsMember
                          ? "Exit Member view (dev)"
                          : "View as Member (dev)"
                      }
                      labelIcon={<Eye className="h-4 w-4" />}
                      onClick={() => {
                        document.cookie = isViewingAsMember
                          ? "damgo_dev_view_as_member=; path=/; max-age=0"
                          : "damgo_dev_view_as_member=1; path=/; max-age=86400";
                        window.location.reload();
                      }}
                    />
                  )}
                </UserButton.MenuItems>
              </UserButton>
            )}
          </div>
        </div>
      </header>
      {search && (
        <SearchPalette
          open
          onClose={() => setSearch(false)}
          isAdmin={isAdmin}
          onCreate={setCreate}
        />
      )}
      {create && (
        <HeaderCreate
          key={create}
          kind={create}
          onClose={() => setCreate(null)}
        />
      )}
      {preferences && (
        <NotificationPreferences onClose={() => setPreferences(false)} />
      )}
      <Dialog open={orgPicker} onOpenChange={setOrgPicker}>
        <DialogContent className="rounded-3xl">
          <DialogTitle>Organization</DialogTitle>
          <DialogDescription>
            {organization?.name} · {isAdmin ? "Admin" : "Member"}
          </DialogDescription>
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
          />
        </DialogContent>
      </Dialog>
      <Dialog open={themePicker} onOpenChange={setThemePicker}>
        <DialogContent className="rounded-3xl">
          <DialogTitle>Appearance</DialogTitle>
          <DialogDescription>
            Choose a theme for this browser.
          </DialogDescription>
          <div className="flex gap-2">
            {["system", "light", "dark"].map((value) => (
              <Button
                key={value}
                variant="outline"
                onClick={() => theme(value)}
                className="capitalize"
              >
                {value}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
