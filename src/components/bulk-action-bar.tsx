"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Campaign, CampaignInfluencer } from "@/types/database";
import { Button } from "@/components/ui/button";
import { ChevronUp, Check, X, Loader2, AlertTriangle } from "lucide-react";
import { RECENT_GIFT_DAYS } from "@/lib/gift";

interface BulkActionBarProps {
  selectedCount: number;
  selectedInfluencerIds: string[];
  excludeCampaignIds: string[];
  /**
   * The campaign the rows were selected on. When set, the picker also offers
   * "Move", which removes the creators from this campaign after adding them
   * to the target. Left unset on cross-campaign rosters, where there is no
   * single campaign to move out of.
   */
  sourceCampaign?: Pick<Campaign, "id" | "name">;
  onAddComplete: () => void;
  onCancel: () => void;
}

type BarState = "idle" | "loading" | "confirm" | "success" | "error";
type Mode = "copy" | "move";

interface RecentGift {
  influencerId: string;
  campaignName: string;
  invitedAt: string;
}

/** Source-row fields a move carries over, plus the ones that mark downstream activity. */
type SourceRow = Pick<
  CampaignInfluencer,
  | "id"
  | "influencer_id"
  | "partnership_type"
  | "status"
  | "notes"
  | "compensation"
  | "gift_token"
  | "gift_invited_at"
  | "gift_submitted_at"
  | "shopify_order_id"
  | "product_selections"
  | "content_posted"
>;

interface PendingAction {
  mode: Mode;
  target: Campaign;
  toAdd: string[]; // influencer ids to insert into the target
  inTarget: string[]; // already in the target: not inserted (a move still removes them from here)
  blocked: number; // move only: rows kept here because they have gift, order or content activity
  skippedRecent?: number; // left out by the user because of a recent gift
  recent: RecentGift[];
  /** move only: source rows eligible to leave this campaign, keyed by influencer id */
  movable: Map<string, SourceRow>;
}

// A row with a gift link, submitted selects, an order or tracked content is
// never deleted by a move: that history belongs to this campaign.
const hasActivity = (row: SourceRow): boolean =>
  Boolean(
    row.gift_token ||
      row.gift_invited_at ||
      row.gift_submitted_at ||
      row.shopify_order_id ||
      (row.product_selections && row.product_selections.length > 0) ||
      (row.content_posted && row.content_posted !== "none")
  );

const plural = (n: number, word = "influencer") => `${n} ${word}${n !== 1 ? "s" : ""}`;

export function BulkActionBar({
  selectedCount,
  selectedInfluencerIds,
  excludeCampaignIds,
  sourceCampaign,
  onAddComplete,
  onCancel,
}: BulkActionBarProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("copy");
  const [barState, setBarState] = useState<BarState>("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
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

  const canMove = Boolean(sourceCampaign);
  const effectiveMode: Mode = canMove ? mode : "copy";

  const handleSelectCampaign = async (target: Campaign) => {
    setDropdownOpen(false);
    setBarState("loading");
    setMessage(`Checking ${target.name}...`);

    try {
      let candidates = selectedInfluencerIds;
      let blocked = 0;
      const movable = new Map<string, SourceRow>();

      if (effectiveMode === "move" && sourceCampaign) {
        const { data: sourceRows, error: sourceError } = await (supabase
          .from("campaign_influencers") as any)
          .select(
            "id, influencer_id, partnership_type, status, notes, compensation, gift_token, gift_invited_at, gift_submitted_at, shopify_order_id, product_selections, content_posted"
          )
          .eq("campaign_id", sourceCampaign.id)
          .in("influencer_id", selectedInfluencerIds);
        if (sourceError) throw sourceError;

        const rows = (sourceRows || []) as SourceRow[];

        // Archived orders live in campaign_order_history and cascade-delete with the row.
        const withHistory = new Set<string>();
        if (rows.length > 0) {
          const { data: history } = await (supabase
            .from("campaign_order_history") as any)
            .select("campaign_influencer_id")
            .in("campaign_influencer_id", rows.map((r) => r.id));
          for (const h of history || []) withHistory.add(h.campaign_influencer_id);
        }

        for (const row of rows) {
          if (hasActivity(row) || withHistory.has(row.id)) blocked += 1;
          else movable.set(row.influencer_id, row);
        }
        candidates = [...movable.keys()];

        if (candidates.length === 0) {
          setBarState("error");
          setMessage(
            blocked === 0
              ? "Nothing to move"
              : `Nothing moved: ${blocked === 1 ? "this creator has" : `all ${blocked} have`} gift, order or content activity here`
          );
          return;
        }
      }

      // Check which influencers already exist in the target campaign
      const { data: existing } = await (supabase
        .from("campaign_influencers") as any)
        .select("influencer_id")
        .eq("campaign_id", target.id)
        .in("influencer_id", candidates);

      const existingIds = new Set((existing || []).map((r: any) => r.influencer_id));
      const toAdd = candidates.filter((id) => !existingIds.has(id));
      const inTarget = candidates.filter((id) => existingIds.has(id));

      if (toAdd.length === 0 && effectiveMode === "copy") {
        setBarState("success");
        setMessage(`All ${plural(inTarget.length)} already in campaign`);
        return;
      }

      // Warn if any of these creators were gift-invited in another campaign recently
      const recent: RecentGift[] = [];
      if (toAdd.length > 0) {
        const since = new Date(Date.now() - RECENT_GIFT_DAYS * 86400000).toISOString();
        const { data: recentRows } = await (supabase
          .from("campaign_influencers") as any)
          .select("influencer_id, gift_invited_at, campaign:campaigns(name)")
          .in("influencer_id", toAdd)
          .neq("campaign_id", target.id)
          .gte("gift_invited_at", since);

        const seen = new Set<string>();
        for (const row of recentRows || []) {
          if (seen.has(row.influencer_id)) continue;
          seen.add(row.influencer_id);
          recent.push({
            influencerId: row.influencer_id,
            campaignName: row.campaign?.name?.trim() || "another campaign",
            invitedAt: row.gift_invited_at,
          });
        }
      }

      const next: PendingAction = {
        mode: effectiveMode,
        target,
        toAdd,
        inTarget,
        blocked,
        recent,
        movable,
      };
      // A move deletes rows, so it always confirms; a copy only when there is a warning.
      if (effectiveMode === "move" || recent.length > 0) {
        setPending(next);
        setBarState("confirm");
        return;
      }

      await commit(next);
    } catch (err) {
      setBarState("error");
      setMessage("An unexpected error occurred");
    }
  };

  const commit = async ({
    mode: actionMode,
    target,
    toAdd,
    inTarget,
    blocked,
    skippedRecent = 0,
    movable,
  }: PendingAction) => {
    setPending(null);
    setBarState("loading");
    setMessage(`${actionMode === "move" ? "Moving" : "Adding"} to ${target.name}...`);

    try {
      if (toAdd.length === 0 && actionMode === "copy") {
        setBarState("success");
        setMessage("Nothing to add");
        return;
      }

      if (toAdd.length > 0) {
        let rows: Record<string, unknown>[];

        if (actionMode === "move") {
          // Carry this campaign's row over: partnership type, communication
          // status, notes and compensation. Approval is per campaign, so the
          // target starts it fresh. Owner lives on the influencer, not the row.
          rows = toAdd.map((influencerId) => {
            const source = movable.get(influencerId);
            return {
              campaign_id: target.id,
              influencer_id: influencerId,
              partnership_type: source?.partnership_type || "unassigned",
              status: source?.status || "prospect",
              notes: source?.notes ?? null,
              compensation: source?.compensation ?? null,
            };
          });
        } else {
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

          rows = toAdd.map((influencerId) => ({
            campaign_id: target.id,
            influencer_id: influencerId,
            partnership_type: typeMap.get(influencerId) || "unassigned",
          }));
        }

        const { error } = await (supabase
          .from("campaign_influencers") as any)
          .insert(rows);

        if (error) {
          // Handle duplicate key errors gracefully
          if (error.code === "23505" && actionMode === "copy") {
            setBarState("success");
            setMessage("Some influencers were already in the campaign");
          } else {
            setBarState("error");
            setMessage(
              error.code === "23505"
                ? `Some were already in ${target.name}. Nothing was moved; try again.`
                : error.message || `Failed to ${actionMode === "move" ? "move" : "add"} influencers`
            );
          }
          return;
        }
      }

      // A move removes the rows that were inserted plus the ones already in the target.
      let moved = 0;
      if (actionMode === "move" && sourceCampaign) {
        const leaving = new Set([...toAdd, ...inTarget]);
        const rowIds = [...movable.values()]
          .filter((r) => leaving.has(r.influencer_id))
          .map((r) => r.id);
        if (rowIds.length > 0) {
          const { error: deleteError } = await (supabase
            .from("campaign_influencers") as any)
            .delete()
            .in("id", rowIds);
          if (deleteError) {
            setBarState("error");
            setMessage(
              `Added ${toAdd.length} to ${target.name} but could not remove them from ${sourceCampaign.name}`
            );
            return;
          }
        }
        moved = rowIds.length;
      }

      setBarState("success");
      const verb = actionMode === "move" ? "Moved" : "Added";
      const n = actionMode === "move" ? moved : toAdd.length;
      const total = selectedInfluencerIds.length;
      const reasons = [
        inTarget.length > 0
          ? actionMode === "move"
            ? `${inTarget.length} already there`
            : `${inTarget.length} already in campaign`
          : null,
        blocked > 0 ? `${blocked} kept here with gift or order activity` : null,
        skippedRecent > 0 ? `${skippedRecent} skipped for recent gift` : null,
      ].filter(Boolean);
      if (reasons.length === 0 && n === total) {
        setMessage(`${verb} ${plural(n)} to ${target.name}`);
      } else {
        setMessage(
          `${verb} ${n}${n < total ? ` of ${total}` : ""} to ${target.name}` +
            (reasons.length > 0 ? ` (${reasons.join(", ")})` : "")
        );
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

  // Confirm panel copy
  const confirmTitle = (p: PendingAction) => {
    if (p.mode === "move") {
      return `Move ${p.toAdd.length + p.inTarget.length} to ${p.target.name}?`;
    }
    return `${p.recent.length} of ${p.toAdd.length} ${p.recent.length === 1 ? "was" : "were"} gift-invited in the last ${RECENT_GIFT_DAYS} days`;
  };

  const confirmDetail = (p: PendingAction) => {
    const parts: string[] = [];
    if (p.mode === "move") {
      parts.push(`They'll be removed from ${sourceCampaign?.name || "this campaign"}.`);
      if (p.inTarget.length > 0) parts.push(`${p.inTarget.length} already in ${p.target.name}.`);
      if (p.blocked > 0) {
        parts.push(`${p.blocked} stay here (gift, order or content activity).`);
      }
    }
    if (p.recent.length > 0) {
      parts.push(
        p.mode === "move"
          ? `${p.recent.length} ${p.recent.length === 1 ? "was" : "were"} gift-invited in the last ${RECENT_GIFT_DAYS} days: ${recentSummary(p.recent)}. They may receive back-to-back gift offers.`
          : `${recentSummary(p.recent)}. They may receive back-to-back gift offers.`
      );
    }
    return parts.join(" ");
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
                {effectiveMode === "move" ? "Move to Campaign" : "Add to Campaign"}
                <ChevronUp className="h-4 w-4 ml-1" />
              </Button>
              {dropdownOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-white text-gray-900 rounded-lg shadow-xl border overflow-hidden">
                  {canMove && (
                    <div className="px-3 pt-3 pb-2 border-b bg-gray-50">
                      <div
                        role="radiogroup"
                        aria-label="Copy or move"
                        className="flex rounded-md bg-gray-200/70 p-0.5 text-xs font-medium"
                      >
                        {(["copy", "move"] as Mode[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={mode === m}
                            onClick={() => setMode(m)}
                            className={`flex-1 rounded px-2 py-1 transition-colors ${
                              mode === m
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-500 hover:text-gray-700"
                            }`}
                          >
                            {m === "copy" ? "Copy" : "Move"}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                        {mode === "move"
                          ? `Removes them from ${sourceCampaign?.name || "this campaign"}. Creators with gift, order or content activity stay.`
                          : `Keeps them in ${sourceCampaign?.name || "this campaign"} too.`}
                      </p>
                    </div>
                  )}
                  <div className="max-h-60 overflow-y-auto">
                    {campaigns.map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        onClick={() => handleSelectCampaign(c)}
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
            {pending.recent.length > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            ) : null}
            <div className="min-w-0">
              <div className="font-medium">{confirmTitle(pending)}</div>
              <div className="text-gray-400 text-xs truncate" title={confirmDetail(pending)}>
                {confirmDetail(pending)}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pending.recent.length > 0 ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-sm"
                    onClick={() => {
                      const recentIds = new Set(pending.recent.map((r) => r.influencerId));
                      commit({
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
                    onClick={() => commit(pending)}
                  >
                    {pending.mode === "move"
                      ? `Move all ${pending.toAdd.length + pending.inTarget.length} anyway`
                      : `Add all ${pending.toAdd.length} anyway`}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-sm"
                  onClick={() => commit(pending)}
                >
                  Move {pending.toAdd.length + pending.inTarget.length}
                </Button>
              )}
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
