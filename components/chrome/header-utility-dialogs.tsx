"use client";

import { OrganizationSwitcher } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface HeaderUtilityDialogsProps {
  isAdmin: boolean;
  organizationName: string;
  orgPicker: boolean;
  themePicker: boolean;
  onOrgPickerChange: (open: boolean) => void;
  onThemePickerChange: (open: boolean) => void;
  onTheme: (theme: string) => void;
}

/** Header dialogs that do not need to join every route's initial graph. */
export function HeaderUtilityDialogs({
  isAdmin,
  organizationName,
  orgPicker,
  themePicker,
  onOrgPickerChange,
  onThemePickerChange,
  onTheme,
}: HeaderUtilityDialogsProps) {
  return (
    <>
      <Dialog open={orgPicker} onOpenChange={onOrgPickerChange}>
        <DialogContent className="rounded-3xl">
          <DialogTitle>Organization</DialogTitle>
          <DialogDescription>
            {organizationName} · {isAdmin ? "Admin" : "Member"}
          </DialogDescription>
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
          />
        </DialogContent>
      </Dialog>
      <Dialog open={themePicker} onOpenChange={onThemePickerChange}>
        <DialogContent className="rounded-3xl">
          <DialogTitle>Appearance</DialogTitle>
          <DialogDescription>Choose a theme for this browser.</DialogDescription>
          <div className="flex gap-2">
            {["system", "light", "dark"].map((value) => (
              <Button
                key={value}
                variant="outline"
                onClick={() => onTheme(value)}
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
