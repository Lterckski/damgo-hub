"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NOTIFICATION_TYPES } from "@/lib/hub/visibility";
import { hubGet, hubPost } from "./hub-client";
interface Preference {
  type: string;
  enabled: boolean;
  email: boolean;
}
export function NotificationPreferences({ onClose }: { onClose: () => void }) {
  const [preferences, setPreferences] = useState<Preference[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    hubGet<{ preferences: Preference[] }>("mode=preferences", controller.signal)
      .then((d) => setPreferences(d.preferences))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  async function save(pref: Preference) {
    setBusy(true);
    setError("");
    try {
      await hubPost({ action: "preference", ...pref });
      setPreferences((previous) => [
        ...(previous ?? []).filter((p) => p.type !== pref.type),
        pref,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save preference");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogTitle className="text-lg font-bold text-copy-primary">
          Notification preferences
        </DialogTitle>
        <DialogDescription>
          Choose what reaches you and how. Changes apply to future deliveries.
        </DialogDescription>
        {error && (
          <p role="alert" className="text-error">
            {error}
          </p>
        )}
        {!preferences ? (
          <p>Loading your preferences…</p>
        ) : (
          <div className="divide-y divide-surface-border">
            {NOTIFICATION_TYPES.map((type) => {
              const pref = preferences.find((p) => p.type === type) ?? {
                type,
                enabled: true,
                email: type === "meeting",
              };
              return (
                <div
                  key={type}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <label className="flex items-center gap-3 font-medium capitalize">
                    <input
                      type="checkbox"
                      checked={pref.enabled}
                      disabled={busy}
                      onChange={(e) =>
                        void save({ ...pref, enabled: e.target.checked })
                      }
                      className="h-4 w-4 accent-brand"
                    />
                    {type}
                  </label>
                  <select
                    aria-label={`${type} delivery channel`}
                    className="max-w-48 rounded-lg border border-surface-border bg-surface p-2 text-sm text-copy-primary"
                    value={pref.email ? "email" : "app"}
                    disabled={!pref.enabled || busy}
                    onChange={(e) =>
                      void save({ ...pref, email: e.target.value === "email" })
                    }
                  >
                    <option value="app">In-app only</option>
                    <option value="email">In-app + email</option>
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
