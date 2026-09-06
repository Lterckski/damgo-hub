import React from "react";
export const useOrganization = () => ({
  organization: { id: "fixture", name: "Damgo Hub" },
  isLoaded: true,
});
export const OrganizationSwitcher = () => <button>Damgo Hub</button>;
export const UserButton = () => (
  <button
    aria-label="Account"
    style={{
      width: 32,
      height: 32,
      borderRadius: "50%",
      background: "var(--bg-subtle)",
    }}
  >
    A
  </button>
);
UserButton.MenuItems = function UserButtonMenuItems({ children }) {
  return <>{children}</>;
};
UserButton.Action = function UserButtonAction() {
  return null;
};
UserButton.Link = function UserButtonLink() {
  return null;
};
