"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AdDraft, AssetRole, CampaignSummary, DraftAsset } from "@/types/meta-ads";
import { IgFeedPreview } from "./ig-feed-preview";
import { IgReelsPreview } from "./ig-reels-preview";
import { IgCarouselPreview } from "./ig-carousel-preview";
import { SquareCropDialog } from "./square-crop-dialog";
import { fileAssetKind, isSquareImage, uploadAdAsset } from "@/lib/ad-media";
import { CheckCircle2, Clock, Loader2, MessageSquare, Pencil, Trash2, Upload, XCircle } from "lucide-react";

const CTA_LABELS: Record<string, string> = {
  SHOP_NOW: "Shop now",
  LEARN_MORE: "Learn more",
  ORDER_NOW: "Order now",
  GET_OFFER: "Get offer",
  SIGN_UP: "Sign up",
  SUBSCRIBE: "Subscribe",
  CONTACT_US: "Contact us",
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved · live", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  direct: { label: "Published", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  changes_requested: { label: "Changes requested", cls: "bg-red-50 text-red-700 border-red-200" },
  publishing: { label: "Publishing…", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  failed: { label: "Publish failed", cls: "bg-red-50 text-red-700 border-red-200" },
};

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ReviewQueue({
  isAdmin,
  onQueueCount,
  focusDraftId,
}: {
  isAdmin: boolean;
  onQueueCount?: (n: number) => void;
  /** Draft to scroll to and highlight (from a bell-notification deep link) */
  focusDraftId?: string | null;
}) {
  const [queue, setQueue] = useState<AdDraft[]>([]);
  const [reviewed, setReviewed] = useState<AdDraft[]>([]);
  const [mine, setMine] = useState<AdDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    adName: string;
    adsetId: string;
    primaryText: string;
    headline: string;
    description: string;
    link: string;
    urlTags: string;
    cta: string;
  } | null>(null);
  const [targets, setTargets] = useState<CampaignSummary[] | null>(null);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [editAssets, setEditAssets] = useState<{
    feed: DraftAsset | null;
    vertical: DraftAsset | null;
  } | null>(null);
  const [mediaProgress, setMediaProgress] = useState<Partial<Record<AssetRole, number>>>({});
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [cropRequest, setCropRequest] = useState<File | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const focusedRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ads/drafts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load drafts");
      setQueue(data.queue || []);
      setReviewed(data.reviewed || []);
      setMine(data.mine || []);
      onQueueCount?.(data.queue?.length || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drafts");
    } finally {
      setLoading(false);
    }
  }, [onQueueCount]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Publishing runs server-side after Approve returns — poll until every
  // in-flight draft resolves to approved/direct or failed.
  const anyPublishing = [...queue, ...mine, ...reviewed].some((d) => d.status === "publishing");
  useEffect(() => {
    if (!anyPublishing) return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [anyPublishing, refresh]);

  // Deep link from a bell notification: scroll to the draft and flash it.
  useEffect(() => {
    if (!focusDraftId || loading) return;
    if (focusedRef.current === focusDraftId) return;
    const el = cardRefs.current.get(focusDraftId);
    if (!el) return;
    focusedRef.current = focusDraftId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(focusDraftId);
    const t = setTimeout(() => setFlashId(null), 2500);
    return () => clearTimeout(t);
  }, [focusDraftId, loading, queue, mine, reviewed]);

  const approve = useCallback(
    async (draft: AdDraft) => {
      setBusyId(draft.id);
      setError(null);
      try {
        const res = await fetch("/api/ads/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId: draft.id, status: "ACTIVE" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Publish failed");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Publish failed");
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [refresh]
  );

  const sendFeedback = useCallback(
    async (draftId: string) => {
      if (!feedbackText.trim()) return;
      setBusyId(draftId);
      try {
        await fetch(`/api/ads/drafts/${draftId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: feedbackText }),
        });
        setFeedbackFor(null);
        setFeedbackText("");
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [feedbackText, refresh]
  );

  const uploadEditAsset = useCallback(async (role: "feed" | "vertical", file: File) => {
    const kind = fileAssetKind(file);
    if (!kind) return;
    setMediaError(null);
    setMediaProgress((p) => ({ ...p, [role]: 0 }));
    try {
      const asset = await uploadAdAsset(file, role, kind, (percent) =>
        setMediaProgress((p) => ({ ...p, [role]: percent }))
      );
      setEditAssets((prev) => (prev ? { ...prev, [role]: asset } : prev));
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setMediaProgress((p) => {
        const next = { ...p };
        delete next[role];
        return next;
      });
    }
  }, []);

  const handleEditFile = useCallback(
    async (role: "feed" | "vertical", file: File) => {
      const kind = fileAssetKind(file);
      if (!kind) return;
      // Non-square feed images go through the interactive 1:1 crop first.
      if (role === "feed" && kind === "image" && !(await isSquareImage(file))) {
        setCropRequest(file);
        return;
      }
      uploadEditAsset(role, file);
    },
    [uploadEditAsset]
  );

  const startEdit = useCallback(
    (draft: AdDraft) => {
      setEditingId(draft.id);
      // Carousel drafts keep their card set — the edit form covers copy and
      // targeting only, so leave assets untouched (null = don't send).
      const isCarousel = draft.assets.some((a) => a.role === "card");
      setEditAssets(
        isCarousel
          ? null
          : {
              feed: draft.assets.find((a) => a.role === "feed") || null,
              vertical: draft.assets.find((a) => a.role === "vertical") || null,
            }
      );
      setMediaProgress({});
      setMediaError(null);
      setEditForm({
        adName: draft.adName,
        adsetId: draft.adsetId,
        primaryText: draft.copy.primaryText || "",
        headline: draft.copy.headline || "",
        description: draft.copy.description || "",
        link: draft.copy.link || "",
        urlTags: draft.copy.urlTags || "",
        cta: draft.copy.cta || "SHOP_NOW",
      });
      if (!targets && !targetsLoading) {
        setTargetsLoading(true);
        fetch("/api/ads/targets")
          .then((res) => res.json())
          .then((data) => setTargets(data.campaigns || []))
          .catch(() => setTargets([]))
          .finally(() => setTargetsLoading(false));
      }
    },
    [targets, targetsLoading]
  );

  const saveEdit = useCallback(
    async (draft: AdDraft, resubmit: boolean) => {
      if (!editForm) return;
      if (Object.keys(mediaProgress).length > 0) {
        setError("Media is still uploading — wait for it to finish");
        return;
      }
      if (editAssets && !editAssets.feed) {
        setError("A feed creative is required");
        return;
      }
      setBusyId(draft.id);
      setError(null);
      try {
        // Resolve campaign/adset names from the live target list; if the
        // adset wasn't changed (or targets failed to load) leave targeting as is.
        const campaign = targets?.find((c) => c.adsets.some((a) => a.id === editForm.adsetId));
        const adset = campaign?.adsets.find((a) => a.id === editForm.adsetId);
        const res = await fetch(`/api/ads/drafts/${draft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adName: editForm.adName,
            ...(campaign && adset
              ? {
                  campaignId: campaign.id,
                  campaignName: campaign.name,
                  adsetId: adset.id,
                  adsetName: adset.name,
                }
              : {}),
            copy: {
              primaryText: editForm.primaryText,
              headline: editForm.headline,
              description: editForm.description,
              link: editForm.link,
              urlTags: editForm.urlTags,
              cta: editForm.cta,
            },
            ...(editAssets?.feed
              ? { assets: [editAssets.feed, editAssets.vertical].filter(Boolean) }
              : {}),
            ...(resubmit ? { resubmit: true } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not save changes");
        setEditingId(null);
        setEditForm(null);
        setEditAssets(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save changes");
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [editForm, editAssets, mediaProgress, targets, refresh]
  );

  const withdraw = useCallback(
    async (draftId: string) => {
      setBusyId(draftId);
      try {
        await fetch(`/api/ads/drafts/${draftId}`, { method: "DELETE" });
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [refresh]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-16 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading drafts…
      </div>
    );
  }

  const renderEditForm = (draft: AdDraft, mode: "queue" | "mine" | "reviewed") => {
    if (!editForm) return null;
    const inputCls =
      "w-full border border-gray-300 rounded-md px-2 py-1 text-[12.5px] text-gray-800";
    const set = (patch: Partial<NonNullable<typeof editForm>>) =>
      setEditForm((f) => (f ? { ...f, ...patch } : f));
    const canResubmit = mode === "mine" && draft.status === "changes_requested";
    const uploading = Object.keys(mediaProgress).length > 0;

    const mediaRow = (role: "feed" | "vertical", label: string, removable: boolean) => {
      const asset = editAssets?.[role] || null;
      const progress = mediaProgress[role];
      return {
        label,
        field: (
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-10 h-10 rounded bg-gray-100 overflow-hidden flex-shrink-0">
              {asset && (asset.kind === "image" || asset.thumbnailUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.kind === "image" ? asset.fileUrl : asset.thumbnailUrl || ""}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <span className="text-[12px] text-gray-500">
              {progress !== undefined
                ? `Uploading… ${progress}%`
                : asset
                  ? asset.kind === "video"
                    ? "Video"
                    : "Image"
                  : "None (falls back to feed)"}
            </span>
            <label className="border border-gray-300 rounded-md px-2.5 py-1 text-[12px] text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-1">
              <Upload className="h-3 w-3" /> Replace
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleEditFile(role, f);
                  e.target.value = "";
                }}
              />
            </label>
            {removable && asset && (
              <button
                onClick={() => setEditAssets((p) => (p ? { ...p, [role]: null } : p))}
                className="text-[12px] text-gray-400 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>
        ),
      };
    };

    const rows: { label: string; field: ReactNode }[] = [
      {
        label: "Ad name",
        field: (
          <input
            value={editForm.adName}
            onChange={(e) => set({ adName: e.target.value })}
            className={inputCls}
          />
        ),
      },
      {
        label: "Ad set",
        field: targetsLoading ? (
          <span className="text-gray-400 text-[12.5px]">Loading campaigns…</span>
        ) : targets && targets.length > 0 ? (
          <select
            value={editForm.adsetId}
            onChange={(e) => set({ adsetId: e.target.value })}
            className={inputCls}
          >
            {!targets.some((c) => c.adsets.some((a) => a.id === editForm.adsetId)) && (
              <option value={editForm.adsetId}>{draft.adsetName} (current)</option>
            )}
            {targets.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.adsets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <span className="text-gray-500 text-[12.5px]">
            {draft.adsetName} <span className="text-gray-400">(campaign list unavailable)</span>
          </span>
        ),
      },
      ...(editAssets
        ? [mediaRow("feed", "Feed media", false), mediaRow("vertical", "9:16 media", true)]
        : [
            {
              label: "Media",
              field: (
                <span className="text-[12.5px] text-gray-500">
                  Carousel · {draftCards(draft).length} cards — swap card media by
                  resubmitting; copy and targeting are editable here.
                </span>
              ),
            },
          ]),
      {
        label: "Primary text",
        field: (
          <textarea
            value={editForm.primaryText}
            onChange={(e) => set({ primaryText: e.target.value })}
            rows={3}
            className={inputCls}
          />
        ),
      },
      {
        label: "Landing page",
        field: (
          <input
            value={editForm.link}
            onChange={(e) => set({ link: e.target.value })}
            className={inputCls}
          />
        ),
      },
      {
        label: "URL params",
        field: (
          <input
            value={editForm.urlTags}
            onChange={(e) => set({ urlTags: e.target.value })}
            className={inputCls}
          />
        ),
      },
      {
        label: "Headline",
        field: (
          <input
            value={editForm.headline}
            onChange={(e) => set({ headline: e.target.value })}
            className={inputCls}
          />
        ),
      },
      {
        label: "Description",
        field: (
          <input
            value={editForm.description}
            onChange={(e) => set({ description: e.target.value })}
            className={inputCls}
          />
        ),
      },
      {
        label: "CTA button",
        field: (
          <select
            value={editForm.cta}
            onChange={(e) => set({ cta: e.target.value })}
            className={inputCls}
          >
            {Object.entries(CTA_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ),
      },
    ];

    return (
      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[12.5px] items-start">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <span className="text-gray-400 pt-1.5">{row.label}</span>
              <span className="min-w-0">{row.field}</span>
            </div>
          ))}
        </div>
        {mediaError && (
          <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5 mt-3">
            {mediaError}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={() => {
              setEditingId(null);
              setEditForm(null);
              setEditAssets(null);
              setMediaProgress({});
              setMediaError(null);
              setCropRequest(null);
            }}
            className="border border-gray-300 rounded-md px-4 py-1.5 text-[12.5px] text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => saveEdit(draft, canResubmit)}
            disabled={busyId === draft.id || uploading}
            className="bg-gray-900 text-white rounded-md px-4 py-1.5 text-[12.5px] font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5"
          >
            {busyId === draft.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {canResubmit ? "Save & resubmit" : "Save changes"}
          </button>
        </div>
      </div>
    );
  };

  const draftCards = (draft: AdDraft) =>
    draft.assets
      .filter((a) => a.role === "card")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const renderDetails = (draft: AdDraft) => {
    const cards = draftCards(draft);
    const rows: { label: string; value: ReactNode }[] = [
      { label: "Campaign", value: draft.campaignName },
      { label: "Ad set", value: draft.adsetName },
    ];
    if (cards.length > 0) {
      rows.push({
        label: "Format",
        value: `Carousel · ${cards.length} cards · ${
          draft.copy.multiShareOptimized ? "Meta may reorder cards" : "fixed card order"
        }`,
      });
    }
    if (draft.partnershipSponsorLabel || draft.partnershipSponsorId) {
      rows.push({
        label: "Partnership",
        value: draft.partnershipSponsorLabel || draft.partnershipSponsorId,
      });
    }
    rows.push({
      label: "Landing page",
      value: draft.copy.link ? (
        <a
          href={draft.copy.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-700 hover:underline break-all"
        >
          {draft.copy.link}
        </a>
      ) : (
        <span className="text-gray-400">—</span>
      ),
    });
    if (draft.copy.urlTags) rows.push({ label: "URL params", value: draft.copy.urlTags });
    rows.push({
      label: "Headline",
      value: draft.copy.headline || <span className="text-gray-400">—</span>,
    });
    rows.push({
      label: "Description",
      value: draft.copy.description || <span className="text-gray-400">—</span>,
    });
    rows.push({ label: "CTA button", value: CTA_LABELS[draft.copy.cta] || draft.copy.cta });

    return (
      <div className="mt-3 border-t border-gray-100 pt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <span className="text-gray-400">{row.label}</span>
            <span className="text-gray-800 min-w-0">{row.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderCard = (draft: AdDraft, mode: "queue" | "mine" | "reviewed") => {
    const status = STATUS_META[draft.status] || STATUS_META.pending;
    const cards = draftCards(draft);
    const feed = draft.assets.find((a) => a.role === "feed") || cards[0];
    const vertical = draft.assets.find((a) => a.role === "vertical") || feed;
    const expanded = expandedId === draft.id;
    const identityName = draft.partnershipSponsorLabel || "namaclo";
    const identitySub = draft.partnershipSponsorId ? "Paid partnership" : "Sponsored";

    return (
      <div
        key={draft.id}
        ref={(el) => {
          if (el) cardRefs.current.set(draft.id, el);
          else cardRefs.current.delete(draft.id);
        }}
        className={`bg-white border rounded-lg p-4 transition-shadow duration-500 ${
          flashId === draft.id
            ? "border-blue-400 ring-2 ring-blue-300 shadow-md"
            : "border-gray-200"
        }`}
      >
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-12 h-15 rounded bg-gray-100 overflow-hidden flex-shrink-0" style={{ height: 60 }}>
            {feed &&
              // eslint-disable-next-line @next/next/no-img-element
              (feed.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={feed.fileUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={feed.thumbnailUrl || ""} alt="" className="w-full h-full object-cover" />
              ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13.5px] font-semibold text-gray-900">{draft.adName}</p>
              <span className={`text-[10.5px] font-medium border rounded-full px-2 py-0.5 ${status.cls}`}>
                {status.label}
              </span>
            </div>
            <p className="text-[12px] text-gray-500 truncate">
              {mode === "queue" && `Submitted by ${draft.createdByName} · ${timeAgo(draft.createdAt)}`}
              {mode === "reviewed" &&
                `${draft.createdByName} · ${draft.campaignName} → ${draft.adsetName} · ${timeAgo(draft.createdAt)}`}
              {mode === "mine" &&
                `${draft.campaignName} → ${draft.adsetName} · ${timeAgo(draft.createdAt)}${
                  draft.partnershipSponsorLabel
                    ? ` · Partnership: ${draft.partnershipSponsorLabel}`
                    : ""
                }`}
            </p>
            <p className="text-[12px] text-gray-600 mt-1 line-clamp-2">
              &ldquo;{draft.copy.primaryText}&rdquo;
            </p>
            {draft.feedback && (
              <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5 mt-2">
                <MessageSquare className="h-3 w-3 inline mr-1" />
                {draft.feedback}
              </p>
            )}
            {draft.publishError && (draft.status === "failed" || draft.status === "pending") && (
              <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5 mt-2">
                <XCircle className="h-3 w-3 inline mr-1" />
                {draft.publishError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 flex-shrink-0 w-44">
            {mode === "queue" && (
              <>
                <button
                  onClick={() => approve(draft)}
                  disabled={busyId === draft.id}
                  className="bg-gray-900 text-white rounded-md py-1.5 text-[12.5px] font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {busyId === draft.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Approve · push live
                </button>
                <button
                  onClick={() => {
                    setFeedbackFor(feedbackFor === draft.id ? null : draft.id);
                    setFeedbackText("");
                  }}
                  className="border border-gray-300 rounded-md py-1.5 text-[12.5px] text-gray-700 hover:bg-gray-50"
                >
                  Request changes
                </button>
                <button
                  onClick={() => (editingId === draft.id ? setEditingId(null) : startEdit(draft))}
                  className="border border-gray-300 rounded-md py-1.5 text-[12.5px] text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5"
                >
                  <Pencil className="h-3 w-3" /> Edit details
                </button>
              </>
            )}
            {mode === "mine" && draft.status === "changes_requested" && (
              <button
                onClick={() => (editingId === draft.id ? setEditingId(null) : startEdit(draft))}
                className="bg-gray-900 text-white rounded-md py-1.5 text-[12.5px] font-semibold hover:bg-gray-800 flex items-center justify-center gap-1.5"
              >
                <Pencil className="h-3 w-3" /> Edit & resubmit
              </button>
            )}
            {mode === "mine" &&
              (draft.status === "pending" || draft.status === "changes_requested") && (
                <button
                  onClick={() => withdraw(draft.id)}
                  disabled={busyId === draft.id}
                  className="border border-gray-300 rounded-md py-1.5 text-[12.5px] text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Withdraw draft
                </button>
              )}
            <button
              onClick={() => setExpandedId(expanded ? null : draft.id)}
              className="text-[12px] text-gray-400 hover:text-gray-700"
            >
              {expanded ? "Hide preview" : "Open full preview"}
            </button>
          </div>
        </div>

        {editingId === draft.id
          ? renderEditForm(draft, mode)
          : (mode === "queue" || expanded) && renderDetails(draft)}

        {feedbackFor === draft.id && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={2}
              placeholder="Feedback for the submitter — what should change?"
              className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={() => sendFeedback(draft.id)}
                disabled={!feedbackText.trim() || busyId === draft.id}
                className="border border-gray-300 rounded-md px-4 py-1.5 text-[12.5px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Send feedback
              </button>
            </div>
          </div>
        )}

        {expanded && (
          <div className="mt-4 border-t border-gray-100 pt-4 flex gap-4 justify-center flex-wrap">
            {cards.length > 0 ? (
              <IgCarouselPreview
                copy={draft.copy}
                ctaLabel={CTA_LABELS[draft.copy.cta] || "Shop now"}
                identityName={identityName}
                identitySub={identitySub}
                cards={cards.map((c) => ({
                  mediaUrl: c.fileUrl,
                  mediaKind: c.kind,
                  posterUrl: c.thumbnailUrl,
                  headline: c.cardHeadline,
                }))}
              />
            ) : (
              <>
                <IgFeedPreview
                  copy={draft.copy}
                  ctaLabel={CTA_LABELS[draft.copy.cta] || "Shop now"}
                  identityName={identityName}
                  identitySub={identitySub}
                  mediaUrl={feed?.fileUrl || null}
                  mediaKind={feed?.kind || null}
                  posterUrl={feed?.thumbnailUrl}
                />
                <IgReelsPreview
                  copy={draft.copy}
                  ctaLabel={CTA_LABELS[draft.copy.cta] || "Shop now"}
                  identityName={identityName}
                  identitySub={identitySub}
                  mediaUrl={vertical?.fileUrl || null}
                  mediaKind={vertical?.kind || null}
                  posterUrl={vertical?.thumbnailUrl}
                  isFallback={!draft.assets.some((a) => a.role === "vertical")}
                />
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl">
      {cropRequest && (
        <SquareCropDialog
          file={cropRequest}
          onCancel={() => setCropRequest(null)}
          onCropped={(cropped) => {
            setCropRequest(null);
            uploadEditAsset("feed", cropped);
          }}
        />
      )}
      {error && (
        <p className="text-[12.5px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {isAdmin && (
        <>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Awaiting your review {queue.length > 0 && `(${queue.length})`}
          </h2>
          {queue.length === 0 ? (
            <p className="text-[13px] text-gray-400 bg-white border border-gray-200 rounded-lg px-4 py-6 text-center mb-6">
              <Clock className="h-4 w-4 inline mr-1.5 -mt-0.5" />
              No ads waiting for approval
            </p>
          ) : (
            <div className="space-y-3 mb-6">{queue.map((d) => renderCard(d, "queue"))}</div>
          )}

          {reviewed.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Recently reviewed</h2>
              <div className="space-y-3 mb-6">{reviewed.map((d) => renderCard(d, "reviewed"))}</div>
            </>
          )}
        </>
      )}

      <h2 className="text-sm font-semibold text-gray-900 mb-3">My submitted ads</h2>
      {mine.length === 0 ? (
        <p className="text-[13px] text-gray-400 bg-white border border-gray-200 rounded-lg px-4 py-6 text-center">
          Nothing submitted yet
        </p>
      ) : (
        <div className="space-y-3">{mine.map((d) => renderCard(d, "mine"))}</div>
      )}
    </div>
  );
}
