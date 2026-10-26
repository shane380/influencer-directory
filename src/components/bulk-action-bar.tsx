"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Campaign } from "@/types/database";
import { Button } from "@/components/ui/button";
import { ChevronUp, Check, X, Loader2, AlertTriangle } from "lucide-react";

/** Creators gift-invited in another campaign within this window trigger a warning. */
const RECENT_GIFT_DAYS = 30;

interface BulkActionBarProps {
  selectedCount: number;
  selectedInfluencerIds: string[];
  excludeCampaignIds: string[];
  onAddComplete: () => void;
  onCancel: () => void;
}

type BarState = "idle" | "loading" | "confirm" | "success" | "error";

interface RecentGift {
  influencerId: string;
  campaignName: string;
  invitedAt: string;
}

interface PendingAdd {
  target: Campaign;
  toAdd: string[];
  skipped: number; // already in the target campaign
  skippedRecent?: number; // left out by the user because of a recent gift
  recent: RecentGift[];
}

export function BulkActionBar({
  selectedCount,
  selectedInfluencerIds,
  excludeCampaignIds,
  onAddComplete,
  onCancel,
}: BulkActionBarProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [barState, setBarState] = useState<BarState>("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingAdd | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Fetch active/planning campaigns on mount
  useEffect(() => {
    const fetchCampaigns = async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .in("status", ["planning", "active"])
        .order("start_date", { ascending: false });

      if (data) {
        const filtered = (data as Campaign[]).filter(
          (c) => !excludeCampaignIds.includes(c.id)
        );
        setCampaigns(filtered);
      }
    };
    fetchCampaigns();
  }, [excludeCampaignIds, supabase]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-dismiss after success
  useEffect(() => {
    if (barState === "success") {
      const timer = setTimeout(() => {
        onAddComplete();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [barState, onAddComplete]);

  const handleAddToCampaign = async (targetCampaign: Campaign) => {
    setDropdownOpen(false);
    setBarState("loading");
    setMessage(`Checking ${targetCampaign.name}...`);

    try {
      // Check which influencers already exist in the target campaign
      const { data: existing } = await (supabase
        .from("campaign_influencers") as any)
        .select("influencer_id")
        .eq("campaign_id", targetCampaign.id)
        .in("influencer_id", selectedInfluencerIds);

      const existingIds = new Set((existing || []).map((r: any) => r.influencer_id));
      const toAdd = selectedInfluencerIds.filter((id) => !existingIds.has(id));
      const skipped = selectedInfluencerIds.length - toAdd.length;

      if (toAdd.length === 0) {
        setBarState("success");
        setMessage(`All ${skipped} influencer${skipped !== 1 ? "s" : ""} already in campaign`);
        return;
      }

      // Warn if any of these creators were gift-invited in another campaign recently
      const since = new Date(Date.now() - RECENT_GIFT_DAYS * 86400000).toISOString();
      const { data: recentRows } = await (supabase
        .from("campaign_influencers") as any)
        .select("influencer_id, gift_invited_at, campaign:campaigns(name)")
        .in("influencer_id", toAdd)
        .neq("campaign_id", targetCampaign.id)
        .gte("gift_invited_at", since);

      const seen = new Set<string>();
      const recent: RecentGift[] = [];
      for (const row of recentRows || []) {
        if (seen.has(row.influencer_id)) continue;
        seen.add(row.influencer_id);
        recent.push({
          influencerId: row.influencer_id,
          campaignName: row.campaign?.name?.trim() || "another campaign",
          invitedAt: row.gift_invited_at,
        });
      }

      const next: PendingAdd = { target: targetCampaign, toAdd, skipped, recent };
      if (recent.length > 0) {
        setPending(next);
        setBarState("confirm");
        return;
      }

      await insertRows(next);
    } catch (err) {
      setBarState("error");
      setMessage("An unexpected error occurred");
    }
  };

  const insertRows = async ({ target, toAdd, skipped, skippedRecent = 0 }: PendingAdd) => {
    setPending(null);
    setBarState("loading");
    setMessage(`Adding to ${target.name}...`);

    try {
      if (toAdd.length === 0) {
        setBarState("success");
        setMessage("Nothing to add");
        return;
      }

      // For each influencer to add, get their most recent partnership_type
      const { data: recentTypes } = await (supabase
        .from("campaign_influencers") as any)
        .select("influencer_id, partnership_type")
        .in("influencer_id", toAdd)
        .order("added_at", { ascending: false });

      // Build a map of influencer_id -> most recent partnership_type
      const typeMap = new Map<string, string>();
      if (recentTypes) {
        for (const row of recentTypes) {
          if (!typeMap.has(row.influencer_id)) {
            typeMap.set(row.influencer_id, row.partnership_type);
          }
        }
      }

      // Build insert rows
      const rows = toAdd.map((influencerId) => ({
        campaign_id: target.id,
        influencer_id: influencerId,
        partnership_type: typeMap.get(influencerId) || "unassigned",
      }));

      const { error } = await (supabase
        .from("campaign_influencers") as any)
        .insert(rows);

      if (error) {
        // Handle duplicate key errors gracefully
        if (error.code === "23505") {
          setBarState("success");
          setMessage("Some influencers were already in the campaign");
        } else {
          setBarState("error");
          setMessage(error.message || "Failed to add influencers");
        }
        return;
      }

      setBarState("success");
      const reasons = [
        skipped > 0 ? `${skipped} already in campaign` : null,
        skippedRecent > 0 ? `${skippedRecent} skipped for recent gift` : null,
      ].filter(Boolean);
      if (reasons.length > 0) {
        setMessage(`Added ${toAdd.length} of ${selectedInfluencerIds.length} (${reasons.join(", ")})`);
      } else {
        setMessage(`Added ${toAdd.length} influencer${toAdd.length !== 1 ? "s" : ""} to ${target.name}`);
      }
    } catch (err) {
      setBarState("error");
      setMessage("An unexpected error occurred");
    }
  };

  // Summary line for the warning, e.g. "The Study (131), Monthly Gifting (4)"
  const recentSummary = (recent: RecentGift[]) => {
    const counts = new Map<string, number>();
    for (const r of recent) counts.set(r.campaignName, (counts.get(r.campaignName) || 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => `${name} (${n})`)
      .join(", ");
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)]">
      {/* Animation lives on the inner element: its `forwards` fill would otherwise override the centering transform above. */}
      <div className="animate-slide-up bg-gray-900 text-white rounded-lg shadow-lg px-6 py-3 flex items-center gap-4">
        {barState === "idle" && (
          <>
            <span className="text-sm font-medium">
              {selectedCount} selected
            </span>
            <div className="relative" ref={dropdownRef}>
              <Button
                size="sm"
                variant="secondary"
                className="text-sm"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                disabled={campaigns.length === 0}
                title={campaigns.length === 0 ? "No other active campaigns" : undefined}
              >
                Add to Campaign
                <ChevronUp className="h-4 w-4 ml-1" />
              </Button>
              {dropdownOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-white text-gray-900 rounded-lg shadow-xl border max-h-60 overflow-y-auto">
                  {campaigns.map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                      onClick={() => handleAddToCampaign(c)}
                    >
                      {c.name}
                    </button>
                  ))}
                  {campaigns.length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-400">
                      No other active campaigns
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}

        {barState === "loading" && (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {message}
          </div>
        )}

        {barState === "confirm" && pending && (
          <div className="flex items-center gap-4 text-sm max-w-3xl">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">
                {pending.recent.length} of {pending.toAdd.length} were gift-invited in the last{" "}
                {RECENT_GIFT_DAYS} days
              </div>
              <div className="text-gray-400 text-xs truncate" title={recentSummary(pending.recent)}>
                {recentSummary(pending.recent)}. They may receive back-to-back gift offers.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="secondary"
                className="text-sm"
                onClick={() => {
                  const recentIds = new Set(pending.recent.map((r) => r.influencerId));
                  insertRows({
                    ...pending,
                    toAdd: pending.toAdd.filter((id) => !recentIds.has(id)),
                    skippedRecent: pending.recent.length,
                  });
                }}
              >
                Skip those {pending.recent.length}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="text-sm bg-amber-500 hover:bg-amber-400 text-gray-900"
                onClick={() => insertRows(pending)}
              >
                Add all {pending.toAdd.length} anyway
              </Button>
              <button
                onClick={() => {
                  setPending(null);
                  setBarState("idle");
                }}
                className="text-gray-400 hover:text-white transition-colors"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {barState === "success" && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <Check className="h-4 w-4" />
            {message}
          </div>
        )}

        {barState === "error" && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-red-400">{message}</span>
            <button
              onClick={() => {
                setBarState("idle");
                setMessage("");
              }}
              className="text-gray-400 hover:text-white text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
