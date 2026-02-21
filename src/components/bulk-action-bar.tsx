"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Campaign } from "@/types/database";
import { Button } from "@/components/ui/button";
import { ChevronUp, Check, X, Loader2 } from "lucide-react";

interface BulkActionBarProps {
  selectedCount: number;
  selectedInfluencerIds: string[];
  excludeCampaignIds: string[];
  onAddComplete: () => void;
  onCancel: () => void;
}

type BarState = "idle" | "loading" | "success" | "error";

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
    setMessage(`Adding to ${targetCampaign.name}...`);

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
        campaign_id: targetCampaign.id,
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
      if (skipped > 0) {
        setMessage(`Added ${toAdd.length} of ${selectedInfluencerIds.length} (${skipped} already in campaign)`);
      } else {
        setMessage(`Added ${toAdd.length} influencer${toAdd.length !== 1 ? "s" : ""} to ${targetCampaign.name}`);
      }
    } catch (err) {
      setBarState("error");
      setMessage("An unexpected error occurred");
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="bg-gray-900 text-white rounded-lg shadow-lg px-6 py-3 flex items-center gap-4">
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
