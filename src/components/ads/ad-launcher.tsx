"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { uploadToR2 } from "@/lib/r2-upload";
import { isSquareImage, makeVideoThumb, sanitizeFileName, uploadAdAsset } from "@/lib/ad-media";
import { IgCarouselPreview } from "./ig-carousel-preview";
import type {
  AdCopy,
  AdDraft,
  AssetKind,
  AssetRole,
  DraftAsset,
  LauncherDefaults,
  TargetsResponse,
} from "@/types/meta-ads";
import { IgFeedPreview } from "./ig-feed-preview";
import { IgReelsPreview } from "./ig-reels-preview";
import { ReviewQueue } from "./review-queue";
import { SquareCropDialog } from "./square-crop-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
type AdFormat = "single" | "carousel";

interface CardState {
  cardId: string;
  slot: SlotState;
  /** Optional 9:16 variant for stories/reels (all cards or none) */
  vertical: SlotState | null;
  headline: string;
  link: string;
}

interface AdState {
  localId: string;
  adName: string;
  partnership: boolean;
  sponsorId: string;
  sponsorLabel: string;
  format: AdFormat;
  feed: SlotState | null;
  vertical: SlotState | null;
  cards: CardState[];
  /** Carousel: let Meta reorder cards (multi_share_optimized) */
  letMetaOrder: boolean;
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
// v2: v1 drafts could contain already-published ads (saved before the
// done-ads exclusion existed), so they're deliberately abandoned.
const DRAFT_KEY = "adsLauncher.draft.v2";

const emptyCopy = (defaults?: LauncherDefaults | null): AdCopy => ({
  primaryText: "",
  headline: "",
  // Default per Daisy: "nama" for brand visibility; tailor per ad as needed.
  description: "nama",
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
    format: "single",
    feed: null,
    vertical: null,
    cards: [],
    letMetaOrder: false,
    copy: emptyCopy(defaults),
    phase: "idle",
    phaseMsg: "",
    metaAdId: null,
  };
}

export function AdLauncher({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"create" | "review">(
    searchParams?.get("review") ? "review" : "create"
  );

  // Bell notifications navigate to /ads?review=1&draft=<id>; when already on
  // /ads only the query changes, so sync the tab to it after mount too.
  const reviewParam = searchParams?.get("review");
  const focusDraftId = searchParams?.get("draft") || null;
  useEffect(() => {
    if (reviewParam) setTab("review");
  }, [reviewParam, focusDraftId]);
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
  const [cropRequest, setCropRequest] = useState<{
    localId: string;
    file: File;
    /** true when the crop target is a new carousel card, not the feed slot */
    card?: boolean;
  } | null>(null);
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
        format: a.format === "carousel" ? ("carousel" as const) : ("single" as const),
        letMetaOrder: !!a.letMetaOrder,
        cards: (a.cards || [])
          .filter((c: any) => c?.r2Url)
          .map((c: any) => ({
            cardId: nextId(),
            headline: c.headline || "",
            link: c.link || "",
            slot: {
              kind: c.kind,
              fileName: c.fileName || "card",
              previewUrl: c.r2Url,
              uploading: false,
              progress: 100,
              r2Url: c.r2Url,
              thumbUrl: c.thumbUrl || null,
              error: null,
            },
            vertical: c.vertical?.r2Url
              ? {
                  kind: c.vertical.kind,
                  fileName: c.vertical.fileName || "card-9x16",
                  previewUrl: c.vertical.r2Url,
                  uploading: false,
                  progress: 100,
                  r2Url: c.vertical.r2Url,
                  thumbUrl: c.vertical.thumbUrl || null,
                  error: null,
                }
              : null,
          })),
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
          // Published/submitted ads must not be restored on refresh — a
          // resurrected "done" ad would arrive as a re-publishable draft.
          ads: ads.filter((a) => a.phase !== "done").map((a) => ({
            adName: a.adName,
            partnership: a.partnership,
            sponsorId: a.sponsorId,
            sponsorLabel: a.sponsorLabel,
            format: a.format,
            letMetaOrder: a.letMetaOrder,
            cards: a.cards
              .filter((c) => c.slot.r2Url)
              .map((c) => ({
                kind: c.slot.kind,
                fileName: c.slot.fileName,
                r2Url: c.slot.r2Url,
                thumbUrl: c.slot.thumbUrl,
                headline: c.headline,
                link: c.link,
                vertical: c.vertical?.r2Url
                  ? {
                      kind: c.vertical.kind,
                      fileName: c.vertical.fileName,
                      r2Url: c.vertical.r2Url,
                      thumbUrl: c.vertical.thumbUrl,
                    }
                  : null,
              })),
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

  const beginUpload = useCallback(
    async (localId: string, role: AssetRole, kind: AssetKind, file: File) => {
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

  const handleFile = useCallback(
    async (localId: string, role: AssetRole, file: File) => {
      const kind: AssetKind | null = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : null;
      if (!kind) return;

      // Non-square feed images go through the interactive 1:1 crop first.
      if (role === "feed" && kind === "image" && !(await isSquareImage(file))) {
        setCropRequest({ localId, file });
        return;
      }

      beginUpload(localId, role, kind, file);
    },
    [beginUpload]
  );

  const addCardUpload = useCallback(async (localId: string, kind: AssetKind, file: File) => {
    const cardId = nextId();
    const previewUrl = URL.createObjectURL(file);
    setAds((prev) =>
      prev.map((a) =>
        a.localId === localId && a.cards.length < 10
          ? {
              ...a,
              cards: [
                ...a.cards,
                {
                  cardId,
                  headline: "",
                  link: "",
                  vertical: null,
                  slot: {
                    kind,
                    fileName: file.name,
                    previewUrl,
                    uploading: true,
                    progress: 0,
                    r2Url: null,
                    thumbUrl: null,
                    error: null,
                  },
                },
              ],
            }
          : a
      )
    );

    const setCardSlot = (patch: Partial<SlotState>) =>
      setAds((prev) =>
        prev.map((a) =>
          a.localId === localId
            ? {
                ...a,
                cards: a.cards.map((c) =>
                  c.cardId === cardId ? { ...c, slot: { ...c.slot, ...patch } } : c
                ),
              }
            : a
        )
      );

    try {
      const asset = await uploadAdAsset(file, "card", kind, (p) => setCardSlot({ progress: p }));
      setCardSlot({
        uploading: false,
        progress: 100,
        r2Url: asset.fileUrl,
        thumbUrl: asset.thumbnailUrl || null,
      });
    } catch (err) {
      setCardSlot({
        uploading: false,
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, []);

  const handleCardFile = useCallback(
    async (localId: string, file: File) => {
      const kind: AssetKind | null = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : null;
      if (!kind) return;
      // Carousel cards must be square on Instagram — crop non-square images.
      if (kind === "image" && !(await isSquareImage(file))) {
        setCropRequest({ localId, file, card: true });
        return;
      }
      addCardUpload(localId, kind, file);
    },
    [addCardUpload]
  );

  const handleCardVerticalFile = useCallback(async (localId: string, cardId: string, file: File) => {
    const kind: AssetKind | null = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : null;
    if (!kind) return;
    const previewUrl = URL.createObjectURL(file);
    const setVertical = (vertical: SlotState | null | ((v: SlotState) => SlotState)) =>
      setAds((prev) =>
        prev.map((a) =>
          a.localId === localId
            ? {
                ...a,
                cards: a.cards.map((c) =>
                  c.cardId === cardId
                    ? {
                        ...c,
                        vertical:
                          typeof vertical === "function"
                            ? c.vertical
                              ? vertical(c.vertical)
                              : c.vertical
                            : vertical,
                      }
                    : c
                ),
              }
            : a
        )
      );

    setVertical({
      kind,
      fileName: file.name,
      previewUrl,
      uploading: true,
      progress: 0,
      r2Url: null,
      thumbUrl: null,
      error: null,
    });
    try {
      const asset = await uploadAdAsset(file, "card", kind, (p) =>
        setVertical((v) => ({ ...v, progress: p }))
      );
      setVertical((v) => ({
        ...v,
        uploading: false,
        progress: 100,
        r2Url: asset.fileUrl,
        thumbUrl: asset.thumbnailUrl || null,
      }));
    } catch (err) {
      setVertical((v) => ({
        ...v,
        uploading: false,
        error: err instanceof Error ? err.message : "Upload failed",
      }));
    }
  }, []);

  const clearCardVertical = useCallback((localId: string, cardId: string) => {
    setAds((prev) =>
      prev.map((a) =>
        a.localId === localId
          ? {
              ...a,
              cards: a.cards.map((c) => (c.cardId === cardId ? { ...c, vertical: null } : c)),
            }
          : a
      )
    );
  }, []);

  const moveCard = useCallback((localId: string, cardId: string, dir: -1 | 1) => {
    setAds((prev) =>
      prev.map((a) => {
        if (a.localId !== localId) return a;
        const idx = a.cards.findIndex((c) => c.cardId === cardId);
        const to = idx + dir;
        if (idx < 0 || to < 0 || to >= a.cards.length) return a;
        const cards = [...a.cards];
        [cards[idx], cards[to]] = [cards[to], cards[idx]];
        return { ...a, cards };
      })
    );
  }, []);

  const removeCard = useCallback((localId: string, cardId: string) => {
    setAds((prev) =>
      prev.map((a) =>
        a.localId === localId ? { ...a, cards: a.cards.filter((c) => c.cardId !== cardId) } : a
      )
    );
  }, []);

  const updateCard = useCallback(
    (localId: string, cardId: string, patch: Partial<Pick<CardState, "headline" | "link">>) => {
      setAds((prev) =>
        prev.map((a) =>
          a.localId === localId
            ? {
                ...a,
                cards: a.cards.map((c) => (c.cardId === cardId ? { ...c, ...patch } : c)),
              }
            : a
        )
      );
    },
    []
  );

  const validateAd = useCallback(
    (ad: AdState): string | null => {
      if (!ad.adName.trim()) return "Name the ad";
      if (ad.format === "carousel") {
        if (ad.cards.length < 2) return "Add at least 2 carousel cards";
        if (ad.cards.length > 10) return "A carousel can have at most 10 cards";
        if (ad.cards.some((c) => c.slot.uploading || c.vertical?.uploading)) return "Still uploading";
        if (ad.cards.some((c) => !c.slot.r2Url)) return "A card failed to upload — remove it and retry";
        if (ad.cards.some((c) => c.vertical && !c.vertical.r2Url))
          return "A 9:16 upload failed — remove it and retry";
        const withVertical = ad.cards.filter((c) => c.vertical?.r2Url).length;
        if (withVertical > 0 && withVertical < ad.cards.length) {
          return "Every card needs a 9:16 version (or remove them all)";
        }
        if (withVertical > 0) {
          if (new Set(ad.cards.map((c) => c.slot.kind)).size > 1) {
            return "Per-placement carousels need every card to be the same media type";
          }
          if (ad.cards.some((c) => c.vertical && c.vertical.kind !== c.slot.kind)) {
            return "Each 9:16 must be the same media type as its card";
          }
        }
      } else {
        if (!ad.feed?.r2Url) return "Upload a feed creative";
        if (ad.feed.uploading || ad.vertical?.uploading) return "Still uploading";
        if (ad.vertical && ad.vertical.kind !== ad.feed.kind) {
          return "Feed and 9:16 must both be images or both videos";
        }
      }
      if (ad.partnership && !ad.sponsorId.trim()) return "Pick or enter the partner's IG ID";
      if (!ad.copy.primaryText.trim()) return "Write the primary text";
      if (!ad.copy.headline.trim()) return "Add a headline";
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
      let assets: DraftAsset[];
      if (ad.format === "carousel") {
        assets = ad.cards.map((c, i) => ({
          role: "card" as const,
          kind: c.slot.kind,
          fileUrl: c.slot.r2Url!,
          thumbnailUrl: c.slot.thumbUrl,
          order: i,
          cardHeadline: c.headline.trim() || null,
          cardLink: c.link.trim() || null,
          verticalFileUrl: c.vertical?.r2Url || null,
          verticalThumbnailUrl: c.vertical?.thumbUrl || null,
        }));
      } else {
        assets = [
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
            copy:
              ad.format === "carousel"
                ? { ...ad.copy, multiShareOptimized: ad.letMetaOrder }
                : ad.copy,
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

        // The Meta push continues server-side; poll until the draft resolves.
        let resolved: AdDraft | null = null;
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2500));
          const pollRes = await fetch("/api/ads/drafts");
          const pollData = await pollRes.json();
          const d = (pollData.mine || []).find((x: AdDraft) => x.id === pubData.draftId);
          if (d && d.status !== "publishing") {
            resolved = d;
            break;
          }
        }
        if (!resolved) {
          throw new Error("Still publishing — check the Review tab in a minute");
        }
        if (resolved.status === "failed" || resolved.publishError) {
          throw new Error(resolved.publishError || "Publishing failed");
        }
        updateAd(ad.localId, {
          phase: "done",
          phaseMsg: publishLive ? "Live on Meta" : "Created (paused)",
          metaAdId: resolved.metaAdId,
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
          onClick={() => {
            setTab("create");
            router.replace("/ads");
          }}
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

      {cropRequest && (
        <SquareCropDialog
          file={cropRequest.file}
          onCancel={() => setCropRequest(null)}
          onCropped={(cropped) => {
            const { localId: id, card } = cropRequest;
            setCropRequest(null);
            if (card) addCardUpload(id, "image", cropped);
            else beginUpload(id, "feed", "image", cropped);
          }}
        />
      )}

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
        <ReviewQueue isAdmin={isAdmin} onQueueCount={setPendingCount} focusDraftId={focusDraftId} />
      ) : (
        <div className="space-y-4">
          {/* Top bar — destination + batch */}
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Campaign
              </label>
              <select
                value={campaignId}
                onChange={(e) => {
                  setCampaignId(e.target.value);
                  setAdsetId("");
                }}
                className="w-64 border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] bg-white"
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
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Ad set
              </label>
              <select
                value={adsetId}
                onChange={(e) => setAdsetId(e.target.value)}
                disabled={!campaign}
                className="w-56 border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">Select ad set</option>
                {visibleAdsets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.effective_status === "PAUSED" ? "(paused)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 pb-2">
              <button
                onClick={fetchTargets}
                title="Refresh campaigns"
                className="text-gray-400 hover:text-gray-700"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingTargets ? "animate-spin" : ""}`} />
              </button>
              <label className="flex items-center gap-1.5 text-[11.5px] text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPaused}
                  onChange={(e) => setShowPaused(e.target.checked)}
                  className="h-3 w-3 rounded border-gray-300"
                />
                Show paused
              </label>
              {loadError && <span className="text-[11px] text-red-600">{loadError}</span>}
            </div>

            <div className="self-stretch w-px bg-gray-200 mx-1 hidden sm:block" />
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Ads in this batch
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
              {ads.map((ad) => (
                <button
                  key={ad.localId}
                  onClick={() => setSelectedId(ad.localId)}
                  className={`flex items-center gap-1.5 border rounded-md pl-1.5 pr-2 py-1 transition-colors ${
                    ad.localId === selectedId
                      ? "bg-gray-100 border-gray-400"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="w-5 h-5 rounded bg-gray-100 overflow-hidden flex-shrink-0">
                    {ad.feed && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ad.feed.kind === "image" ? ad.feed.previewUrl : ad.feed.thumbUrl || ad.feed.previewUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      ad.phase === "error"
                        ? "bg-red-500"
                        : ad.phase === "done"
                          ? "bg-emerald-500"
                          : ad.phase === "working"
                            ? "bg-blue-500 animate-pulse"
                            : "bg-gray-300"
                    }`}
                    title={ad.phase === "idle" ? undefined : ad.phaseMsg}
                  />
                  <span className="text-[12px] font-medium text-gray-800 truncate max-w-[130px]">
                    {ad.adName || "Untitled ad"}
                  </span>
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
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  const ad = newAd(defaults);
                  setAds((prev) => [...prev, ad]);
                  setSelectedId(ad.localId);
                }}
                className="border border-dashed border-gray-300 rounded-md px-2.5 py-1 text-[12px] text-gray-500 hover:text-gray-800 hover:border-gray-400 flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add ad
              </button>
              </div>
            </div>
          </div>

          {/* Editor */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            {!selected ? (
              <p className="text-sm text-gray-400 py-16 text-center">Add an ad to get started</p>
            ) : (
              <>
                <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                      Ad name
                    </label>
                    <input
                      value={selected.adName}
                      onChange={(e) => updateAd(selected.localId, { adName: e.target.value })}
                      placeholder="e.g. linen-drop-hook-v1"
                      className="border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] font-medium w-60"
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-1">
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
                            <option value="">Pick partner…</option>
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
                          placeholder="Partner IG user ID"
                          className="border border-gray-300 rounded-md px-2 py-1.5 text-[12.5px] w-40"
                        />
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 mb-3">
                  {(["single", "carousel"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => updateAd(selected.localId, { format: f })}
                      className={`px-3 py-1 rounded-md text-[12px] transition-colors ${
                        selected.format === f
                          ? "bg-gray-900 text-white font-medium"
                          : "text-gray-600 hover:bg-gray-100 border border-gray-200"
                      }`}
                    >
                      {f === "single" ? "Single image/video" : "Carousel"}
                    </button>
                  ))}
                </div>

                {selected.format === "single" ? (
                  <div className="flex gap-4 mb-4 flex-wrap">
                    <CreativeSlot
                      label="Feed · 1:1 (square)"
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
                ) : (
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 block mb-1.5">
                      Cards ({selected.cards.length}/10) · square 1:1, min 600×600, videos ≤60s ·
                      optional 9:16 per card for stories/reels (all cards or none)
                    </label>
                    <div className="space-y-2">
                      {selected.cards.map((c, i) => (
                        <div
                          key={c.cardId}
                          className="flex items-center gap-2.5 border border-gray-200 rounded-md p-2"
                        >
                          <span className="text-[11px] text-gray-400 w-4 text-center flex-shrink-0">
                            {i + 1}
                          </span>
                          <div className="w-12 h-12 rounded bg-gray-100 overflow-hidden flex-shrink-0 relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={
                                c.slot.kind === "image"
                                  ? c.slot.previewUrl
                                  : c.slot.thumbUrl || c.slot.previewUrl
                              }
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            {c.slot.uploading && (
                              <span className="absolute inset-0 bg-black/50 text-white text-[10px] flex items-center justify-center">
                                {c.slot.progress}%
                              </span>
                            )}
                            {c.slot.error && (
                              <span
                                className="absolute inset-0 bg-red-600/70 text-white flex items-center justify-center"
                                title={c.slot.error}
                              >
                                <AlertTriangle className="h-4 w-4" />
                              </span>
                            )}
                          </div>
                          <input
                            value={c.headline}
                            onChange={(e) =>
                              updateCard(selected.localId, c.cardId, { headline: e.target.value })
                            }
                            placeholder="Card headline (optional)"
                            className="border border-gray-300 rounded-md px-2 py-1 text-[12px] flex-1 min-w-0"
                          />
                          <input
                            value={c.link}
                            onChange={(e) =>
                              updateCard(selected.localId, c.cardId, { link: e.target.value })
                            }
                            placeholder="Card link (defaults to ad URL)"
                            className="border border-gray-300 rounded-md px-2 py-1 text-[12px] flex-1 min-w-0"
                          />
                          {c.vertical ? (
                            <div
                              className="relative w-8 h-12 rounded overflow-hidden bg-gray-900 flex-shrink-0"
                              title="9:16 for stories/reels"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={
                                  c.vertical.kind === "image"
                                    ? c.vertical.previewUrl
                                    : c.vertical.thumbUrl || c.vertical.previewUrl
                                }
                                alt=""
                                className="w-full h-full object-cover"
                              />
                              {c.vertical.uploading && (
                                <span className="absolute inset-0 bg-black/50 text-white text-[9px] flex items-center justify-center">
                                  {c.vertical.progress}%
                                </span>
                              )}
                              {c.vertical.error && (
                                <span
                                  className="absolute inset-0 bg-red-600/70 text-white flex items-center justify-center"
                                  title={c.vertical.error}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                </span>
                              )}
                              <button
                                onClick={() => clearCardVertical(selected.localId, c.cardId)}
                                className="absolute top-0 right-0 bg-black/60 text-white rounded-bl px-1 text-[9px] leading-3"
                                aria-label="Remove 9:16"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <label
                              className="w-8 h-12 border border-dashed border-gray-300 rounded text-[9px] text-gray-400 hover:text-gray-700 hover:border-gray-400 flex items-center justify-center cursor-pointer flex-shrink-0"
                              title="Add a 9:16 version for stories/reels (all cards or none)"
                            >
                              9:16
                              <input
                                type="file"
                                accept="image/*,video/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleCardVerticalFile(selected.localId, c.cardId, f);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                          <span className="flex flex-col flex-shrink-0">
                            <button
                              onClick={() => moveCard(selected.localId, c.cardId, -1)}
                              disabled={i === 0}
                              className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
                              aria-label="Move card up"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => moveCard(selected.localId, c.cardId, 1)}
                              disabled={i === selected.cards.length - 1}
                              className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
                              aria-label="Move card down"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </span>
                          <button
                            onClick={() => removeCard(selected.localId, c.cardId)}
                            className="text-gray-300 hover:text-red-500 flex-shrink-0"
                            aria-label="Remove card"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {selected.cards.length < 10 && (
                        <label className="border border-dashed border-gray-300 rounded-md px-3 py-2.5 text-[12.5px] text-gray-500 hover:text-gray-800 hover:border-gray-400 flex items-center gap-1.5 cursor-pointer w-fit">
                          <UploadCloud className="h-3.5 w-3.5" /> Add card
                          <input
                            type="file"
                            accept="image/*,video/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              for (const f of Array.from(e.target.files || [])) {
                                handleCardFile(selected.localId, f);
                              }
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2.5">
                      <span className="text-[12px] text-gray-500">Card order</span>
                      {([false, true] as const).map((v) => (
                        <button
                          key={String(v)}
                          onClick={() => updateAd(selected.localId, { letMetaOrder: v })}
                          className={`px-2.5 py-1 rounded-md text-[11.5px] transition-colors ${
                            selected.letMetaOrder === v
                              ? "bg-gray-900 text-white font-medium"
                              : "text-gray-600 hover:bg-gray-100 border border-gray-200"
                          }`}
                        >
                          {v ? "Let Meta optimize" : "Keep my order"}
                        </button>
                      ))}
                      <span className="text-[11px] text-gray-400">No end card either way.</span>
                    </div>
                  </div>
                )}

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
                    <label className="text-xs text-gray-500 block mb-1">Headline (required)</label>
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

          {/* Preview — under the editor */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex gap-8 justify-center flex-wrap">
                {selected?.format === "carousel" ? (
                  <>
                    <IgCarouselPreview
                      copy={selected.copy}
                      ctaLabel={ctaLabel}
                      identityName={identityName}
                      identitySub={identitySub}
                      cards={
                        selected.cards.length
                          ? selected.cards.map((c) => ({
                              mediaUrl: c.slot.previewUrl,
                              mediaKind: c.slot.kind,
                              posterUrl: c.slot.thumbUrl,
                              headline: c.headline,
                            }))
                          : [{ mediaUrl: null, mediaKind: null }]
                      }
                    />
                    {selected.cards.some((c) => c.vertical?.r2Url) && (
                      <IgReelsPreview
                        copy={selected.copy}
                        ctaLabel={ctaLabel}
                        identityName={identityName}
                        identitySub={identitySub}
                        mediaUrl={selected.cards[0]?.vertical?.previewUrl || null}
                        mediaKind={selected.cards[0]?.vertical?.kind || null}
                        posterUrl={selected.cards[0]?.vertical?.thumbUrl}
                      />
                    )}
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
              <p className="text-[11px] text-gray-400 text-center mt-3">
                {selected?.format === "carousel"
                  ? "Live preview · feed carousel (scroll the cards)"
                  : "Live preview · feed and stories/reels"}
              </p>
            </div>

            {/* Publish — under the preview */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[13px] font-semibold text-gray-900">
                  {readyCount} ad{readyCount === 1 ? "" : "s"} ready
                  {adset ? ` → ${adset.name}` : ""}
                </p>
                <p className="text-[11.5px] text-gray-500">
                  {campaign ? campaign.name : "Pick a campaign and ad set"}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {ads.some((a) => a.phase === "done" && a.metaAdId) && targets && (
                  <a
                    href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${targets.accountId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800"
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
                    className="text-[12px] text-gray-500 hover:text-gray-800 flex items-center gap-1"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Start a new batch
                  </button>
                )}
                {isAdmin ? (
                  <div className="inline-flex border border-gray-300 rounded-full overflow-hidden text-[12px]">
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
                  <p className="text-[11.5px] text-gray-500 max-w-[260px]">
                    Your ads are saved for admin review — nothing goes to Meta until approved.
                  </p>
                )}
                <button
                  onClick={publishAll}
                  disabled={publishing || !adset || readyCount === 0}
                  className="bg-gray-900 text-white rounded-lg px-6 py-2.5 text-[13px] font-semibold disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors"
                >
                  {publishing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isAdmin
                    ? `Publish ${readyCount || ""} ad${readyCount === 1 ? "" : "s"}`
                    : "Submit for approval"}
                </button>
              </div>
            </div>
            {ads.some((a) => a.phase !== "idle") && (
              <ul className="border-t border-gray-100 mt-3 pt-3 space-y-1.5">
                {ads
                  .filter((a) => a.phase !== "idle")
                  .map((a) => (
                    <li key={a.localId} className="flex items-center gap-2 text-[12.5px]">
                      {a.phase === "working" && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 flex-shrink-0" />
                      )}
                      {a.phase === "done" && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      )}
                      {a.phase === "error" && (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                      )}
                      <span className="font-medium text-gray-800 truncate max-w-[240px]">
                        {a.adName || "Untitled ad"}
                      </span>
                      <span className={a.phase === "error" ? "text-red-600" : "text-gray-500"}>
                        {a.phaseMsg}
                      </span>
                      {a.phase === "done" && a.metaAdId && targets && (
                        <a
                          href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${targets.accountId}&selected_ad_ids=${a.metaAdId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-400 hover:text-gray-700 flex items-center gap-0.5"
                        >
                          view <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </li>
                  ))}
              </ul>
            )}
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
  const box = wide ? "w-[160px] h-[160px]" : "w-[106px] h-[188px]";

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
        className={`${box} rounded-lg overflow-hidden relative ${
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
