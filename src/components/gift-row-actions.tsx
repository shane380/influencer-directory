"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Gift } from "lucide-react";
import { generateGiftToken, giftUrl, giftDmSnippet, giftStage, type GiftStage } from "@/lib/gift";
import type { Campaign, CampaignInfluencer } from "@/types/database";

// Per-row gift actions on the campaign roster: stage chip + dropdown with
// copy link / copy DM / send email / customize / regenerate.

const stageStyles: Record<GiftStage, string> = {
  not_invited: "text-gray-400 border border-dashed border-gray-300",
  invited: "bg-gray-100 text-gray-600",
  opened: "bg-blue-50 text-blue-700",
  submitted: "bg-purple-100 text-purple-700 font-medium",
  ordered: "bg-gray-100 text-gray-500",
};

const stageLabels: Record<GiftStage, string> = {
  not_invited: "Not invited",
  invited: "Invited",
  opened: "Opened",
  submitted: "Selected",
  ordered: "Ordered ✓",
};

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function GiftRowActions({
  campaign,
  ci,
  influencerName,
  influencerEmail,
  onReview,
  onCustomize,
  onChanged,
}: {
  campaign: Campaign;
  ci: CampaignInfluencer;
  influencerName: string;
  influencerEmail: string | null;
  onReview: () => void;
  onCustomize: () => void;
  onChanged: (patch: Partial<CampaignInfluencer>) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const stage = giftStage(ci);
  const firstName = (influencerName || "").trim().split(/\s+/)[0] || "";

  function flashMsg(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2000);
  }

  async function ensureToken(regenerate = false): Promise<string | null> {
    let token = ci.gift_token || null;
    if (token && !regenerate) return token;
    token = generateGiftToken();
    const patch: Record<string, unknown> = {
      gift_token: token,
      gift_invited_at: ci.gift_invited_at || new Date().toISOString(),
    };
    if (ci.status === "prospect") patch.status = "contacted";
    const { error } = await (supabase.from("campaign_influencers") as any).update(patch).eq("id", ci.id);
    if (error) {
      flashMsg("Failed to save link");
      return null;
    }
    onChanged(patch as Partial<CampaignInfluencer>);
    return token;
  }

  async function copyLink(regenerate = false) {
    setBusy(true);
    const token = await ensureToken(regenerate);
    setBusy(false);
    setOpen(false);
    if (!token) return;
    await navigator.clipboard.writeText(giftUrl(token));
    flashMsg(regenerate ? "New link copied" : "Link copied");
  }

  async function copyDm() {
    setBusy(true);
    const token = await ensureToken();
    setBusy(false);
    setOpen(false);
    if (!token) return;
    await navigator.clipboard.writeText(giftDmSnippet(firstName, campaign.name, giftUrl(token)));
    flashMsg("DM copied");
  }

  async function sendEmail() {
    setBusy(true);
    try {
      const res = await fetch("/api/gift/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignInfluencerId: ci.id }),
      });
      const body = await res.json();
      if (body.skipped) {
        flashMsg("Email trigger disabled");
      } else if (!res.ok) {
        flashMsg(body.error || "Send failed");
      } else {
        const patch: Partial<CampaignInfluencer> = {
          gift_email_sent_at: new Date().toISOString(),
          gift_invited_at: ci.gift_invited_at || new Date().toISOString(),
        };
        onChanged(patch);
        flashMsg("Email sent");
      }
    } catch {
      flashMsg("Send failed");
    }
    setBusy(false);
    setOpen(false);
  }

  const chip =
    stage === "submitted" ? (
      <button
        className={`inline-flex items-center gap-1 text-[12px] px-1.5 py-1 rounded ${stageStyles[stage]}`}
        onClick={onReview}
        title={`Selected ${shortDate(ci.gift_submitted_at)} — click to review & create the order`}
      >
        {stageLabels[stage]} · {shortDate(ci.gift_submitted_at)} →
      </button>
    ) : (
      <span className={`inline-flex items-center text-[12px] px-1.5 py-1 rounded ${stageStyles[stage]}`}>
        {stage === "not_invited" ? "—" : stageLabels[stage]}
        {stage === "invited" && ci.gift_invited_at ? ` · ${shortDate(ci.gift_invited_at)}` : ""}
        {stage === "opened" && ci.gift_viewed_at ? ` · ${shortDate(ci.gift_viewed_at)}` : ""}
      </span>
    );

  return (
    <div className="flex items-center gap-1" ref={ref}>
      {chip}
      <div className="relative">
        <button
          className="p-1 text-gray-400 hover:text-gray-700 rounded"
          onClick={() => setOpen((o) => !o)}
          title="Gift link actions"
        >
          <Gift className="h-4 w-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-7 z-30 w-52 bg-white border rounded-lg shadow-lg py-1 text-sm">
            <button className="w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50" disabled={busy || !campaign.gift_enabled} onClick={() => copyLink(false)}>
              Copy gift link
            </button>
            <button className="w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50" disabled={busy || !campaign.gift_enabled} onClick={copyDm}>
              Copy DM snippet
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
              disabled={busy || !campaign.gift_enabled || !influencerEmail}
              title={!influencerEmail ? "No email on file" : undefined}
              onClick={sendEmail}
            >
              Send email invite{ci.gift_email_sent_at ? ` (sent ${shortDate(ci.gift_email_sent_at)})` : ""}
            </button>
            <button className="w-full text-left px-3 py-1.5 hover:bg-gray-50" onClick={() => { setOpen(false); onCustomize(); }}>
              Customize products…
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-500 disabled:opacity-50"
              disabled={busy || !ci.gift_token || !!ci.gift_submitted_at}
              onClick={() => copyLink(true)}
            >
              Regenerate link
            </button>
            {!campaign.gift_enabled && (
              <div className="px-3 py-1.5 text-xs text-amber-700 bg-amber-50">Enable the Gift Page in campaign settings first.</div>
            )}
          </div>
        )}
      </div>
      {flash && <span className="text-[11px] text-green-700 whitespace-nowrap">{flash}</span>}
    </div>
  );
}
