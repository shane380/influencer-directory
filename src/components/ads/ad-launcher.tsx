"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { uploadToR2 } from "@/lib/r2-upload";
import type {
  AdCopy,
  AssetKind,
  AssetRole,
  DraftAsset,
  LauncherDefaults,
  TargetsResponse,
} from "@/types/meta-ads";
import { IgFeedPreview } from "./ig-feed-preview";
import { IgReelsPreview } from "./ig-reels-preview";
import { ReviewQueue } from "./review-queue";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

interface SlotState {
  kind: AssetKind;
  fileName: string;
  previewUrl: string;
  uploading: boolean;
  progress: number;
  r2Url: string | null;
  thumbUrl: string | null;
  error: string | null;
}

type AdPhase = "idle" | "working" | "done" | "error";

interface AdState {
  localId: string;
  adName: string;
  partnership: boolean;
  sponsorId: string;
  sponsorLabel: string;
  feed: SlotState | null;
  vertical: SlotState | null;
  copy: AdCopy;
  phase: AdPhase;
  phaseMsg: string;
  metaAdId: string | null;
}

interface Preset {
  name: string;
  copy: AdCopy;
}

const PRESETS_KEY = "adsLauncher.presets.v1";
const DRAFT_KEY = "adsLauncher.draft.v1";

const emptyCopy = (defaults?: LauncherDefaults | null): AdCopy => ({
  primaryText: "",
  headline: "",
  description: "",
  link: defaults?.suggestedLink || "",
  cta: "SHOP_NOW",
  urlTags: defaults?.suggestedUrlTags || "",
});

let idCounter = 0;
const nextId = () => `ad-${Date.now()}-${idCounter++}`;

function newAd(defaults?: LauncherDefaults | null): AdState {
  return {
    localId: nextId(),
    adName: "",
    partnership: false,
    sponsorId: "",
    sponsorLabel: "",
    feed: null,
    vertical: null,
    copy: emptyCopy(defaults),
    phase: "idle",
    phaseMsg: "",
    metaAdId: null,
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "-").slice(-80);
}

async function makeVideoThumb(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;
    const fail = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      } catch {
        fail();
      }
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx || !canvas.width) return fail();
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob);
        },
        "image/jpeg",
        0.85
      );
    };
    video.onerror = fail;
  });
}

export function AdLauncher({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"create" | "review">(
    searchParams?.get("review") ? "review" : "create"
  );
  const [defaults, setDefaults] = useState<LauncherDefaults | null>(null);
  const [targets, setTargets] = useState<TargetsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(true);

  const [campaignId, setCampaignId] = useState("");
  const [adsetId, setAdsetId] = useState("");
  const [ads, setAds] = useState<AdState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [publishLive, setPublishLive] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [showPaused, setShowPaused] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const restoredRef = useRef(false);

  const selected = ads.find((a) => a.localId === selectedId) || null;
  const campaign = targets?.campaigns.find((c) => c.id === campaignId) || null;
  const adset = campaign?.adsets.find((a) => a.id === adsetId) || null;

  // Hide paused campaigns/ad sets unless asked — but never hide the current selection.
  const visibleCampaigns = (targets?.campaigns || []).filter(
    (c) => showPaused || c.effective_status === "ACTIVE" || c.id === campaignId
  );
  const visibleAdsets = (campaign?.adsets || []).filter(
    (a) => showPaused || a.effective_status === "ACTIVE" || a.id === adsetId
  );

  const fetchTargets = useCallback(async () => {
    setLoadingTargets(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/ads/targets");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load campaigns");
      setTargets(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  useEffect(() => {
    fetchTargets();
    fetch("/api/ads/defaults")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setDefaults(d);
      })
      .catch(() => {});
    if (isAdmin) {
      fetch("/api/ads/drafts")
        .then((r) => r.json())
        .then((d) => setPendingCount(d.queue?.length || 0))
        .catch(() => {});
    }
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch {}
  }, [fetchTargets, isAdmin]);

  // Restore the autosaved draft once.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) {
        setAds([newAd(null)]);
        return;
      }
      const saved = JSON.parse(raw);
      setCampaignId(saved.campaignId || "");
      setAdsetId(saved.adsetId || "");
      const restored: AdState[] = (saved.ads || []).map((a: any) => ({
        ...newAd(null),
        adName: a.adName || "",
        partnership: !!a.partnership,
        sponsorId: a.sponsorId || "",
        sponsorLabel: a.sponsorLabel || "",
        copy: { ...emptyCopy(null), ...(a.copy || {}) },
        feed: a.feed?.r2Url
          ? {
              kind: a.feed.kind,
              fileName: a.feed.fileName || "creative",
              previewUrl: a.feed.r2Url,
              uploading: false,
              progress: 100,
              r2Url: a.feed.r2Url,
              thumbUrl: a.feed.thumbUrl || null,
              error: null,
            }
          : null,
        vertical: a.vertical?.r2Url
          ? {
              kind: a.vertical.kind,
              fileName: a.vertical.fileName || "creative",
              previewUrl: a.vertical.r2Url,
              uploading: false,
              progress: 100,
              r2Url: a.vertical.r2Url,
              thumbUrl: a.vertical.thumbUrl || null,
              error: null,
            }
          : null,
      }));
      setAds(restored.length ? restored : [newAd(null)]);
    } catch {
      setAds([newAd(null)]);
    }
  }, []);

  useEffect(() => {
    if (!selectedId && ads.length) setSelectedId(ads[0].localId);
  }, [ads, selectedId]);

  // Autosave everything restorable.
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          campaignId,
          adsetId,
          ads: ads.map((a) => ({
            adName: a.adName,
            partnership: a.partnership,
            sponsorId: a.sponsorId,
            sponsorLabel: a.sponsorLabel,
            copy: a.copy,
            feed: a.feed?.r2Url
              ? { kind: a.feed.kind, fileName: a.feed.fileName, r2Url: a.feed.r2Url, thumbUrl: a.feed.thumbUrl }
              : null,
            vertical: a.vertical?.r2Url
              ? { kind: a.vertical.kind, fileName: a.vertical.fileName, r2Url: a.vertical.r2Url, thumbUrl: a.vertical.thumbUrl }
              : null,
          })),
        })
      );
    } catch {}
  }, [ads, campaignId, adsetId]);

  const updateAd = useCallback((localId: string, patch: Partial<AdState>) => {
    setAds((prev) => prev.map((a) => (a.localId === localId ? { ...a, ...patch } : a)));
  }, []);

  const updateCopy = useCallback(
    (localId: string, patch: Partial<AdCopy>) => {
      setAds((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, copy: { ...a.copy, ...patch } } : a))
      );
    },
    []
  );

  const handleFile = useCallback(
    async (localId: string, role: AssetRole, file: File) => {
      const kind: AssetKind | null = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : null;
      if (!kind) return;

      const previewUrl = URL.createObjectURL(file);
      const slot: SlotState = {
        kind,
        fileName: file.name,
        previewUrl,
        uploading: true,
        progress: 0,
        r2Url: null,
        thumbUrl: null,
        error: null,
      };
      updateAd(localId, { [role === "feed" ? "feed" : "vertical"]: slot } as Partial<AdState>);
      setAds((prev) =>
        prev.map((a) =>
          a.localId === localId && !a.adName.trim()
            ? { ...a, adName: file.name.replace(/\.[^.]+$/, "") }
            : a
        )
      );

      const setSlot = (patch: Partial<SlotState>) => {
        setAds((prev) =>
          prev.map((a) => {
            if (a.localId !== localId) return a;
            const current = role === "feed" ? a.feed : a.vertical;
            if (!current) return a;
            return { ...a, [role === "feed" ? "feed" : "vertical"]: { ...current, ...patch } };
          })
        );
      };

      try {
        const key = `meta-ads/${Date.now()}-${sanitizeFileName(file.name)}`;
        const { url } = await uploadToR2({
          key,
          contentType: file.type,
          body: file,
          onProgress: (p) => setSlot({ progress: p }),
        });

        let thumbUrl: string | null = null;
        if (kind === "video") {
          const thumb = await makeVideoThumb(file);
          if (thumb) {
            const thumbRes = await uploadToR2({
              key: `${key}-thumb.jpg`,
              contentType: "image/jpeg",
              body: thumb,
            });
            thumbUrl = thumbRes.url;
          }
        }
        setSlot({ uploading: false, progress: 100, r2Url: url, thumbUrl });
      } catch (err) {
        setSlot({
          uploading: false,
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [updateAd]
  );

  const validateAd = useCallback(
    (ad: AdState): string | null => {
      if (!ad.adName.trim()) return "Name the ad";
      if (!ad.feed?.r2Url) return "Upload a feed creative";
      if (ad.feed.uploading || ad.vertical?.uploading) return "Still uploading";
      if (ad.vertical && ad.vertical.kind !== ad.feed.kind) {
        return "Feed and 9:16 must both be images or both videos";
      }
      if (ad.partnership && !ad.sponsorId.trim()) return "Pick or enter the partner's IG ID";
      if (!ad.copy.primaryText.trim()) return "Write the primary text";
      if (!ad.copy.link.trim()) return "Add the website URL";
      return null;
    },
    []
  );

  const publishAll = useCallback(async () => {
    if (!campaign || !adset || !defaults?.pageId || publishing) return;
    setPublishing(true);

    for (const ad of ads) {
      if (ad.phase === "done") continue;
      const invalid = validateAd(ad);
      if (invalid) {
        updateAd(ad.localId, { phase: "error", phaseMsg: invalid });
        continue;
      }

      updateAd(ad.localId, { phase: "working", phaseMsg: "Saving draft…" });
      const assets: DraftAsset[] = [
        {
          role: "feed",
          kind: ad.feed!.kind,
          fileUrl: ad.feed!.r2Url!,
          thumbnailUrl: ad.feed!.thumbUrl,
        },
      ];
      if (ad.vertical?.r2Url) {
        assets.push({
          role: "vertical",
          kind: ad.vertical.kind,
          fileUrl: ad.vertical.r2Url,
          thumbnailUrl: ad.vertical.thumbUrl,
        });
      }

      try {
        const submitRes = await fetch("/api/ads/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adName: ad.adName,
            campaignId: campaign.id,
            campaignName: campaign.name,
            adsetId: adset.id,
            adsetName: adset.name,
            pageId: defaults.pageId,
            instagramUserId: defaults.instagramUserId,
            partnershipSponsorId: ad.partnership ? ad.sponsorId.trim() : null,
            partnershipSponsorLabel: ad.partnership ? ad.sponsorLabel.trim() || null : null,
            assets,
            copy: ad.copy,
          }),
        });
        const submitData = await submitRes.json();
        if (!submitRes.ok) throw new Error(submitData.error || "Could not save the draft");

        if (!isAdmin) {
          updateAd(ad.localId, { phase: "done", phaseMsg: "Submitted for approval" });
          continue;
        }

        updateAd(ad.localId, { phase: "working", phaseMsg: "Publishing to Meta…" });
        const pubRes = await fetch("/api/ads/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draftId: submitData.draftId,
            status: publishLive ? "ACTIVE" : "PAUSED",
          }),
        });
        const pubData = await pubRes.json();
        if (!pubRes.ok) throw new Error(pubData.error || "Publishing failed");
        updateAd(ad.localId, {
          phase: "done",
          phaseMsg: publishLive ? "Live on Meta" : "Created (paused)",
          metaAdId: pubData.adId,
        });
      } catch (err) {
        updateAd(ad.localId, {
          phase: "error",
          phaseMsg: err instanceof Error ? err.message : "Failed",
        });
      }
    }

    setPublishing(false);
  }, [ads, adset, campaign, defaults, isAdmin, publishLive, publishing, updateAd, validateAd]);

  const savePreset = useCallback(() => {
    if (!selected) return;
    const name = window.prompt("Preset name");
    if (!name?.trim()) return;
    const next = [
      ...presets.filter((p) => p.name !== name.trim()),
      { name: name.trim(), copy: selected.copy },
    ];
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {}
  }, [presets, selected]);

  const deletePreset = useCallback(
    (name: string) => {
      const next = presets.filter((p) => p.name !== name);
      setPresets(next);
      try {
        localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
      } catch {}
    },
    [presets]
  );

  const readyCount = ads.filter((a) => !validateAd(a) && a.phase !== "done").length;
  const ctaLabel = useMemo(
    () =>
      defaults?.ctaOptions.find((c) => c.value === selected?.copy.cta)?.label || "Shop now",
    [defaults, selected]
  );

  const identityName = selected?.partnership
    ? selected.sponsorLabel || "creator"
    : defaults?.pageName || "Your page";
  const identitySub = selected?.partnership
    ? `Paid partnership · ${defaults?.pageName || "brand"}`
    : "Sponsored";

  const feedMedia = selected?.feed;
  const verticalMedia = selected?.vertical || selected?.feed;

  return (
    <div>
      <div className="flex items-center gap-1 mb-5">
        <button
          onClick={() => setTab("create")}
          className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
            tab === "create" ? "bg-gray-900 text-white font-medium" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          Create
        </button>
        <button
          onClick={() => {
            setTab("review");
            router.replace("/ads?review=1");
          }}
          className={`px-4 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${
            tab === "review" ? "bg-gray-900 text-white font-medium" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          Review
          {pendingCount > 0 && (
            <span className="min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center px-1">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {defaults && !defaults.canPublish && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-[13px] text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            The Meta access token can read campaigns but can&apos;t create ads yet (missing{" "}
            <code className="font-mono">ads_management</code>). You can build and save drafts;
            generate a new system-user token with ads_management + Page access to publish.
          </span>
        </div>
      )}

      {tab === "review" ? (
        <ReviewQueue isAdmin={isAdmin} onQueueCount={setPendingCount} />
      ) : (
        <div className="flex gap-4 items-start">
          {/* Left pane — destination + batch */}
          <div className="w-60 flex-shrink-0 bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Campaign</label>
              <button
                onClick={fetchTargets}
                title="Refresh campaigns"
                className="text-gray-400 hover:text-gray-700"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingTargets ? "animate-spin" : ""}`} />
              </button>
            </div>
            <select
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setAdsetId("");
              }}
              className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] mb-3 bg-white"
            >
              <option value="">
                {loadingTargets ? "Loading…" : "Select campaign"}
              </option>
              {visibleCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.effective_status === "PAUSED" ? "(paused)" : ""}
                </option>
              ))}
            </select>
            <label className="text-xs text-gray-500 block mb-1">Ad set</label>
            <select
              value={adsetId}
              onChange={(e) => setAdsetId(e.target.value)}
              disabled={!campaign}
              className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] bg-white disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">Select ad set</option>
              {visibleAdsets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.effective_status === "PAUSED" ? "(paused)" : ""}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 mt-2 text-[11.5px] text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPaused}
                onChange={(e) => setShowPaused(e.target.checked)}
                className="h-3 w-3 rounded border-gray-300"
              />
              Show paused campaigns
            </label>
            {loadError && <p className="text-[11px] text-red-600 mt-2">{loadError}</p>}

            <div className="border-t border-gray-100 mt-4 pt-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                Ads in this batch
              </p>
              <ul className="space-y-1">
                {ads.map((ad) => (
                  <li key={ad.localId}>
                    <button
                      onClick={() => setSelectedId(ad.localId)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                        ad.localId === selectedId ? "bg-gray-100" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="w-7 h-9 rounded bg-gray-100 overflow-hidden flex-shrink-0">
                        {ad.feed &&
                          (ad.feed.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ad.feed.previewUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ad.feed.thumbUrl || ad.feed.previewUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium text-gray-900 truncate">
                          {ad.adName || "Untitled ad"}
                        </p>
                        <p
                          className={`text-[11px] truncate ${
                            ad.phase === "error"
                              ? "text-red-600"
                              : ad.phase === "done"
                                ? "text-emerald-600"
                                : "text-gray-500"
                          }`}
                        >
                          {ad.phase === "idle"
                            ? ad.feed
                              ? ad.vertical
                                ? "feed + 9:16"
                                : "feed only"
                              : "no creative"
                            : ad.phaseMsg}
                        </p>
                      </div>
                      {ads.length > 1 && ad.phase !== "done" && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAds((prev) => prev.filter((x) => x.localId !== ad.localId));
                            if (selectedId === ad.localId) setSelectedId(null);
                          }}
                          className="text-gray-300 hover:text-red-500 flex-shrink-0"
                          aria-label="Remove ad"
                        >
                          <X className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  const ad = newAd(defaults);
                  setAds((prev) => [...prev, ad]);
                  setSelectedId(ad.localId);
                }}
                className="w-full mt-2 border border-dashed border-gray-300 rounded-md py-1.5 text-[12.5px] text-gray-500 hover:text-gray-800 hover:border-gray-400 flex items-center justify-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add ad
              </button>
            </div>
          </div>

          {/* Center pane — editor */}
          <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg p-4">
            {!selected ? (
              <p className="text-sm text-gray-400 py-16 text-center">Add an ad to get started</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                  <input
                    value={selected.adName}
                    onChange={(e) => updateAd(selected.localId, { adName: e.target.value })}
                    placeholder="Ad name"
                    className="border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] font-medium w-60"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] text-gray-600">Partnership ad</span>
                    <button
                      onClick={() =>
                        updateAd(selected.localId, { partnership: !selected.partnership })
                      }
                      className={`w-9 h-5 rounded-full relative transition-colors ${
                        selected.partnership ? "bg-gray-900" : "bg-gray-300"
                      }`}
                      aria-label="Toggle partnership ad"
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                          selected.partnership ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                    {selected.partnership && (
                      <>
                        {defaults?.partners.length ? (
                          <select
                            value={selected.sponsorId}
                            onChange={(e) => {
                              const partner = defaults.partners.find(
                                (p) => p.sponsorId === e.target.value
                              );
                              updateAd(selected.localId, {
                                sponsorId: e.target.value,
                                sponsorLabel: partner?.label || "",
                              });
                            }}
                            className="border border-gray-300 rounded-md px-2 py-1.5 text-[12.5px] bg-white"
                          >
                            <option value="">Pick creator…</option>
                            {defaults.partners.map((p) => (
                              <option key={p.sponsorId} value={p.sponsorId}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <input
                          value={selected.sponsorId}
                          onChange={(e) =>
                            updateAd(selected.localId, { sponsorId: e.target.value })
                          }
                          placeholder="Creator IG user ID"
                          className="border border-gray-300 rounded-md px-2 py-1.5 text-[12.5px] w-40"
                        />
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 mb-4 flex-wrap">
                  <CreativeSlot
                    label="Feed · 1:1 or 4:5"
                    slot={selected.feed}
                    wide
                    onFile={(f) => handleFile(selected.localId, "feed", f)}
                    onClear={() => updateAd(selected.localId, { feed: null })}
                  />
                  <CreativeSlot
                    label="Stories & Reels · 9:16 (optional)"
                    slot={selected.vertical}
                    onFile={(f) => handleFile(selected.localId, "vertical", f)}
                    onClear={() => updateAd(selected.localId, { vertical: null })}
                  />
                  {selected.vertical && selected.feed && selected.vertical.kind !== selected.feed.kind && (
                    <p className="text-[11.5px] text-red-600 self-end">
                      Both slots must be the same media type (Meta limitation).
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <span className="text-[11px] text-gray-400">Presets</span>
                  {presets.map((p) => (
                    <span
                      key={p.name}
                      className="group inline-flex items-center gap-1 border border-gray-300 rounded-full pl-2.5 pr-1.5 py-0.5 text-[12px] text-gray-700 hover:border-gray-500 cursor-pointer"
                      onClick={() => updateCopy(selected.localId, p.copy)}
                    >
                      {p.name}
                      <X
                        className="h-3 w-3 text-gray-300 group-hover:text-gray-500 hover:!text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePreset(p.name);
                        }}
                      />
                    </span>
                  ))}
                  <button
                    onClick={savePreset}
                    className="text-[12px] text-gray-400 hover:text-gray-700 border border-dashed border-gray-300 rounded-full px-2.5 py-0.5"
                  >
                    + Save preset
                  </button>
                </div>

                <label className="text-xs text-gray-500 block mb-1">Primary text</label>
                <textarea
                  value={selected.copy.primaryText}
                  onChange={(e) => updateCopy(selected.localId, { primaryText: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] mb-3 resize-y"
                  placeholder="The main ad text…"
                />
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Headline</label>
                    <input
                      value={selected.copy.headline}
                      onChange={(e) => updateCopy(selected.localId, { headline: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Description (optional)</label>
                    <input
                      value={selected.copy.description}
                      onChange={(e) => updateCopy(selected.localId, { description: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Website URL</label>
                    <input
                      value={selected.copy.link}
                      onChange={(e) => updateCopy(selected.localId, { link: e.target.value })}
                      placeholder="https://…"
                      className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Call to action</label>
                    <select
                      value={selected.copy.cta}
                      onChange={(e) => updateCopy(selected.localId, { cta: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] bg-white"
                    >
                      {(defaults?.ctaOptions || [{ value: "SHOP_NOW", label: "Shop now" }]).map(
                        (c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
                <label className="text-xs text-gray-500 block mb-1">URL parameters</label>
                <input
                  value={selected.copy.urlTags}
                  onChange={(e) => updateCopy(selected.localId, { urlTags: e.target.value })}
                  placeholder="utm_source=facebook&utm_medium=paid"
                  className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] font-mono"
                />
                <p className="text-[11px] text-gray-400 mt-3">
                  Advantage+ creative enhancements are opted out automatically. Everything
                  autosaves locally — a refresh never loses work.
                </p>
              </>
            )}
          </div>

          {/* Right pane — previews + publish */}
          <div className="w-[280px] flex-shrink-0 space-y-4 sticky top-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex gap-3 justify-center flex-wrap">
                <IgFeedPreview
                  copy={selected?.copy || emptyCopy(defaults)}
                  ctaLabel={ctaLabel}
                  identityName={identityName}
                  identitySub={identitySub}
                  mediaUrl={feedMedia?.previewUrl || null}
                  mediaKind={feedMedia?.kind || null}
                  posterUrl={feedMedia?.thumbUrl}
                />
                <IgReelsPreview
                  copy={selected?.copy || emptyCopy(defaults)}
                  ctaLabel={ctaLabel}
                  identityName={identityName}
                  identitySub={identitySub}
                  mediaUrl={verticalMedia?.previewUrl || null}
                  mediaKind={verticalMedia?.kind || null}
                  posterUrl={verticalMedia?.thumbUrl}
                  isFallback={!selected?.vertical && !!selected?.feed}
                />
              </div>
              <p className="text-[11px] text-gray-400 text-center mt-3">
                Live preview · feed and stories/reels
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-[13px] font-semibold text-gray-900">
                {readyCount} ad{readyCount === 1 ? "" : "s"} ready
                {adset ? ` → ${adset.name}` : ""}
              </p>
              <p className="text-[11.5px] text-gray-500 mb-3">
                {campaign ? campaign.name : "Pick a campaign and ad set"}
              </p>
              {isAdmin ? (
                <div className="inline-flex border border-gray-300 rounded-full overflow-hidden text-[12px] mb-3">
                  <button
                    onClick={() => setPublishLive(true)}
                    className={`px-3.5 py-1 ${publishLive ? "bg-gray-900 text-white" : "text-gray-500"}`}
                  >
                    Live
                  </button>
                  <button
                    onClick={() => setPublishLive(false)}
                    className={`px-3.5 py-1 ${!publishLive ? "bg-gray-900 text-white" : "text-gray-500"}`}
                  >
                    Paused
                  </button>
                </div>
              ) : (
                <p className="text-[11.5px] text-gray-500 mb-3">
                  Your ads are saved for admin review — nothing goes to Meta until approved.
                </p>
              )}
              <button
                onClick={publishAll}
                disabled={publishing || !adset || readyCount === 0}
                className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-[13px] font-semibold disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors"
              >
                {publishing && <Loader2 className="h-4 w-4 animate-spin" />}
                {isAdmin
                  ? `Publish ${readyCount || ""} ad${readyCount === 1 ? "" : "s"}`
                  : "Submit for approval"}
              </button>
              {ads.some((a) => a.phase === "done" && a.metaAdId) && targets && (
                <a
                  href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${targets.accountId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center justify-center gap-1 text-[12px] text-gray-500 hover:text-gray-800"
                >
                  Open Ads Manager <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {ads.some((a) => a.phase === "done") && (
                <button
                  onClick={() => {
                    setAds([newAd(defaults)]);
                    setSelectedId(null);
                  }}
                  className="mt-2 w-full text-[12px] text-gray-500 hover:text-gray-800 flex items-center justify-center gap-1"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Start a new batch
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreativeSlot({
  label,
  slot,
  wide,
  onFile,
  onClear,
}: {
  label: string;
  slot: SlotState | null;
  wide?: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const width = wide ? "w-[150px]" : "w-[106px]";

  return (
    <div className="text-center">
      <div
        onClick={() => !slot && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={`${width} h-[188px] rounded-lg overflow-hidden relative ${
          slot
            ? "bg-gray-100"
            : `border-2 border-dashed cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                dragOver ? "border-gray-500 bg-gray-50" : "border-gray-300 bg-gray-50/50"
              }`
        }`}
      >
        {slot ? (
          <>
            {slot.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slot.previewUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <video
                src={slot.previewUrl}
                poster={slot.thumbUrl || undefined}
                className="w-full h-full object-cover"
                muted
                playsInline
                loop
                autoPlay
              />
            )}
            {slot.uploading && (
              <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] py-0.5">
                Uploading {slot.progress}%
              </div>
            )}
            {slot.error && (
              <div className="absolute inset-x-0 bottom-0 bg-red-600/90 text-white text-[10px] py-0.5 px-1">
                {slot.error}
              </div>
            )}
            <button
              onClick={onClear}
              className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
              aria-label="Remove creative"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            <UploadCloud className="h-5 w-5 text-gray-400" />
            <span className="text-[10.5px] text-gray-400 px-2">Drop file or click</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-[11px] text-gray-500 mt-1.5">{label}</p>
    </div>
  );
}
