"use client";

import * as React from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";

import { formatPHP } from "@/lib/currency";
import type { OrgSettingsValues, PenaltyRule } from "@/lib/org-settings";
import { saveOrgSettings } from "@/lib/admin/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

/**
 * Part 2's org settings block — penalty rules and amounts, finance
 * categories, meeting cadence, invite policy.
 *
 * Saves as a partial patch: each sub-section sends only its own keys, so
 * two admins editing different sections don't overwrite each other with a
 * stale copy of the whole object.
 */

export function OrgSettingsPanel({ settings }: { settings: OrgSettingsValues }) {
  const { toast } = useToast();
  const [rules, setRules] = React.useState<PenaltyRule[]>(settings.penaltyRules);
  const [penaltyDueDays, setPenaltyDueDays] = React.useState(String(settings.penaltyDueDays));
  const [projectStaleDays, setProjectStaleDays] = React.useState(String(settings.projectStaleDays));
  const [categories, setCategories] = React.useState(settings.financeCategories);
  const [newCategory, setNewCategory] = React.useState("");
  const [cadence, setCadence] = React.useState(settings.meetingCadence);
  const [invitePolicy, setInvitePolicy] = React.useState(settings.invitePolicy);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const [ruleLabel, setRuleLabel] = React.useState("");
  const [rulePesos, setRulePesos] = React.useState("");

  async function save(key: string, payload: Record<string, unknown>) {
    setSavingKey(key);
    try {
      const result = await saveOrgSettings(payload);
      toast({ message: result.message, tone: result.ok ? "success" : "error" });
    } finally {
      setSavingKey(null);
    }
  }

  function addRule() {
    const pesos = Number.parseFloat(rulePesos);
    if (ruleLabel.trim() === "" || !Number.isFinite(pesos) || pesos < 0) return;
    setRules((current) => [...current, { label: ruleLabel.trim(), amountCents: Math.round(pesos * 100) }]);
    setRuleLabel("");
    setRulePesos("");
  }

  return (
    <div className="rounded-2xl bg-surface ring-1 ring-surface-border">
      <div className="flex items-center gap-2 border-b border-surface-border px-5 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-dim text-brand">
          <Settings2 className="h-4 w-4" />
        </span>
        <h3 className="text-xs font-bold tracking-[0.08em] text-copy-primary uppercase">
          Organization settings
        </h3>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        {/* Penalty rules ---------------------------------------------- */}
        <Block
          title="Penalty rules"
          description="Named presets the penalty form offers. Amounts are PHP."
        >
          {rules.length === 0 ? (
            <p className="text-sm text-copy-muted">
              No presets yet. Add one and every penalty form offers it as a one-click amount.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rules.map((rule, index) => (
                <li
                  key={`${rule.label}-${index}`}
                  className="flex items-center gap-2 rounded-xl bg-base px-3 py-2 ring-1 ring-surface-border"
                >
                  <span className="flex-1 text-sm text-copy-primary">{rule.label}</span>
                  <Badge variant="secondary">{formatPHP(rule.amountCents)}</Badge>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${rule.label}`}
                    onClick={() => setRules((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex gap-2">
            <Input
              value={ruleLabel}
              onChange={(event) => setRuleLabel(event.target.value)}
              placeholder="Late to meeting"
              className="text-copy-primary!"
            />
            <Input
              value={rulePesos}
              onChange={(event) => setRulePesos(event.target.value)}
              placeholder="50.00"
              inputMode="decimal"
              className="w-28 text-copy-primary!"
            />
            <Button variant="outline" size="icon" onClick={addRule} aria-label="Add rule">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <SaveRow
            isSaving={savingKey === "rules"}
            onSave={() => save("rules", { penaltyRules: rules })}
          />
        </Block>

        {/* Thresholds ------------------------------------------------- */}
        <Block
          title="Thresholds"
          description="Drive the Action Queue's “past due” rows and the stale-project exception card."
        >
          <LabelledInput
            label="Penalty due after (days)"
            value={penaltyDueDays}
            onChange={setPenaltyDueDays}
            hint="Used when a penalty has no explicit due date of its own."
          />
          <LabelledInput
            label="Project counts as idle after (days)"
            value={projectStaleDays}
            onChange={setProjectStaleDays}
          />
          <SaveRow
            isSaving={savingKey === "thresholds"}
            onSave={() =>
              save("thresholds", {
                penaltyDueDays: Number.parseInt(penaltyDueDays, 10),
                projectStaleDays: Number.parseInt(projectStaleDays, 10),
              })
            }
          />
        </Block>

        {/* Finance categories ------------------------------------------ */}
        <Block title="Finance categories" description="The categories a transaction can be filed under.">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <span
                key={category}
                className="inline-flex items-center gap-1 rounded-lg bg-base px-2 py-1 text-xs text-copy-primary ring-1 ring-surface-border"
              >
                {category}
                <button
                  type="button"
                  aria-label={`Remove ${category}`}
                  className="text-copy-faint transition-colors hover:text-state-error"
                  onClick={() => setCategories((current) => current.filter((c) => c !== category))}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || newCategory.trim() === "") return;
                event.preventDefault();
                setCategories((current) => [...new Set([...current, newCategory.trim()])]);
                setNewCategory("");
              }}
              placeholder="Add a category and press Enter"
              className="text-copy-primary!"
            />
          </div>

          <SaveRow
            isSaving={savingKey === "categories"}
            onSave={() => save("categories", { financeCategories: categories })}
          />
        </Block>

        {/* Cadence + invites ------------------------------------------- */}
        <Block title="Meetings and invites" description="Cadence is a stated norm; invite policy is enforced.">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold tracking-wide text-copy-primary uppercase">
              Meeting cadence
            </span>
            <select
              value={cadence}
              onChange={(event) => setCadence(event.target.value as typeof cadence)}
              className="h-9 rounded-xl border border-surface-border bg-base px-3 text-sm text-copy-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Every two weeks</option>
              <option value="MONTHLY">Monthly</option>
              <option value="AD_HOC">Ad hoc</option>
            </select>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            <span className="text-xs font-bold tracking-wide text-copy-primary uppercase">
              Invite policy
            </span>
            <select
              value={invitePolicy}
              onChange={(event) => setInvitePolicy(event.target.value as typeof invitePolicy)}
              className="h-9 rounded-xl border border-surface-border bg-base px-3 text-sm text-copy-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <option value="ADMIN_ONLY">Admins only</option>
              <option value="ANY_MEMBER">Any member may request</option>
            </select>
          </div>

          <SaveRow
            isSaving={savingKey === "meetings"}
            onSave={() => save("meetings", { meetingCadence: cadence, invitePolicy })}
          />
        </Block>
      </div>
    </div>
  );
}

function Block({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="text-xs font-bold tracking-wide text-copy-primary uppercase">{title}</h4>
      <p className="mt-0.5 mb-3 text-xs text-copy-muted">{description}</p>
      {children}
    </section>
  );
}

function LabelledInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <span className="text-xs font-bold tracking-wide text-copy-primary uppercase">{label}</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="numeric"
        className="w-32 text-copy-primary!"
      />
      {hint && <p className="text-xs text-copy-muted">{hint}</p>}
    </div>
  );
}

function SaveRow({ isSaving, onSave }: { isSaving: boolean; onSave: () => void }) {
  return (
    <div className="mt-3 flex justify-end">
      <Button size="sm" variant="outline" onClick={onSave} disabled={isSaving}>
        {isSaving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
