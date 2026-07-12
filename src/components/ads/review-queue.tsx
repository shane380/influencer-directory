"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdDraft } from "@/types/meta-ads";
import { IgFeedPreview } from "./ig-feed-preview";
import { IgReelsPreview } from "./ig-reels-preview";
import { CheckCircle2, Clock, Loader2, MessageSquare, Trash2, XCircle } from "lucide-react";

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
}: {
  isAdmin: boolean;
  onQueueCount?: (n: number) => void;
}) {
  const [queue, setQueue] = useState<AdDraft[]>([]);
  const [mine, setMine] = useState<AdDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ads/drafts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load drafts");
      setQueue(data.queue || []);
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

  const renderCard = (draft: AdDraft, mode: "queue" | "mine") => {
    const status = STATUS_META[draft.status] || STATUS_META.pending;
    const feed = draft.assets.find((a) => a.role === "feed");
    const vertical = draft.assets.find((a) => a.role === "vertical") || feed;
    const expanded = expandedId === draft.id;
    const identityName = draft.partnershipSponsorLabel || "namaclo";
    const identitySub = draft.partnershipSponsorId ? "Paid partnership" : "Sponsored";

    return (
      <div key={draft.id} className="bg-white border border-gray-200 rounded-lg p-4">
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
              {mode === "queue" ? `${draft.createdByName} · ` : ""}
              {draft.campaignName} → {draft.adsetName} · {timeAgo(draft.createdAt)}
              {draft.partnershipSponsorLabel ? ` · Partnership: ${draft.partnershipSponsorLabel}` : ""}
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
            {draft.publishError && draft.status === "failed" && (
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
              </>
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
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl">
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
