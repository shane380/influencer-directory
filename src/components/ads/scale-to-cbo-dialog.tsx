"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import type { CampaignSummary, PromotableAd, TargetsResponse } from "@/types/meta-ads";
import { NewAdsetDialog } from "./new-adset-dialog";

interface Props {
  adId: string;
  adName: string | null;
  onClose: () => void;
}

const NEW_ADSET_OPTION = "__new__";

/**
 * Re-run a proven test ad inside a scaling (CBO) ad set as a new ad on the
 * SAME post, so the likes and comments it earned carry over. The server reads
 * the post id from the source creative; this dialog only picks where it goes.
 */
export function ScaleToCboDialog({ adId, adName, onClose }: Props) {
  const [source, setSource] = useState<PromotableAd | null>(null);
  const [targets, setTargets] = useState<TargetsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [campaignId, setCampaignId] = useState("");
  const [adsetId, setAdsetId] = useState("");
  const [name, setName] = useState(adName || "");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED">("ACTIVE");
  const [newAdsetFor, setNewAdsetFor] = useState<CampaignSummary | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ adId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [srcRes, tgtRes] = await Promise.all([
          fetch(`/api/ads/promote?adId=${encodeURIComponent(adId)}`),
          fetch("/api/ads/targets"),
        ]);
        const src = await srcRes.json();
        if (!srcRes.ok) throw new Error(src.error || "Failed to read the ad");
        const tgt = await tgtRes.json();
        if (!tgtRes.ok) throw new Error(tgt.error || "Failed to load campaigns");
        if (cancelled) return;
        setSource(src as PromotableAd);
        setTargets(tgt as TargetsResponse);
        if (!adName && src.adName) setName(src.adName);
        // Default to the first active CBO campaign — that is the whole point.
        const campaigns = (tgt as TargetsResponse).campaigns;
        const firstCbo =
          campaigns.find((c) => c.cbo && c.effective_status === "ACTIVE") ||
          campaigns.find((c) => c.cbo);
        if (firstCbo) setCampaignId(firstCbo.id);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adId, adName]);

  const campaigns = useMemo(() => {
    const list = (targets?.campaigns || []).filter((c) => c.effective_status === "ACTIVE");
    // CBO first — they are the scaling destinations; ABO stays available.
    return [...list].sort((a, b) => Number(b.cbo) - Number(a.cbo));
  }, [targets]);
  const campaign = campaigns.find((c) => c.id === campaignId) || null;
  const adsets = (campaign?.adsets || []).filter(
    (a) => a.effective_status === "ACTIVE" || a.id === adsetId
  );

  const canSubmit =
    !!source?.postId &&
    !source.partnershipUnresolved &&
    !!adsetId &&
    adsetId !== source.adsetId &&
    name.trim().length > 0 &&
    !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ads/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, adsetId, name: name.trim(), status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to scale the ad");
      setDone({ adId: data.adId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scale the ad");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] bg-white";
  const labelCls = "block text-[10px] uppercase tracking-wide text-gray-400 mb-1";
  const loading = !source && !targets && !loadError;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-5">
        <p className="text-sm font-semibold text-gray-900">Scale to CBO</p>
        <p className="text-[12px] text-gray-500 mb-4">
          Runs this ad again in a scaling ad set as a new ad on the <span className="font-medium text-gray-700">same post</span>,
          so its likes and comments carry over.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-[13px] text-gray-500 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the ad on Meta…
          </div>
        )}

        {loadError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12.5px] text-red-700">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {done ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-[13px] text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">
                New ad created {status === "ACTIVE" ? "and live" : "(paused)"} in {campaign?.name || "the campaign"}.
              </p>
              <p className="text-[12px] text-emerald-700 mt-0.5">
                It shows here once the next Meta sync runs. Check the comment count on the new ad the first
                time you use this.
              </p>
              {targets && (
                <a
                  href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${targets.accountId}&selected_ad_ids=${done.adId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-emerald-900 underline underline-offset-2 mt-1.5"
                >
                  Open in Ads Manager <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        ) : (
          source &&
          targets && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Scaling</p>
                <p className="text-[13px] text-gray-900 truncate">{source.adName || "Untitled ad"}</p>
                <p className="text-[11.5px] text-gray-500 truncate">
                  {source.campaignName || "—"} › {source.adsetName || "—"}
                </p>
                {source.postId ? (
                  <p className="text-[11.5px] text-emerald-700 mt-1">
                    Existing post found — engagement will carry over.
                  </p>
                ) : (
                  <p className="text-[11.5px] text-red-600 mt-1">
                    Meta returned no post for this ad, so it can&apos;t be reused here.
                  </p>
                )}
                {source.partnershipUnresolved && (
                  <p className="text-[11.5px] text-amber-700 mt-1">
                    Partnership ad not published from here — the creator sponsor can&apos;t be re-attached.
                    Duplicate it in Ads Manager with the existing post instead.
                  </p>
                )}
                {source.partnershipSponsorId && (
                  <p className="text-[11.5px] text-gray-500 mt-1">Partnership tag will be re-attached.</p>
                )}
              </div>

              <div>
                <label className={labelCls}>Campaign</label>
                <select
                  value={campaignId}
                  onChange={(e) => {
                    setCampaignId(e.target.value);
                    setAdsetId("");
                  }}
                  className={inputCls}
                >
                  <option value="">Select campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cbo ? "CBO · " : ""}
                      {c.name}
                    </option>
                  ))}
                </select>
                {campaign && !campaign.cbo && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    This campaign budgets per ad set (ABO), not at campaign level.
                  </p>
                )}
              </div>

              <div>
                <label className={labelCls}>Ad set</label>
                <select
                  value={adsetId}
                  onChange={(e) => {
                    if (e.target.value === NEW_ADSET_OPTION) {
                      if (campaign) setNewAdsetFor(campaign);
                      return;
                    }
                    setAdsetId(e.target.value);
                  }}
                  disabled={!campaign}
                  className={inputCls}
                >
                  <option value="">Select ad set</option>
                  {adsets.map((a) => (
                    <option key={a.id} value={a.id} disabled={a.id === source.adsetId}>
                      {a.name}
                      {a.id === source.adsetId ? " (already here)" : ""}
                    </option>
                  ))}
                  {campaign && <option value={NEW_ADSET_OPTION}>+ New ad set…</option>}
                </select>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Ad name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </div>
                <div className="w-[130px]">
                  <label className={labelCls}>Start as</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "ACTIVE" | "PAUSED")}
                    className={inputCls}
                  >
                    <option value="ACTIVE">Live</option>
                    <option value="PAUSED">Paused</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12.5px] text-red-700">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="px-3.5 py-1.5 text-[13px] font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:bg-gray-300 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {status === "ACTIVE" ? "Scale and go live" : "Scale (paused)"}
            </button>
          )}
        </div>
      </div>

      {newAdsetFor && (
        <NewAdsetDialog
          campaignId={newAdsetFor.id}
          campaignName={newAdsetFor.name}
          onCancel={() => setNewAdsetFor(null)}
          onCreated={(adset) => {
            const cid = newAdsetFor.id;
            setNewAdsetFor(null);
            setTargets((prev) =>
              prev
                ? {
                    ...prev,
                    campaigns: prev.campaigns.map((c) =>
                      c.id === cid ? { ...c, adsets: [adset, ...c.adsets] } : c
                    ),
                  }
                : prev
            );
            setAdsetId(adset.id);
          }}
        />
      )}
    </div>
  );
}
