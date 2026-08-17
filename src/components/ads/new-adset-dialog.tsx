"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { AdsetSummary, AdsetTemplate } from "@/types/meta-ads";

interface Props {
  campaignId: string;
  campaignName: string;
  onCancel: () => void;
  onCreated: (adset: AdsetSummary) => void;
}

/** Countries this account runs; anything else can be typed in. */
const COUNTRY_CHOICES = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "GB", label: "United Kingdom" },
  { code: "NZ", label: "New Zealand" },
];

/** Account cents ("7000") ⇄ dollars ("70") for the money inputs. */
const centsToDollars = (cents: number | null) => (cents == null ? "" : String(cents / 100));
const dollarsToCents = (dollars: string) => {
  const n = Number(dollars);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

/**
 * Creates an ad set inside an existing campaign by cloning a sibling's
 * setup. Only the fields that actually vary between this account's ad sets
 * are editable — the rest is copied server-side from the source ad set.
 */
export function NewAdsetDialog({ campaignId, campaignName, onCancel, onCreated }: Props) {
  const [template, setTemplate] = useState<AdsetTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [sourceAdsetId, setSourceAdsetId] = useState<string>("");
  const [name, setName] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [extraCountries, setExtraCountries] = useState("");
  const [bid, setBid] = useState("");
  const [budget, setBudget] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED">("ACTIVE");

  const loadTemplate = useCallback(
    async (source?: string) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ campaignId });
        if (source) qs.set("sourceAdsetId", source);
        const res = await fetch(`/api/ads/adsets?${qs}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to read the campaign");
        const t = data as AdsetTemplate;
        setTemplate(t);
        setSourceAdsetId(t.sourceAdsetId || "");
        setName(t.name);
        const known = t.countries.filter((c) => COUNTRY_CHOICES.some((x) => x.code === c));
        setCountries(known);
        setExtraCountries(t.countries.filter((c) => !known.includes(c)).join(", "));
        setBid(centsToDollars(t.bidAmount));
        setBudget(centsToDollars(t.dailyBudget));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to read the campaign");
      } finally {
        setLoading(false);
      }
    },
    [campaignId]
  );

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const allCountries = [
    ...countries,
    ...extraCountries
      .split(/[,\s]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length === 2 && !countries.includes(c)),
  ];

  const needsBudget = template ? !template.campaignBudgetOptimization : false;
  const canSubmit =
    !!template &&
    !saving &&
    name.trim().length > 0 &&
    allCountries.length > 0 &&
    (!template.requiresBidAmount || dollarsToCents(bid) !== null) &&
    (!needsBudget || dollarsToCents(budget) !== null);

  async function submit() {
    if (!template || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ads/adsets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          sourceAdsetId: sourceAdsetId || null,
          name: name.trim(),
          countries: allCountries,
          bidAmount: template.requiresBidAmount ? dollarsToCents(bid) : null,
          dailyBudget: needsBudget ? dollarsToCents(budget) : null,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create the ad set");
      onCreated(data.adset as AdsetSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the ad set");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-5">
        <p className="text-sm font-semibold text-gray-900">New ad set</p>
        <p className="text-[12px] text-gray-500 mb-4">
          In <span className="font-medium text-gray-700">{campaignName}</span> — copies an
          existing ad set&apos;s setup, so only the fields below need answering.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the campaign…
          </div>
        ) : !template ? (
          <p className="text-[13px] text-red-600 py-6">{error}</p>
        ) : (
          <div className="space-y-3.5">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Copy settings from
              </label>
              <select
                value={sourceAdsetId}
                onChange={(e) => {
                  setSourceAdsetId(e.target.value);
                  loadTemplate(e.target.value);
                }}
                disabled={!template.sourceOptions.length}
                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                {template.sourceOptions.length ? (
                  template.sourceOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))
                ) : (
                  <option value="">Whitelisting defaults (campaign has no ad sets yet)</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Ad set name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contrast Winners // CA + USA // incremental /# of conv //"
                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Countries
              </label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-1.5">
                {COUNTRY_CHOICES.map((c) => (
                  <label
                    key={c.code}
                    className="flex items-center gap-1.5 text-[12.5px] text-gray-600 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={countries.includes(c.code)}
                      onChange={(e) =>
                        setCountries((prev) =>
                          e.target.checked
                            ? [...prev, c.code]
                            : prev.filter((x) => x !== c.code)
                        )
                      }
                      className="h-3 w-3 rounded border-gray-300"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <input
                value={extraCountries}
                onChange={(e) => setExtraCountries(e.target.value)}
                placeholder="Other country codes, comma separated (e.g. IE, NL)"
                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[12.5px]"
              />
            </div>

            <div className="flex gap-3">
              {template.requiresBidAmount && (
                <div className="flex-1">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                    {template.bidStrategy === "COST_CAP" ? "Cost cap" : "Bid cap"} ($)
                  </label>
                  <input
                    value={bid}
                    onChange={(e) => setBid(e.target.value)}
                    inputMode="decimal"
                    className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]"
                  />
                </div>
              )}
              {needsBudget && (
                <div className="flex-1">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                    Daily budget ($)
                  </label>
                  <input
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    inputMode="decimal"
                    className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]"
                  />
                </div>
              )}
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                  Start as
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "ACTIVE" | "PAUSED")}
                  className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] bg-white"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                </select>
              </div>
            </div>

            {template.campaignBudgetOptimization && (
              <p className="text-[11.5px] text-gray-500">
                This campaign holds the budget (CBO) — the new ad set shares it.
              </p>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Copied from {template.sourceAdsetName || "whitelisting defaults"}
              </p>
              <ul className="text-[12px] text-gray-600 space-y-0.5">
                {template.inherited.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12.5px] text-red-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-3.5 py-1.5 text-[13px] font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:bg-gray-300 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create ad set
          </button>
        </div>
      </div>
    </div>
  );
}
