"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import type { CampaignSummary, PromotableAd, TargetsResponse } from "@/types/meta-ads";
import { NewAdsetDialog } from "./new-adset-dialog";

export interface ScaleTarget {
  adId: string;
  adName: string | null;
}

interface Props {
  ads: ScaleTarget[];
  onClose: () => void;
}

const NEW_ADSET_OPTION = "__new__";

type SourceState = { ad: PromotableAd } | { error: string };
type RunState =
  | { phase: "queued" }
  | { phase: "running" }
  | { phase: "done"; newAdId: string }
  | { phase: "failed"; error: string }
  | { phase: "skipped"; reason: string };

/** Why an ad can't be scaled as-is; null when it can. */
function blocker(src: SourceState, adsetId: string): string | null {
  if ("error" in src) return src.error;
  if (!src.ad.postId) return "No post to reuse";
  if (src.ad.partnershipUnresolved) return "Partnership ad not published from here";
  if (adsetId && src.ad.adsetId === adsetId) return "Already in that ad set";
  return null;
}

/**
 * Re-run proven test ads inside a scaling (CBO) ad set as new ads on the
 * SAME posts, so the likes and comments they earned carry over. The server
 * reads each post id from the source creative; this dialog only picks where
 * they go, then runs the batch one ad at a time so a failure is per ad.
 */
export function ScaleToCboDialog({ ads, onClose }: Props) {
  const single = ads.length === 1;
  const [sources, setSources] = useState<Record<string, SourceState>>({});
  const [targets, setTargets] = useState<TargetsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [campaignId, setCampaignId] = useState("");
  const [adsetId, setAdsetId] = useState("");
  const [name, setName] = useState(single ? ads[0].adName || "" : "");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED">("ACTIVE");
  const [newAdsetFor, setNewAdsetFor] = useState<CampaignSummary | null>(null);

  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [running, setRunning] = useState(false);
  const finished = !running && Object.keys(runs).length > 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tgtRes, ...srcResults] = await Promise.all([
          fetch("/api/ads/targets"),
          ...ads.map((a) =>
            fetch(`/api/ads/promote?adId=${encodeURIComponent(a.adId)}`)
              .then(async (r) => {
                const data = await r.json();
                if (!r.ok) throw new Error(data.error || "Failed to read the ad");
                return { ad: data as PromotableAd } as SourceState;
              })
              .catch((err) => ({ error: err instanceof Error ? err.message : "Failed to read" }) as SourceState)
          ),
        ]);
        const tgt = await tgtRes.json();
        if (!tgtRes.ok) throw new Error(tgt.error || "Failed to load campaigns");
        if (cancelled) return;
        const map: Record<string, SourceState> = {};
        ads.forEach((a, i) => {
          map[a.adId] = srcResults[i];
        });
        setSources(map);
        setTargets(tgt as TargetsResponse);
        if (single) {
          const first = srcResults[0];
          if (!ads[0].adName && "ad" in first && first.ad.adName) setName(first.ad.adName);
        }
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
    // The ad list is fixed for the life of the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const campaigns = useMemo(() => {
    const list = (targets?.campaigns || []).filter((c) => c.effective_status === "ACTIVE");
    // CBO first — they are the scaling destinations; ABO stays available.
    return [...list].sort((a, b) => Number(b.cbo) - Number(a.cbo));
  }, [targets]);
  const campaign = campaigns.find((c) => c.id === campaignId) || null;
  const adsets = (campaign?.adsets || []).filter(
    (a) => a.effective_status === "ACTIVE" || a.id === adsetId
  );

  const loaded = !!targets && Object.keys(sources).length === ads.length;
  const eligible = ads.filter((a) => sources[a.adId] && !blocker(sources[a.adId], adsetId));
  const canSubmit =
    loaded && !!adsetId && eligible.length > 0 && !running && !finished && (!single || name.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    setRunning(true);
    const initial: Record<string, RunState> = {};
    for (const a of ads) {
      const why = blocker(sources[a.adId], adsetId);
      initial[a.adId] = why ? { phase: "skipped", reason: why } : { phase: "queued" };
    }
    setRuns(initial);

    // One at a time: Meta rate-limits bursts, and a per-ad failure should
    // leave the others' outcomes legible rather than abort the batch.
    for (const a of eligible) {
      setRuns((r) => ({ ...r, [a.adId]: { phase: "running" } }));
      try {
        const res = await fetch("/api/ads/promote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adId: a.adId,
            adsetId,
            name: single ? name.trim() : null,
            status,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to scale the ad");
        setRuns((r) => ({ ...r, [a.adId]: { phase: "done", newAdId: data.adId } }));
      } catch (err) {
        setRuns((r) => ({
          ...r,
          [a.adId]: { phase: "failed", error: err instanceof Error ? err.message : "Failed" },
        }));
      }
    }
    setRunning(false);
  }

  const doneCount = Object.values(runs).filter((r) => r.phase === "done").length;
  const failedCount = Object.values(runs).filter((r) => r.phase === "failed").length;

  const inputCls = "w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] bg-white";
  const labelCls = "block text-[10px] uppercase tracking-wide text-gray-400 mb-1";

  function RunBadge({ run }: { run: RunState | undefined }) {
    if (!run) return null;
    switch (run.phase) {
      case "queued":
        return <span className="text-[11px] text-gray-400">Queued</span>;
      case "running":
        return (
          <span className="text-[11px] text-gray-600 inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Creating…
          </span>
        );
      case "done":
        return (
          <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Created
            {targets && (
              <a
                href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${targets.accountId}&selected_ad_ids=${run.newAdId}`}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 inline-flex items-center gap-0.5"
              >
                view <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </span>
        );
      case "failed":
        return (
          <span className="text-[11px] text-red-600 inline-flex items-center gap-1" title={run.error}>
            <XCircle className="h-3 w-3" /> {run.error}
          </span>
        );
      case "skipped":
        return <span className="text-[11px] text-amber-700">Skipped — {run.reason}</span>;
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[600px] max-h-[90vh] overflow-y-auto p-5">
        <p className="text-sm font-semibold text-gray-900">
          Scale to CBO{single ? "" : ` · ${ads.length} ads`}
        </p>
        <p className="text-[12px] text-gray-500 mb-4">
          Runs {single ? "this ad" : "these ads"} again in a scaling ad set as new ads on the{" "}
          <span className="font-medium text-gray-700">same posts</span>, so their likes and comments carry over.
        </p>

        {!loaded && !loadError && (
          <div className="flex items-center gap-2 text-[13px] text-gray-500 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading {single ? "the ad" : `${ads.length} ads`} on Meta…
          </div>
        )}

        {loadError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12.5px] text-red-700">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {loaded && (
          <div className="space-y-4">
            {/* The ads being scaled, each with what blocks it or how its run went. */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 max-h-[220px] overflow-y-auto">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">
                Scaling {single ? "" : `${eligible.length} of ${ads.length}`}
              </p>
              <ul className="space-y-1.5">
                {ads.map((a) => {
                  const src = sources[a.adId];
                  const why = blocker(src, adsetId);
                  const info = "ad" in src ? src.ad : null;
                  return (
                    <li key={a.adId} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12.5px] text-gray-900 truncate">
                          {info?.adName || a.adName || "Untitled ad"}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {info ? `${info.campaignName || "—"} › ${info.adsetName || "—"}` : ""}
                          {info?.partnershipSponsorId ? " · partnership tag re-attached" : ""}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {runs[a.adId] ? (
                          <RunBadge run={runs[a.adId]} />
                        ) : why ? (
                          <span className="text-[11px] text-amber-700">{why}</span>
                        ) : (
                          <span className="text-[11px] text-emerald-700">Post found</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {finished ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-[13px] text-emerald-800">
                <p className="font-medium">
                  {doneCount} new ad{doneCount === 1 ? "" : "s"} created {status === "ACTIVE" ? "and live" : "(paused)"} in{" "}
                  {campaign?.name || "the campaign"}
                  {failedCount > 0 ? ` · ${failedCount} failed` : ""}.
                </p>
                <p className="text-[12px] text-emerald-700 mt-0.5">
                  They show here once the next Meta sync runs. Check the comment count on a new ad the first time
                  you use this.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelCls}>Campaign</label>
                  <select
                    value={campaignId}
                    onChange={(e) => {
                      setCampaignId(e.target.value);
                      setAdsetId("");
                    }}
                    disabled={running}
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
                    disabled={!campaign || running}
                    className={inputCls}
                  >
                    <option value="">Select ad set</option>
                    {adsets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                    {campaign && <option value={NEW_ADSET_OPTION}>+ New ad set…</option>}
                  </select>
                </div>

                <div className="flex gap-3">
                  {single ? (
                    <div className="flex-1">
                      <label className={labelCls}>Ad name</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={running}
                        className={inputCls}
                      />
                    </div>
                  ) : (
                    <p className="flex-1 self-end text-[11.5px] text-gray-500 pb-1.5">
                      Each new ad keeps its original name.
                    </p>
                  )}
                  <div className="w-[130px]">
                    <label className={labelCls}>Start as</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as "ACTIVE" | "PAUSED")}
                      disabled={running}
                      className={inputCls}
                    >
                      <option value="ACTIVE">Live</option>
                      <option value="PAUSED">Paused</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={running}
            className="px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            {finished ? "Close" : "Cancel"}
          </button>
          {!finished && (
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="px-3.5 py-1.5 text-[13px] font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:bg-gray-300 flex items-center gap-1.5"
            >
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {running
                ? `Scaling ${doneCount + failedCount + 1} of ${eligible.length}…`
                : single
                  ? status === "ACTIVE"
                    ? "Scale and go live"
                    : "Scale (paused)"
                  : `Scale ${eligible.length} ad${eligible.length === 1 ? "" : "s"}${status === "ACTIVE" ? " live" : " paused"}`}
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
