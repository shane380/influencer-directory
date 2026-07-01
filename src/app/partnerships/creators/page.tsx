"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createInvite } from "@/lib/invites";
import { Sidebar } from "@/components/sidebar";
import {
  X,
  Search,
  Copy,
  Check,
  Settings,
  ExternalLink,
  Trash2,
  Video,
  Shirt,
  Gift,
  Mail,
  ChevronRight,
  ChevronDown,
  ArrowDown,
  ArrowUp,
  ShoppingCart,
  Loader2,
} from "lucide-react";
import { OrderDialog } from "@/components/order-dialog";
import type { Influencer, CampaignInfluencer, ShopifyOrderStatus } from "@/types/database";
import { NotificationBadge } from "@/components/partnerships/notification-badge";
import { EditTermsModal } from "@/components/edit-terms-modal";
import { SubmissionReviewModal } from "@/components/submission-review-modal";
import { KpiCard } from "@/components/partnerships/kpi-card";
import { DateRangePicker, resolveRange, type ResolvedRange } from "@/components/partnerships/date-range-picker";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type OverviewCategory = "affiliate" | "whitelisting";

type AffiliateStats = {
  window: { start: string; end: string };
  granularity: "daily" | "monthly";
  series: Array<{ date: string; revenue: number; orders: number }>;
  totals: {
    revenue: number;
    orders: number;
    aov: number;
    active_partners_with_sales: number;
    growth_pct_vs_previous_period: number | null;
  };
};

type WhitelistingStats = {
  window: { start: string; end: string };
  granularity: "daily" | "monthly";
  series: Array<{ date: string; spend: number; purchase_value: number }>;
  totals: {
    spend: number;
    purchase_value: number;
    roas: number | null;
    ads_live: number;
    whitelisted_partners_count: number;
    growth_pct_vs_previous_period: number | null;
  };
};

type Mover = {
  creator_id: string | null;
  influencer_id: string | null;
  name: string | null;
  handle: string | null;
  photo: string | null;
  current: number;
  previous: number;
  delta: number;
  pct_change: number | null;
  roas?: number | null;
};

type TopMovers = {
  category: OverviewCategory;
  window: { start: string; end: string };
  risers: Mover[];
  fallers: Mover[];
};

function formatMoney(n: number): string {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function formatMoneyDecimals(n: number): string {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
// Growth-vs-previous-window helpers, shared by the KPI cards and the chart strip.
function growthSubtitle(p: number | null): string {
  if (p == null) return "vs previous period";
  return `${p >= 0 ? "↑" : "↓"} ${Math.abs(p)}% vs previous period`;
}
function growthTone(p: number | null | undefined): "default" | "success" | "danger" {
  if (p == null) return "default";
  return p >= 0 ? "success" : "danger";
}
function growthValue(p: number | null | undefined): string {
  if (p == null) return "—";
  return `${p >= 0 ? "↑" : "↓"} ${Math.abs(p)}%`;
}
// Human label for the active window, used in card/chart headers.
function describeRange(r: ResolvedRange): string {
  switch (r.preset) {
    case "7d": return "Last 7 days";
    case "30d": return "Last 30 days";
    case "90d": return "Last 90 days";
    case "ytd": return "Year to date";
    default: return `${r.start} → ${r.end}`;
  }
}

// Title-case a display name for the Top partners card. Idempotent — only used at
// render time, never mutates upstream data.
function toTitleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => (/^\s+$/.test(part) || part === "-" ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

const orderDots: Record<ShopifyOrderStatus, string> = {
  draft: "bg-amber-400",
  fulfilled: "bg-blue-400",
  shipped: "bg-purple-400",
  delivered: "bg-green-500",
};

const orderStatusLabels: Record<ShopifyOrderStatus, string> = {
  draft: "Draft",
  fulfilled: "Fulfilled",
  shipped: "Shipped",
  delivered: "Delivered",
};

interface Creator {
  id: string; // row_id from API ("influencer:<uuid>" | "partner:<uuid>" | "legacy:<uuid>")
  is_partner: boolean;
  is_affiliate: boolean;
  is_whitelisted: boolean;
  creator_id: string | null;
  creator_name: string;
  commission_rate: number | null;
  affiliate_code: string;
  invite_id: string;
  influencer_id: string | null;
  influencer?: {
    name: string;
    instagram_handle: string;
    profile_photo_url: string | null;
  } | null;
  shopify_code_status: "active" | "pending" | "failed" | null;
  has_affiliate: boolean;
  has_retainer: boolean;
  revenue_mtd: number;
  ad_spend_mtd: number;
  ads_live: number;
  last_activity_at: string | null;
  shopify_order_id: string | null;
  shopify_order_status: ShopifyOrderStatus | null;
  product_selections: any[] | null;
}

// Map an active-partners API row into a Creator. Shared by the initial load
// and the post-order refresh so the Order column stays in sync.
function mapPartnerRow(p: any): Creator {
  return {
    id: p.row_id || p.creator_id || `influencer:${p.influencer_id}`,
    is_partner: !!p.is_partner,
    is_affiliate: !!p.is_affiliate,
    is_whitelisted: !!p.is_whitelisted,
    creator_id: p.creator_id || null,
    creator_name: p.creator_name || p.name || "",
    commission_rate: p.commission_rate ?? null,
    affiliate_code: p.affiliate_code || "",
    invite_id: p.invite_id || "",
    influencer_id: p.influencer_id || null,
    influencer: p.name || p.handle || p.photo
      ? {
          name: p.name || "",
          instagram_handle: p.handle || "",
          profile_photo_url: p.photo,
        }
      : null,
    shopify_code_status: p.shopify_code_status,
    has_affiliate: p.has_affiliate,
    has_retainer: !!p.has_retainer,
    revenue_mtd: p.revenue_mtd || 0,
    ad_spend_mtd: p.ad_spend_mtd || 0,
    ads_live: p.ads_live || 0,
    last_activity_at: p.last_activity_at,
    shopify_order_id: p.shopify_order_id || null,
    shopify_order_status: p.shopify_order_status || null,
    product_selections: p.product_selections || null,
  };
}

type SortKey = "revenue_mtd" | "ad_spend_mtd" | "ads_live" | "last_activity_at" | "name";
type SortDir = "asc" | "desc";

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "—";
  const day = 86400000;
  const days = Math.floor(ms / day);
  if (days === 0) return "today";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

interface InfluencerResult {
  id: string;
  name: string;
  instagram_handle: string;
  email: string | null;
  profile_photo_url: string | null;
}

export default function CreatorsListPage() {
  const router = useRouter();
  const supabase = createClient();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InfluencerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState<InfluencerResult | null>(null);
  const [inviteForm, setInviteForm] = useState({
    creatorName: "",
    email: "",
    videosPerMonth: "3-5",
    contentType: "",
    usageRights: "90 days per campaign, renewable",
  });
  const [dealType, setDealType] = useState<"affiliate" | "ad_spend" | "retainer" | "none" | "gift_card" | "flat_fee">("retainer");
  const [dealAffiliate, setDealAffiliate] = useState(10);
  const [dealAdSpendPct, setDealAdSpendPct] = useState(5);
  const [dealAdSpendMin, setDealAdSpendMin] = useState(0);
  const [dealRetainer, setDealRetainer] = useState(1500);
  const [dealRetainerMonths, setDealRetainerMonths] = useState("");
  const [dealGiftCard, setDealGiftCard] = useState(200);
  const [dealFlatFee, setDealFlatFee] = useState(500);
  const [flatFeeWhitelistingDays, setFlatFeeWhitelistingDays] = useState(60);
  const [contentSource, setContentSource] = useState<"new" | "existing">("new");
  const [addAffiliate, setAddAffiliate] = useState(false);
  const [offerChoice, setOfferChoice] = useState(false);
  const [secondDealType, setSecondDealType] = useState<"affiliate" | "ad_spend" | "retainer" | "none" | "gift_card" | "flat_fee">("ad_spend");
  const [secondAddAffiliate, setSecondAddAffiliate] = useState(false);
  const [isExistingCreator, setIsExistingCreator] = useState(false);
  const [existingHasAdSpend, setExistingHasAdSpend] = useState(false);
  const [minimumCommitment, setMinimumCommitment] = useState<number | null>(null);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Quick add from Instagram state
  const [quickAddHandle, setQuickAddHandle] = useState("");
  const [quickAddLooking, setQuickAddLooking] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [quickAddPreview, setQuickAddPreview] = useState<{
    username: string;
    full_name: string;
    profile_pic_url: string | null;
    follower_count: number;
  } | null>(null);
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  // Pending invites
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  // Accepted gift card / flat fee invites awaiting fulfillment
  const [pendingOneOffs, setPendingOneOffs] = useState<any[]>([]);

  // Overview header (category toggle + shared range → KPIs + chart + movers)
  const [overviewCategory, setOverviewCategory] = useState<OverviewCategory>("affiliate");
  const [range, setRange] = useState<ResolvedRange>(() => resolveRange("30d"));
  const [affiliateStats, setAffiliateStats] = useState<AffiliateStats | null>(null);
  const [whitelistingStats, setWhitelistingStats] = useState<WhitelistingStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [movers, setMovers] = useState<TopMovers | null>(null);
  const [moversLoading, setMoversLoading] = useState(true);
  // Partner-table search
  const [partnerSearch, setPartnerSearch] = useState("");

  // Inbox: which group is expanded (single-open accordion)
  const [inboxExpanded, setInboxExpanded] = useState<"submissions" | "outfits" | "gift_cards" | null>(null);
  // Pending Invites collapsed row at bottom
  const [pendingInvitesExpanded, setPendingInvitesExpanded] = useState(false);
  // Active partners sort
  const [sortKey, setSortKey] = useState<SortKey>("revenue_mtd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Action queue
  const [pendingRequests, setPendingRequests] = useState<Array<{
    id: string;
    creator_id: string;
    creator_name: string;
    creator_photo: string | null;
    influencer_id: string | null;
    shopify_customer_id: string | null;
    selections: Array<{ product_title?: string; variant_title?: string; image_url?: string; shopify_variant_id?: number; quantity?: number }>;
    notes: string | null;
    created_at: string;
  }>>([]);
  const [reviewingRequest, setReviewingRequest] = useState<string | null>(null);
  const [requestSaving, setRequestSaving] = useState(false);
  const [pendingSubmissions, setPendingSubmissions] = useState<Array<{
    id: string;
    creator_id: string;
    creator_name: string;
    creator_photo: string | null;
    month: string;
    file_count: number;
    files: Array<{ name: string; r2_url?: string; mime_type?: string }>;
    notes?: string;
    created_at: string;
    status: "pending" | "approved" | "revision_requested";
    admin_feedback: string | null;
  }>>([]);
  const [reviewingSubmission, setReviewingSubmission] = useState<string | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<Creator | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit Terms modal state
  const [editTermsInvite, setEditTermsInvite] = useState<any>(null);
  const [editTermsLoading, setEditTermsLoading] = useState<string | null>(null);

  // Shopify sync retry state
  const [retryingSync, setRetryingSync] = useState<string | null>(null);

  // Order dialog (place a Shopify gifting order for a partner from the table).
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderInfluencer, setOrderInfluencer] = useState<Influencer | null>(null);
  const [loadingOrderFor, setLoadingOrderFor] = useState<string | null>(null);

  // Re-fetch the partners list so the Order column reflects the latest draft/order.
  const refreshPartners = useCallback(async () => {
    const res = await fetch("/api/partnerships/active-partners");
    const json = res.ok ? await res.json() : { partners: [] };
    setCreators((json.partners || []).map(mapPartnerRow));
  }, []);

  // OrderDialog needs the full influencer record (email, phone, address,
  // shopify_customer_id, current draft) which the table row doesn't carry, so
  // fetch it on demand when the cart icon is clicked.
  async function openOrderDialog(influencerId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setLoadingOrderFor(influencerId);
    try {
      const { data, error } = await supabase
        .from("influencers" as any)
        .select("*")
        .eq("id", influencerId)
        .single();
      if (error || !data) {
        alert("Could not load this partner's details to place an order.");
        return;
      }
      setOrderInfluencer(data as unknown as Influencer);
      setOrderDialogOpen(true);
    } finally {
      setLoadingOrderFor(null);
    }
  }

  // Whitelisting-context virtual row: OrderDialog reads/writes order state on
  // the influencers table when campaign_id is empty.
  const createVirtualCampaignInfluencer = (inf: Influencer): CampaignInfluencer => ({
    id: `virtual-${inf.id}`,
    campaign_id: "",
    influencer_id: inf.id,
    compensation: null,
    notes: null,
    added_at: new Date().toISOString(),
    status: inf.relationship_status,
    partnership_type: inf.partnership_type,
    shopify_order_id: null,
    shopify_order_status: null,
    tracking_number: null,
    tracking_url: null,
    order_status_updated_at: null,
    shopify_real_order_id: null,
    product_selections: null,
    content_posted: "none",
    approval_status: null,
    approval_note: null,
    approved_at: null,
    approved_by: null,
  });

  async function retryShopifySync(creatorId: string) {
    setRetryingSync(creatorId);
    try {
      const res = await fetch("/api/admin/shopify-sync-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator_id: creatorId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Retry failed: ${data.error || "Unknown error"}`);
        return;
      }
      setCreators((prev) =>
        prev.map((c) =>
          c.id === creatorId ? { ...c, shopify_code_status: "active" } : c
        )
      );
    } catch (err: any) {
      alert(`Retry failed: ${err.message}`);
    } finally {
      setRetryingSync(null);
    }
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase.from("profiles") as any)
          .select("display_name, profile_photo_url, is_admin, is_manager")
          .eq("id", user.id)
          .single();
        setCurrentUser({
          displayName: profile?.display_name || user.email?.split("@")[0] || "User",
          email: user.email || "",
          profilePhotoUrl: profile?.profile_photo_url || null,
          isAdmin: profile?.is_admin || false,
          isManager: profile?.is_manager || false,
        });
      }

      // Single batched fetch replaces the per-creator N+1 fan-out — see
      // /api/partnerships/active-partners for the aggregation.
      const partnersRes = await fetch("/api/partnerships/active-partners");
      const partnersJson = partnersRes.ok ? await partnersRes.json() : { partners: [] };
      const enriched: Creator[] = (partnersJson.partners || []).map(mapPartnerRow);

      // Fetch pending invites
      const { data: invitesData } = await supabase
        .from("creator_invites" as any)
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }) as any;
      setPendingInvites(invitesData || []);

      // Fetch accepted one-off invites awaiting fulfillment
      const { data: oneOffData } = await supabase
        .from("creator_invites" as any)
        .select("*, influencer:influencers!creator_invites_influencer_id_fkey(name, instagram_handle, profile_photo_url)")
        .eq("status", "accepted")
        .is("one_off_fulfilled_at", null)
        .or("has_gift_card.eq.true,has_flat_fee.eq.true")
        .order("accepted_at", { ascending: false }) as any;
      setPendingOneOffs(oneOffData || []);

      setCreators(enriched);

      if (enriched.length === 0) {
        setLoading(false);
        return;
      }

      // Action-queue enrichment uses the same creator metadata we already have.
      // Keyed by raw creators.id because pending requests/submissions reference
      // that UUID directly (c.id is now a prefixed row_id after the pivot).
      const creatorMap = new Map(
        enriched
          .filter((c: any) => c.creator_id)
          .map((c: any) => [c.creator_id as string, c])
      );

      const { data: allPendingReqs } = await supabase
        .from("creator_sample_requests" as any)
        .select("id, creator_id, influencer_id, selections, notes, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false }) as any;

      const { data: allPendingSubs } = await supabase
        .from("creator_content_submissions" as any)
        .select("id, creator_id, month, files, notes, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false }) as any;

      // Fetch shopify_customer_id for influencers with pending requests
      const reqInfluencerIds = [...new Set((allPendingReqs || []).map((r: any) => r.influencer_id).filter(Boolean))];
      let influencerMap = new Map<string, { shopify_customer_id: string | null }>();
      if (reqInfluencerIds.length > 0) {
        const { data: infData } = await (supabase
          .from("influencers") as any)
          .select("id, shopify_customer_id")
          .in("id", reqInfluencerIds);
        for (const inf of (infData || []) as any[]) {
          influencerMap.set(inf.id, { shopify_customer_id: inf.shopify_customer_id || null });
        }
      }

      setPendingRequests((allPendingReqs || []).map((req: any) => {
        const c = creatorMap.get(req.creator_id);
        const inf = influencerMap.get(req.influencer_id);
        return {
          id: req.id,
          creator_id: req.creator_id,
          creator_name: c?.influencer?.name || c?.creator_name || "Unknown",
          creator_photo: c?.influencer?.profile_photo_url || null,
          influencer_id: req.influencer_id,
          shopify_customer_id: inf?.shopify_customer_id || null,
          selections: req.selections || [],
          notes: req.notes,
          created_at: req.created_at,
        };
      }));

      setPendingSubmissions((allPendingSubs || []).map((sub: any) => {
        const c = creatorMap.get(sub.creator_id);
        const files = Array.isArray(sub.files) ? sub.files : [];
        return {
          id: sub.id,
          creator_id: sub.creator_id,
          creator_name: c?.influencer?.name || c?.creator_name || "Unknown",
          creator_photo: c?.influencer?.profile_photo_url || null,
          month: sub.month,
          file_count: files.length,
          files,
          notes: sub.notes,
          created_at: sub.created_at,
          status: "pending" as const,
          admin_feedback: null,
        };
      }));

      setLoading(false);
    }
    load();
  }, []);

  // Search influencers
  const searchInfluencers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle, email, profile_photo_url")
      .or(`name.ilike.%${query}%,instagram_handle.ilike.%${query}%`)
      .limit(8);
    setSearchResults((data as InfluencerResult[]) || []);
    setSearching(false);
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => searchInfluencers(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchInfluencers]);

  // Overview stats + movers refetch whenever the category or shared range changes.
  // Only the active category's stats endpoint is hit; movers is category-aware.
  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setMoversLoading(true);
    const qs = `start=${range.start}&end=${range.end}`;
    const statsUrl =
      overviewCategory === "affiliate"
        ? `/api/partnerships/aggregate-revenue?${qs}`
        : `/api/partnerships/whitelisting-stats?${qs}`;
    fetch(statsUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (overviewCategory === "affiliate") setAffiliateStats(data);
        else setWhitelistingStats(data);
        setStatsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setStatsLoading(false);
      });
    fetch(`/api/partnerships/top-movers?category=${overviewCategory}&${qs}&limit=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setMovers(data);
        setMoversLoading(false);
      })
      .catch(() => {
        if (!cancelled) setMoversLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [overviewCategory, range.start, range.end]);

  async function handleQuickAddLookup() {
    const raw = quickAddHandle.trim();
    if (!raw) return;
    setQuickAddLooking(true);
    setQuickAddError(null);
    setQuickAddPreview(null);

    // Parse Instagram URL or handle
    let username = raw.replace("@", "");
    const urlMatch = raw.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)\/?/);
    if (urlMatch?.[1]) username = urlMatch[1];

    try {
      // Check if already in DB
      const { data: existing } = await supabase
        .from("influencers")
        .select("id, name, instagram_handle, email, profile_photo_url")
        .ilike("instagram_handle", username)
        .limit(1);
      if (existing && existing.length > 0) {
        selectInfluencer(existing[0] as InfluencerResult);
        setQuickAddHandle("");
        setQuickAddLooking(false);
        return;
      }

      // Lookup via API
      let response = await fetch(`/api/instagram-apify?handle=${encodeURIComponent(username)}`);
      if (!response.ok && response.status === 500) {
        response = await fetch(`/api/instagram?handle=${encodeURIComponent(username)}`);
      }
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch Instagram profile");
      }
      const profile = await response.json();
      setQuickAddPreview({
        username: profile.username,
        full_name: profile.full_name || profile.username,
        profile_pic_url: profile.profile_pic_url,
        follower_count: profile.follower_count,
      });
    } catch (err: any) {
      setQuickAddError(err.message || "Lookup failed");
    } finally {
      setQuickAddLooking(false);
    }
  }

  async function handleQuickAddConfirm() {
    if (!quickAddPreview) return;
    setQuickAddSaving(true);
    setQuickAddError(null);

    try {
      // Upload profile photo
      let photoUrl: string | null = null;
      if (quickAddPreview.profile_pic_url) {
        try {
          const photoResponse = await fetch(`/api/instagram/photo?url=${encodeURIComponent(quickAddPreview.profile_pic_url)}`);
          if (photoResponse.ok) {
            const photoBlob = await photoResponse.blob();
            const fileName = `${quickAddPreview.username}-${Date.now()}.jpg`;
            const { error: uploadError } = await supabase.storage
              .from("profile-photos")
              .upload(fileName, photoBlob, { contentType: "image/jpeg" });
            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from("profile-photos")
                .getPublicUrl(fileName);
              photoUrl = urlData.publicUrl;
            }
          }
        } catch {}
      }

      const { data: { user } } = await supabase.auth.getUser();
      const insertResult = await (supabase.from("influencers") as any)
        .insert({
          name: quickAddPreview.full_name,
          instagram_handle: quickAddPreview.username,
          profile_photo_url: photoUrl,
          follower_count: quickAddPreview.follower_count,
          tier: "C",
          partnership_type: "unassigned",
          relationship_status: "prospect",
          created_by: user?.id,
          assigned_to: user?.id,
        })
        .select("id, name, instagram_handle, email, profile_photo_url")
        .single();

      if (insertResult.error) throw insertResult.error;

      selectInfluencer(insertResult.data as InfluencerResult);
      setQuickAddHandle("");
      setQuickAddPreview(null);
    } catch (err: any) {
      setQuickAddError(err.message || "Failed to add influencer");
    } finally {
      setQuickAddSaving(false);
    }
  }

  function selectInfluencer(inf: InfluencerResult) {
    setSelectedInfluencer(inf);
    setInviteForm((f) => ({
      ...f,
      creatorName: inf.name,
      email: inf.email || "",
    }));
    setSearchQuery("");
    setSearchResults([]);
  }

  function resetModal() {
    setShowInviteModal(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedInfluencer(null);
    setInviteForm({
      creatorName: "",
      email: "",
      videosPerMonth: "3-5",
      contentType: "",
      usageRights: "90 days per campaign, renewable",
    });
    setDealType("retainer");
    setDealAffiliate(10);
    setDealAdSpendPct(5);
    setDealAdSpendMin(0);
    setDealRetainer(1500);
    setDealRetainerMonths("");
    setDealGiftCard(200);
    setDealFlatFee(500);
    setFlatFeeWhitelistingDays(60);
    setContentSource("new");
    setAddAffiliate(false);
    setOfferChoice(false);
    setSecondDealType("ad_spend");
    setSecondAddAffiliate(false);
    setIsExistingCreator(false);
    setExistingHasAdSpend(false);
    setMinimumCommitment(null);
    setGeneratedUrl(null);
    setCopied(false);
    setQuickAddHandle("");
    setQuickAddLooking(false);
    setQuickAddError(null);
    setQuickAddPreview(null);
    setQuickAddSaving(false);
  }

  function buildDealStructure() {
    switch (dealType) {
      case "none":
        return null;
      case "affiliate":
        return { type: "affiliate", commission_rate: dealAffiliate };
      case "ad_spend":
        return { type: "ad_spend", percentage: dealAdSpendPct, ...(dealAdSpendMin > 0 ? { first_month_minimum: dealAdSpendMin } : {}), ...(addAffiliate ? { commission_rate: dealAffiliate } : {}) };
      case "retainer":
        return { type: "retainer", monthly_rate: dealRetainer, ...(addAffiliate ? { commission_rate: dealAffiliate } : {}) };
      case "gift_card":
        return { type: "gift_card", gift_card_amount: dealGiftCard, content_source: contentSource, ...(addAffiliate ? { commission_rate: dealAffiliate } : {}) };
      case "flat_fee":
        return { type: "flat_fee", flat_fee_amount: dealFlatFee, whitelisting_duration_days: flatFeeWhitelistingDays, content_source: contentSource, ...(addAffiliate ? { commission_rate: dealAffiliate } : {}) };
    }
  }

  const isOneOff = (t: string) => t === "gift_card" || t === "flat_fee";

  function getInviteFields() {
    if (dealType === "none") {
      return { retainerAmount: null, adSpendPercentage: null, adSpendMinimum: null, commissionRate: 0 };
    }
    const allTypes = offerChoice ? [dealType, secondDealType] : [dealType];
    let retainerAmount = null;
    let adSpendPercentage = null;
    let adSpendMinimum = null;
    let commissionRate = 0;

    for (const t of allTypes) {
      if (t === "retainer") retainerAmount = dealRetainer;
      if (t === "ad_spend") {
        adSpendPercentage = dealAdSpendPct;
        adSpendMinimum = dealAdSpendMin > 0 ? dealAdSpendMin : null;
      }
      if (t === "affiliate") commissionRate = dealAffiliate;
    }

    // Add-on affiliate commission applies to any deal type
    if (addAffiliate || secondAddAffiliate) {
      commissionRate = dealAffiliate;
    }

    const hasRetainer = retainerAmount != null && retainerAmount > 0;
    const hasAdSpend = (adSpendPercentage != null && adSpendPercentage > 0) || (isExistingCreator && existingHasAdSpend);
    const hasAffiliate = commissionRate > 0;
    const hasGiftCard = allTypes.includes("gift_card");
    const hasFlatFee = allTypes.includes("flat_fee");

    return { retainerAmount, adSpendPercentage, adSpendMinimum, commissionRate, hasRetainer, hasAdSpend, hasAffiliate, hasGiftCard, hasFlatFee };
  }

  async function handleGenerateInvite() {
    setSubmittingInvite(true);
    const ds = buildDealStructure();
    const fields = getInviteFields();
    try {
      const oneOff = isOneOff(dealType) || (offerChoice && isOneOff(secondDealType));
      const { url } = await (createInvite as any)({
        creatorName: inviteForm.creatorName,
        creatorEmail: inviteForm.email || null,
        commissionRate: fields.commissionRate,
        videosPerMonth: dealType === "none" || oneOff ? null : inviteForm.videosPerMonth,
        contentType: dealType === "none" ? null : (inviteForm.contentType || null),
        usageRights: inviteForm.usageRights,
        influencerId: selectedInfluencer?.id || null,
        dealStructure: ds,
        dealType: dealType === "none" ? "none" : dealType,
        retainerAmount: fields.retainerAmount,
        retainerMonths: dealType === "retainer" ? dealRetainerMonths : null,
        adSpendPercentage: fields.adSpendPercentage,
        adSpendMinimum: fields.adSpendMinimum,
        offerChoice: dealType === "none" ? false : offerChoice,
        isExistingCreator,
        minimumCommitment: dealType === "none" || oneOff ? null : minimumCommitment,
        hasRetainer: fields.hasRetainer,
        hasAdSpend: fields.hasAdSpend,
        hasAffiliate: fields.hasAffiliate,
        hasGiftCard: fields.hasGiftCard,
        hasFlatFee: fields.hasFlatFee,
        giftCardAmount: fields.hasGiftCard ? dealGiftCard : null,
        flatFeeAmount: fields.hasFlatFee ? dealFlatFee : null,
        whitelistingDurationDays: fields.hasFlatFee ? flatFeeWhitelistingDays : null,
        contentSource: oneOff ? contentSource : null,
      });
      setGeneratedUrl(url);
    } catch (err: any) {
      alert(err.message || "Failed to create invite");
    }
    setSubmittingInvite(false);
  }

  async function revokeInvite(inviteId: string) {
    await (supabase as any)
      .from("creator_invites")
      .update({ status: "expired", expires_at: new Date().toISOString() })
      .eq("id", inviteId);
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
  }

  async function markOneOffFulfilled(inviteId: string) {
    await (supabase as any)
      .from("creator_invites")
      .update({ one_off_fulfilled_at: new Date().toISOString() })
      .eq("id", inviteId);
    setPendingOneOffs((prev) => prev.filter((i) => i.id !== inviteId));
  }

  function copyInviteLink(slug: string) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://creators.namaclo.com";
    navigator.clipboard.writeText(`${baseUrl}/invite/${slug}`);
  }

  async function openEditTerms(creatorId: string, inviteId: string) {
    setEditTermsLoading(creatorId);
    const { data } = await supabase
      .from("creator_invites" as any)
      .select("*")
      .eq("id", inviteId)
      .single() as any;
    if (data) setEditTermsInvite(data);
    setEditTermsLoading(null);
  }

  function copyUrl() {
    if (generatedUrl) {
      navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleRequestAction(requestId: string, action: "approved" | "rejected") {
    setRequestSaving(true);
    try {
      const req = pendingRequests.find((r) => r.id === requestId);
      if (!req) return;

      // If approving, create draft order
      if (action === "approved" && req.shopify_customer_id) {
        const lineItems = (req.selections || []).map((sel) => ({
          variant_id: sel.shopify_variant_id,
          quantity: sel.quantity || 1,
          title: [sel.product_title, sel.variant_title].filter(Boolean).join(" - "),
        }));
        await fetch("/api/shopify/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: req.shopify_customer_id,
            line_items: lineItems,
            note: `Sample request from creator: ${req.creator_name}`,
          }),
        });
      }

      await (supabase
        .from("creator_sample_requests" as any) as any)
        .update({ status: action, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);

      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      setReviewingRequest(null);
    } catch {}
    setRequestSaving(false);
  }

  async function handleReviewAction(
    submissionId: string,
    action: "approved" | "revision_requested",
    feedback?: string,
  ) {
    setReviewSaving(true);
    try {
      const res = await fetch("/api/creator/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: submissionId,
          status: action,
          admin_feedback: action === "revision_requested" ? feedback : undefined,
        }),
      });
      if (res.ok) {
        // When the modal is open for this submission, leave it in the list with
        // the new status so the modal can render its approved/revision state.
        // The list is closed out when the user dismisses the modal (see below).
        if (reviewingSubmission === submissionId) {
          setPendingSubmissions((prev) =>
            prev.map((s) =>
              s.id === submissionId
                ? {
                    ...s,
                    status: action,
                    admin_feedback:
                      action === "revision_requested" ? feedback || null : s.admin_feedback,
                  }
                : s,
            ),
          );
        } else {
          setPendingSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
        }
      }
    } catch {}
    setReviewSaving(false);
  }

  function closeReviewModal() {
    setReviewingSubmission(null);
    setPendingSubmissions((prev) => prev.filter((s) => s.status === "pending"));
  }

  // Derived overview values — the KPI row, chart and totals all read from whichever
  // category is active. Chart series is normalised to {date, primary, secondary}.
  const overviewStats = overviewCategory === "affiliate" ? affiliateStats : whitelistingStats;
  const granularity = overviewStats?.granularity ?? "daily";
  const chartSeries =
    overviewCategory === "affiliate"
      ? (affiliateStats?.series || []).map((d) => ({ date: d.date, primary: d.revenue, secondary: d.orders }))
      : (whitelistingStats?.series || []).map((d) => ({ date: d.date, primary: d.spend, secondary: d.purchase_value }));

  // Partner-table search — filter by name/handle before sorting.
  const partnerQuery = partnerSearch.trim().toLowerCase();
  const filteredCreators = partnerQuery
    ? creators.filter((c) => {
        const name = (c.influencer?.name || c.creator_name || "").toLowerCase();
        const handle = (c.influencer?.instagram_handle || "").toLowerCase();
        return name.includes(partnerQuery) || handle.includes(partnerQuery);
      })
    : creators;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        activeTab="partners"
        onTabChange={() => {}}
        currentUser={currentUser}
        onLogout={async () => {
          await supabase.auth.signOut();
          router.push("/login");
        }}
      />
      <main className="flex-1 px-8 pt-12 pb-8">
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Partners</h1>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 transition-colors"
            >
              Generate Invite
            </button>
          </div>

          {/* Overview controls — category toggle + shared date range */}
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="inline-flex bg-gray-100 rounded-md p-0.5">
              {([
                ["affiliate", "Affiliate"],
                ["whitelisting", "Whitelisting"],
              ] as const).map(([val, label]) => {
                const active = overviewCategory === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setOverviewCategory(val)}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      active
                        ? "bg-white text-gray-900 font-medium shadow-sm"
                        : "bg-transparent text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <DateRangePicker value={range} onChange={setRange} />
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {statsLoading || !overviewStats ? (
              Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
            ) : overviewCategory === "affiliate" && affiliateStats ? (
              <>
                <KpiCard
                  label="Affiliate revenue"
                  value={formatMoney(affiliateStats.totals.revenue)}
                  subtitle={growthSubtitle(affiliateStats.totals.growth_pct_vs_previous_period)}
                  subtitleTone={growthTone(affiliateStats.totals.growth_pct_vs_previous_period)}
                />
                <KpiCard
                  label="Orders"
                  value={affiliateStats.totals.orders.toLocaleString()}
                  subtitle={`${formatMoneyDecimals(affiliateStats.totals.aov)} AOV`}
                />
                <KpiCard label="AOV" value={formatMoneyDecimals(affiliateStats.totals.aov)} />
                <KpiCard
                  label="Affiliates with sales"
                  value={affiliateStats.totals.active_partners_with_sales.toLocaleString()}
                  subtitle="driving sales this period"
                />
              </>
            ) : whitelistingStats ? (
              <>
                <KpiCard
                  label="Whitelisting spend"
                  value={formatMoney(whitelistingStats.totals.spend)}
                  subtitle={growthSubtitle(whitelistingStats.totals.growth_pct_vs_previous_period)}
                  subtitleTone={growthTone(whitelistingStats.totals.growth_pct_vs_previous_period)}
                />
                <KpiCard
                  label="ROAS"
                  value={whitelistingStats.totals.roas != null ? `${whitelistingStats.totals.roas.toFixed(2)}x` : "—"}
                  subtitle={`${formatMoney(whitelistingStats.totals.purchase_value)} return`}
                />
                <KpiCard label="Purchase value" value={formatMoney(whitelistingStats.totals.purchase_value)} />
                <KpiCard
                  label="Ads live"
                  value={whitelistingStats.totals.ads_live.toLocaleString()}
                  subtitle={`${whitelistingStats.totals.whitelisted_partners_count} partners`}
                />
              </>
            ) : null}
          </div>

          {/* Two-column overview: chart (left) + top movers (right) */}
          <div
            className="grid gap-3 mb-6"
            style={{ gridTemplateColumns: "1.7fr 1fr" }}
          >
            {/* LEFT — category-aware chart */}
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3.5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-medium text-gray-900">
                  {overviewCategory === "affiliate" ? "Affiliate code revenue" : "Whitelisting ad spend"}
                </h2>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">{describeRange(range)}</span>
              </div>
              <div className="h-56">
                {statsLoading || !overviewStats ? (
                  <ChartSkeleton />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1D9E75" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#1D9E75" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="pvGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#F3F4F6" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#6B7280" }}
                        tickFormatter={(d) => {
                          const date = new Date(d);
                          if (granularity === "monthly") {
                            return date.toLocaleDateString("en", { month: "short" });
                          }
                          return date.toLocaleDateString("en", { month: "short", day: "numeric" });
                        }}
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#6B7280" }}
                        tickFormatter={(v) =>
                          v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${v}`
                        }
                        width={48}
                      />
                      <Tooltip
                        cursor={{ stroke: "#D1D5DB", strokeDasharray: "3 3" }}
                        content={(props: any) => {
                          const { active, label, payload } = props;
                          if (!active || !label || !payload?.[0]) return null;
                          const p = payload[0].payload;
                          const date = new Date(label);
                          return (
                            <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm text-xs" style={{ minWidth: 150 }}>
                              <div className="font-medium text-gray-900 mb-1">
                                {granularity === "monthly"
                                  ? date.toLocaleDateString("en", { month: "long", year: "numeric" })
                                  : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                              </div>
                              {overviewCategory === "affiliate" ? (
                                <>
                                  <div className="flex items-center justify-between gap-3 text-gray-700">
                                    <span>Revenue</span>
                                    <span className="font-medium">{formatMoneyDecimals(p.primary)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-gray-700">
                                    <span>Orders</span>
                                    <span className="font-medium">{p.secondary}</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between gap-3 text-gray-700">
                                    <span>Spend</span>
                                    <span className="font-medium">{formatMoneyDecimals(p.primary)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-gray-700">
                                    <span>Purchase value</span>
                                    <span className="font-medium">{formatMoneyDecimals(p.secondary)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-gray-700">
                                    <span>ROAS</span>
                                    <span className="font-medium">{p.primary > 0 ? `${(p.secondary / p.primary).toFixed(2)}x` : "—"}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        }}
                      />
                      {overviewCategory === "whitelisting" && (
                        <Area
                          type="monotone"
                          dataKey="secondary"
                          stroke="#3B82F6"
                          strokeWidth={1.5}
                          fill="url(#pvGradient)"
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="primary"
                        stroke="#1D9E75"
                        strokeWidth={2}
                        fill="url(#revGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
              {/* Totals strip */}
              <div className="border-t border-gray-200 mt-3 pt-3 flex items-center gap-6">
                {overviewCategory === "affiliate" ? (
                  <>
                    <ChartStat label="Period revenue" value={affiliateStats ? formatMoney(affiliateStats.totals.revenue) : "—"} loading={statsLoading} />
                    <ChartStat label="Orders" value={affiliateStats ? affiliateStats.totals.orders.toLocaleString() : "—"} loading={statsLoading} />
                    <ChartStat
                      label="Growth"
                      value={growthValue(affiliateStats?.totals.growth_pct_vs_previous_period)}
                      loading={statsLoading}
                      tone={growthTone(affiliateStats?.totals.growth_pct_vs_previous_period)}
                    />
                  </>
                ) : (
                  <>
                    <ChartStat label="Period spend" value={whitelistingStats ? formatMoney(whitelistingStats.totals.spend) : "—"} loading={statsLoading} />
                    <ChartStat label="ROAS" value={whitelistingStats?.totals.roas != null ? `${whitelistingStats.totals.roas.toFixed(2)}x` : "—"} loading={statsLoading} />
                    <ChartStat
                      label="Growth"
                      value={growthValue(whitelistingStats?.totals.growth_pct_vs_previous_period)}
                      loading={statsLoading}
                      tone={growthTone(whitelistingStats?.totals.growth_pct_vs_previous_period)}
                    />
                  </>
                )}
              </div>
            </div>

            {/* RIGHT — Top movers */}
            <MoversCard
              category={overviewCategory}
              range={range}
              movers={movers}
              loading={moversLoading}
            />
          </div>

          {/* Inbox — unified action queue across submissions, outfits, gift cards */}
          {(() => {
            const visibleSubmissions = pendingSubmissions.filter((s) => s.status === "pending");
            const submissionsCount = visibleSubmissions.length;
            const outfitsCount = pendingRequests.length;
            const giftCardsCount = pendingOneOffs.length;
            const total = submissionsCount + outfitsCount + giftCardsCount;
            return (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-3">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h2 className="text-[13px] font-medium text-gray-900">
                    Inbox <span className="text-gray-500 font-normal">· {total}</span>
                  </h2>
                </div>
                <InboxRow
                  icon={<Video className="h-[18px] w-[18px] text-gray-500" />}
                  label="Content submissions"
                  count={submissionsCount}
                  expanded={inboxExpanded === "submissions"}
                  onToggle={() => setInboxExpanded((p) => (p === "submissions" ? null : "submissions"))}
                >
                  {visibleSubmissions.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-gray-500">No pending submissions.</div>
                  ) : (
                    <div className="px-4 py-3 space-y-2">
                      {visibleSubmissions.map((sub) => {
                        const [yr, mo] = (sub.month || "").split("-");
                        const monthLabel = yr && mo
                          ? new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString("en", { month: "long", year: "numeric" })
                          : sub.month;
                        return (
                          <div key={`sub-${sub.id}`} className="bg-gray-50 rounded-md px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              {sub.creator_photo ? (
                                <img src={sub.creator_photo} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-200 flex-shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900">{sub.creator_name}</div>
                                <div className="text-xs text-gray-500">
                                  Content submissions · {sub.file_count} file{sub.file_count !== 1 ? "s" : ""} for {monthLabel}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0 ml-3">
                              <button
                                onClick={() => handleReviewAction(sub.id, "approved")}
                                className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition-colors"
                              >
                                Mark as Done
                              </button>
                              <button
                                onClick={() => setReviewingSubmission(sub.id)}
                                className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
                              >
                                Review
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </InboxRow>
                <InboxRow
                  icon={<Shirt className="h-[18px] w-[18px] text-gray-500" />}
                  label="Outfit requests"
                  count={outfitsCount}
                  expanded={inboxExpanded === "outfits"}
                  onToggle={() => setInboxExpanded((p) => (p === "outfits" ? null : "outfits"))}
                >
                  {pendingRequests.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-gray-500">No outstanding outfit requests.</div>
                  ) : (
                    <div className="px-4 py-3 space-y-2">
                      {pendingRequests.map((req) => {
                        const productNames = req.selections
                          .map((s) => [s.product_title, s.variant_title].filter(Boolean).join(" - "))
                          .join(", ");
                        return (
                          <div key={`req-${req.id}`} className="bg-gray-50 rounded-md px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              {req.creator_photo ? (
                                <img src={req.creator_photo} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-200 flex-shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900">{req.creator_name}</div>
                                <div className="text-xs text-gray-500 truncate">
                                  Outfit request · {productNames || `${req.selections.length} item${req.selections.length !== 1 ? "s" : ""}`}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0 ml-3">
                              <button
                                onClick={async () => {
                                  await (supabase.from("creator_sample_requests" as any) as any)
                                    .update({ status: "approved", reviewed_at: new Date().toISOString() })
                                    .eq("id", req.id);
                                  setPendingRequests((prev) => prev.filter((r) => r.id !== req.id));
                                }}
                                className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition-colors"
                              >
                                Mark as Done
                              </button>
                              <button
                                onClick={() => setReviewingRequest(req.id)}
                                className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
                              >
                                Review
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </InboxRow>
                <InboxRow
                  icon={<Gift className="h-[18px] w-[18px] text-gray-500" />}
                  label="Gift cards to issue"
                  count={giftCardsCount}
                  expanded={inboxExpanded === "gift_cards"}
                  onToggle={() => setInboxExpanded((p) => (p === "gift_cards" ? null : "gift_cards"))}
                  last
                >
                  {pendingOneOffs.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-gray-500">No one-off deals awaiting fulfillment.</div>
                  ) : (
                    <div className="px-4 py-3 space-y-2">
                      {pendingOneOffs.map((inv) => {
                        const isGiftCard = inv.has_gift_card;
                        const isFlatFee = inv.has_flat_fee;
                        const amount = isGiftCard ? inv.gift_card_amount : inv.flat_fee_amount;
                        const typeLabel = isGiftCard ? "Gift Card" : "Flat Fee";
                        const actionLabel = isGiftCard ? "Issue gift card in Shopify" : "Pay flat fee";
                        const days = inv.whitelisting_duration_days;
                        const acceptedDate = inv.accepted_at ? new Date(inv.accepted_at) : null;
                        const expiryDate = isFlatFee && days && acceptedDate
                          ? new Date(acceptedDate.getTime() + days * 86400000).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
                          : null;
                        return (
                          <div key={inv.id} className="bg-gray-50 rounded-md px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              {inv.influencer?.profile_photo_url ? (
                                <img src={inv.influencer.profile_photo_url} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-200 flex-shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900">
                                  {inv.influencer?.name || inv.creator_name}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {typeLabel} · ${amount?.toLocaleString()}
                                  {isFlatFee && days ? ` · ${days}-day whitelisting` : ""}
                                  {expiryDate ? ` (expires ${expiryDate})` : ""}
                                  {" · "}
                                  {inv.content_source === "existing" ? "Existing piece" : "New piece"}
                                  {acceptedDate ? ` · Accepted ${acceptedDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}
                                </div>
                                <div className="text-xs text-amber-700 mt-0.5">{actionLabel}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                              {inv.existing_content_url && (
                                <a
                                  href={inv.existing_content_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 text-xs border rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                  View Post
                                </a>
                              )}
                              <button
                                onClick={() => markOneOffFulfilled(inv.id)}
                                className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
                              >
                                Mark Fulfilled
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </InboxRow>
              </div>
            );
          })()}

          {/* Active Partners table */}
          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : creators.length === 0 ? (
            <p className="text-gray-500 text-sm">No active partners yet.</p>
          ) : (
            <div className="mb-3">
              <div className="relative max-w-xs mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={partnerSearch}
                  onChange={(e) => setPartnerSearch(e.target.value)}
                  placeholder="Search partners…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
              </div>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <SortableHeader label="Partner" sortKey="name" currentKey={sortKey} dir={sortDir} onSort={(k) => {
                      if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else { setSortKey(k); setSortDir("asc"); }
                    }} align="left" />
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Order</th>
                    <SortableHeader label="Affiliate revenue · MTD" sortKey="revenue_mtd" currentKey={sortKey} dir={sortDir} onSort={(k) => {
                      if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else { setSortKey(k); setSortDir("desc"); }
                    }} align="right" />
                    <SortableHeader label="Whitelisting spend · MTD" sortKey="ad_spend_mtd" currentKey={sortKey} dir={sortDir} onSort={(k) => {
                      if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else { setSortKey(k); setSortDir("desc"); }
                    }} align="right" />
                    <SortableHeader label="Ads live" sortKey="ads_live" currentKey={sortKey} dir={sortDir} onSort={(k) => {
                      if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else { setSortKey(k); setSortDir("desc"); }
                    }} align="right" />
                    <SortableHeader label="Activity" sortKey="last_activity_at" currentKey={sortKey} dir={sortDir} onSort={(k) => {
                      if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else { setSortKey(k); setSortDir("desc"); }
                    }} align="right" />
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCreators.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                        No partners match &ldquo;{partnerSearch}&rdquo;.
                      </td>
                    </tr>
                  )}
                  {[...filteredCreators].sort((a, b) => {
                    if (sortKey === "name") {
                      const av = (a.influencer?.name || a.creator_name || "").toLowerCase();
                      const bv = (b.influencer?.name || b.creator_name || "").toLowerCase();
                      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
                    }
                    if (sortKey === "last_activity_at") {
                      const av = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
                      const bv = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
                      return sortDir === "asc" ? av - bv : bv - av;
                    }
                    const av = (a as any)[sortKey] || 0;
                    const bv = (b as any)[sortKey] || 0;
                    return sortDir === "asc" ? av - bv : bv - av;
                  }).map((creator) => {
                    const isPartner = creator.is_partner;
                    const rowClasses = isPartner
                      ? "border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors last:border-b-0"
                      : "border-b border-gray-200 hover:bg-gray-50 transition-colors last:border-b-0";
                    return (
                    <tr
                      key={creator.id}
                      className={rowClasses}
                      onClick={
                        isPartner && creator.creator_id
                          ? () => router.push(`/partnerships/creators/${creator.creator_id}`)
                          : undefined
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {creator.influencer?.profile_photo_url ? (
                            <img
                              src={creator.influencer.profile_photo_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover bg-gray-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200" />
                          )}
                          <div>
                            <div className="font-medium text-gray-900">
                              {creator.influencer?.name || creator.creator_name || "—"}
                            </div>
                            {creator.influencer?.instagram_handle && (
                              <div className="text-gray-500 text-xs">
                                @{creator.influencer.instagram_handle}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RolePills creator={creator} />
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {creator.influencer_id ? (
                            loadingOrderFor === creator.influencer_id ? (
                              <span className="text-gray-400">
                                <Loader2 className="h-4 w-4 animate-spin" />
                              </span>
                            ) : creator.shopify_order_id ? (
                              <button
                                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                                onClick={(e) => openOrderDialog(creator.influencer_id!, e)}
                              >
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${orderDots[creator.shopify_order_status || "draft"]}`}></span>
                                {orderStatusLabels[creator.shopify_order_status || "draft"]}
                              </button>
                            ) : creator.product_selections && creator.product_selections.length > 0 ? (
                              <button
                                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                                onClick={(e) => openOrderDialog(creator.influencer_id!, e)}
                              >
                                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-400"></span>
                                {creator.product_selections.length} items
                              </button>
                            ) : (
                              <button
                                className="text-gray-400 hover:text-gray-600"
                                onClick={(e) => openOrderDialog(creator.influencer_id!, e)}
                                title="Place an order"
                              >
                                <ShoppingCart className="h-4 w-4" />
                              </button>
                            )
                          ) : (
                            <span className="text-gray-300" title="No influencer linked — can't place an order">
                              <ShoppingCart className="h-4 w-4" />
                            </span>
                          )}
                          {isPartner && creator.has_affiliate && creator.shopify_code_status === "failed" && creator.creator_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                retryShopifySync(creator.creator_id!);
                              }}
                              disabled={retryingSync === creator.creator_id}
                              className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                              title="Shopify discount code sync failed — click to retry"
                            >
                              {retryingSync === creator.creator_id ? "Retrying…" : "Retry Shopify sync"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {creator.revenue_mtd > 0
                          ? `$${creator.revenue_mtd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {creator.ad_spend_mtd > 0
                          ? `$${creator.ad_spend_mtd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {creator.ads_live > 0
                          ? creator.ads_live.toLocaleString()
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {relativeTime(creator.last_activity_at)}
                      </td>
                      <td className="px-4 py-3">
                        {isPartner && creator.creator_id ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={`/creator/dashboard?creator_id=${creator.creator_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              title="View Partner Profile"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            {creator.invite_id && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditTerms(creator.creator_id!, creator.invite_id);
                                }}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                title="Edit Terms"
                              >
                                {editTermsLoading === creator.creator_id ? (
                                  <span className="text-xs">...</span>
                                ) : (
                                  <Settings className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setDeleteConfirm(creator);
                              }}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                              title="Delete Partner"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (creator.influencer?.instagram_handle) {
                                setQuickAddHandle(creator.influencer.instagram_handle);
                              }
                              setShowInviteModal(true);
                            }}
                            className="text-xs px-2 py-1 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
                            title="Send a partner invite to this person"
                          >
                            Send invite
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Pending Invites — collapsed row at bottom */}
          {pendingInvites.length > 0 && (() => {
            const STALE_MS = 30 * 86400000;
            const staleCount = pendingInvites.filter((inv: any) =>
              Date.now() - new Date(inv.created_at).getTime() > STALE_MS,
            ).length;
            return (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
                <button
                  type="button"
                  onClick={() => setPendingInvitesExpanded((v) => !v)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <Mail className="h-[18px] w-[18px] text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-900">Pending invites</div>
                    <div className="text-xs text-gray-500">
                      {pendingInvites.length} sent · {staleCount} stale
                    </div>
                  </div>
                  {pendingInvitesExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {pendingInvitesExpanded && (
                  <div className="border-t border-gray-200 px-4 py-3 space-y-2">
                    {pendingInvites.map((inv) => {
                      const isStale = Date.now() - new Date(inv.created_at).getTime() > STALE_MS;
                      return (
                        <div key={inv.id} className="bg-gray-50 rounded-md px-3 py-2 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{inv.creator_name}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-2">
                              <span>
                                {inv.creator_email || "No email"}
                                {inv.deal_type && <> · <span className="capitalize">{inv.deal_type === "ad_spend" ? "% of Ad Spend" : inv.deal_type === "retainer" ? "Retainer" : "Affiliate"}</span></>}
                                {" "}· Sent {new Date(inv.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                              </span>
                              {isStale && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                                  Stale
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => copyInviteLink(inv.slug)}
                              className="px-3 py-1.5 text-xs border rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Copy Link
                            </button>
                            <button
                              onClick={() => setEditTermsInvite(inv)}
                              className="px-3 py-1.5 text-xs border rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Edit Terms
                            </button>
                            <button
                              onClick={() => revokeInvite(inv.id)}
                              className="px-3 py-1.5 text-xs border border-red-200 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </main>

      {/* Edit Terms Modal */}
      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Partner</h3>
            <p className="text-sm text-gray-600 mb-4">
              Delete <strong>{deleteConfirm.creator_name}</strong>? This will remove their account, submissions, and all related data. Their invite link will be reset so it can be reused.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm border rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await fetch("/api/creators/delete", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ creator_id: deleteConfirm.creator_id }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error || "Failed to delete");
                    }
                    setCreators(prev => prev.filter(c => c.id !== deleteConfirm.id));
                    setDeleteConfirm(null);
                  } catch (err: any) {
                    alert(err.message || "Failed to delete partner. Please try again.");
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:bg-red-300"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTermsInvite && (
        <EditTermsModal
          inviteId={editTermsInvite.id}
          initialValues={{
            videos_per_month: editTermsInvite.videos_per_month || "",
            content_type: editTermsInvite.content_type || "",
            usage_rights: editTermsInvite.usage_rights || "",
            notes: editTermsInvite.notes || "",
            deal_structure: editTermsInvite.deal_structure || null,
            commission_rate: editTermsInvite.commission_rate || 10,
            status: editTermsInvite.status || "",
            retainer_months: editTermsInvite.retainer_months ?? null,
          }}
          onClose={() => setEditTermsInvite(null)}
          onSaved={() => {
            setEditTermsInvite(null);
          }}
        />
      )}

      {/* Generate Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {generatedUrl ? "Invite Created" : "Generate Partner Invite"}
              </h2>
              <button onClick={resetModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5">
              {generatedUrl ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Invite for <strong>{inviteForm.creatorName}</strong> has been created.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedUrl}
                      className="flex-1 text-sm border rounded-md px-3 py-2 bg-gray-50 text-gray-700"
                    />
                    <button
                      onClick={copyUrl}
                      className="flex items-center gap-1 px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 transition-colors"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <button
                    onClick={resetModal}
                    className="w-full mt-2 px-4 py-2 border rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Search influencer */}
                  {!selectedInfluencer ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Search Influencer
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search by name or handle..."
                          className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                        />
                      </div>
                      {searching && (
                        <p className="text-xs text-gray-400 mt-2">Searching...</p>
                      )}
                      {searchResults.length > 0 && (
                        <div className="mt-2 border rounded-md divide-y max-h-48 overflow-y-auto">
                          {searchResults.map((inf) => (
                            <button
                              key={inf.id}
                              onClick={() => selectInfluencer(inf)}
                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                            >
                              {inf.profile_photo_url ? (
                                <img
                                  src={inf.profile_photo_url}
                                  alt=""
                                  className="w-8 h-8 rounded-full object-cover bg-gray-200"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-200" />
                              )}
                              <div>
                                <div className="text-sm font-medium text-gray-900">{inf.name}</div>
                                <div className="text-xs text-gray-500">@{inf.instagram_handle}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Quick Add from Instagram */}
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-gray-500 mb-2">Not in the directory? Add from Instagram:</p>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">@</span>
                            <input
                              type="text"
                              value={quickAddHandle}
                              onChange={(e) => { setQuickAddHandle(e.target.value); setQuickAddError(null); setQuickAddPreview(null); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleQuickAddLookup(); } }}
                              placeholder="instagram_handle"
                              className="w-full pl-7 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                            />
                          </div>
                          <button
                            onClick={handleQuickAddLookup}
                            disabled={quickAddLooking || !quickAddHandle.trim()}
                            className="px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {quickAddLooking ? "Looking up..." : "Lookup"}
                          </button>
                        </div>
                        {quickAddError && (
                          <p className="text-xs text-red-500 mt-2">{quickAddError}</p>
                        )}
                        {quickAddPreview && (
                          <div className="mt-2 border rounded-md p-3 bg-gray-50">
                            <div className="flex items-center gap-3">
                              {quickAddPreview.profile_pic_url ? (
                                <img
                                  src={quickAddPreview.profile_pic_url}
                                  alt=""
                                  className="w-10 h-10 rounded-full object-cover bg-gray-200"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-200" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{quickAddPreview.full_name}</div>
                                <div className="text-xs text-gray-500">@{quickAddPreview.username} &middot; {quickAddPreview.follower_count.toLocaleString()} followers</div>
                              </div>
                              <button
                                onClick={handleQuickAddConfirm}
                                disabled={quickAddSaving}
                                className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md hover:bg-gray-800 transition-colors disabled:bg-gray-300"
                              >
                                {quickAddSaving ? "Adding..." : "Add & Select"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 bg-gray-50 rounded-md px-3 py-2">
                      {selectedInfluencer.profile_photo_url ? (
                        <img
                          src={selectedInfluencer.profile_photo_url}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover bg-gray-200"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200" />
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{selectedInfluencer.name}</div>
                        <div className="text-xs text-gray-500">@{selectedInfluencer.instagram_handle}</div>
                      </div>
                      <button
                        onClick={() => setSelectedInfluencer(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Form fields */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Partner Name</label>
                    <input
                      type="text"
                      value={inviteForm.creatorName}
                      onChange={(e) => setInviteForm((f) => ({ ...f, creatorName: e.target.value }))}
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                  {(dealType === "retainer" || dealType === "ad_spend" || (offerChoice && (secondDealType === "retainer" || secondDealType === "ad_spend"))) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Videos / Month</label>
                      <input
                        type="text"
                        value={inviteForm.videosPerMonth}
                        onChange={(e) => setInviteForm((f) => ({ ...f, videosPerMonth: e.target.value }))}
                        placeholder={dealType === "retainer" ? "e.g. 4" : "e.g. 5"}
                        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    </div>
                  )}
                  {!isOneOff(dealType) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Content type</label>
                      <input
                        type="text"
                        value={inviteForm.contentType}
                        onChange={(e) => setInviteForm((f) => ({ ...f, contentType: e.target.value }))}
                        placeholder="e.g. Talking-style UGC, Lifestyle, GRWM"
                        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isExistingCreator}
                      onChange={(e) => {
                        setIsExistingCreator(e.target.checked);
                        if (e.target.checked) {
                          setDealType("none");
                          setOfferChoice(false);
                        } else {
                          setExistingHasAdSpend(false);
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Existing creator</span>
                  </label>
                  {isExistingCreator && dealType === "none" && (
                    <label className="flex items-center gap-2 cursor-pointer ml-6">
                      <input
                        type="checkbox"
                        checked={existingHasAdSpend}
                        onChange={(e) => setExistingHasAdSpend(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Has active ad spend</span>
                    </label>
                  )}
                  {!isOneOff(dealType) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Minimum commitment (months)</label>
                      <input
                        type="number"
                        value={minimumCommitment ?? ""}
                        onChange={(e) => setMinimumCommitment(e.target.value ? Number(e.target.value) : null)}
                        placeholder="Leave blank for month-to-month"
                        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    </div>
                  )}

                  {/* Deal Structure */}
                  <div className="border-t pt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Deal Type</label>
                    <select
                      value={dealType}
                      onChange={(e) => {
                        const val = e.target.value as typeof dealType;
                        setDealType(val);
                        if (val === "none") {
                          setOfferChoice(false);
                          setAddAffiliate(false);
                        }
                        if (val === "affiliate") {
                          setAddAffiliate(false);
                          if (!offerChoice || (secondDealType !== "retainer" && secondDealType !== "ad_spend")) {
                            setInviteForm(f => ({ ...f, videosPerMonth: "" }));
                          }
                        }
                        if (val === "gift_card" || val === "flat_fee") {
                          setAddAffiliate(false);
                          setMinimumCommitment(null);
                        }
                        if (offerChoice && val === secondDealType) {
                          const opts = ["retainer", "ad_spend", "affiliate", "gift_card", "flat_fee"].filter(t => t !== val) as typeof dealType[];
                          setSecondDealType(opts[0]);
                        }
                      }}
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 mb-3"
                    >
                      <option value="none">No Deal (Account Only)</option>
                      <option value="retainer">Monthly Retainer</option>
                      <option value="ad_spend">% of Ad Spend</option>
                      <option value="affiliate">Affiliate Only</option>
                      <option value="gift_card">Gift Card for Content</option>
                      <option value="flat_fee">Flat Fee (Content + Whitelisting)</option>
                    </select>

                    {dealType === "none" && (
                      <div className="text-xs text-gray-400 mb-3">Partner will be sent straight to account creation — no deal terms, no commission link.</div>
                    )}

                    {dealType === "affiliate" && (
                      <div className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">Commission Rate (%)</label>
                        <input type="number" value={dealAffiliate} onChange={(e) => setDealAffiliate(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                      </div>
                    )}
                    {dealType === "ad_spend" && (
                      <div className="space-y-3 mb-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Percentage of Ad Spend (%)</label>
                          <input type="number" value={dealAdSpendPct} onChange={(e) => setDealAdSpendPct(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Minimum Guarantee (USD, optional)</label>
                          <input type="number" value={dealAdSpendMin} onChange={(e) => setDealAdSpendMin(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" placeholder="0" />
                        </div>
                      </div>
                    )}
                    {dealType === "retainer" && (
                      <div className="mb-3 space-y-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Monthly Retainer (USD)</label>
                          <input type="number" value={dealRetainer} onChange={(e) => setDealRetainer(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Duration (months) — leave blank for ongoing</label>
                          <input type="number" min="1" value={dealRetainerMonths} onChange={(e) => setDealRetainerMonths(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" placeholder="e.g. 3" />
                          <p className="text-[11px] text-gray-400 mt-1">Each month pays only once its content is marked received.</p>
                        </div>
                      </div>
                    )}
                    {dealType === "gift_card" && (
                      <div className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">Gift Card Amount (USD)</label>
                        <input type="number" value={dealGiftCard} onChange={(e) => setDealGiftCard(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                        <p className="text-xs text-gray-400 mt-1">In exchange for 1 piece of content. You&apos;ll issue the gift card in Shopify after delivery.</p>
                      </div>
                    )}
                    {dealType === "flat_fee" && (
                      <div className="space-y-3 mb-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Flat Fee (USD)</label>
                          <input type="number" value={dealFlatFee} onChange={(e) => setDealFlatFee(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                          <p className="text-xs text-gray-400 mt-1">In exchange for 1 piece of content + whitelisting.</p>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Whitelisting Duration (days)</label>
                          <select
                            value={[30, 60, 90, 120].includes(flatFeeWhitelistingDays) ? String(flatFeeWhitelistingDays) : "custom"}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "custom") return;
                              setFlatFeeWhitelistingDays(Number(v));
                            }}
                            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                          >
                            <option value="30">30 days</option>
                            <option value="60">60 days</option>
                            <option value="90">90 days</option>
                            <option value="120">120 days</option>
                            <option value="custom">Custom</option>
                          </select>
                          {![30, 60, 90, 120].includes(flatFeeWhitelistingDays) && (
                            <input
                              type="number"
                              value={flatFeeWhitelistingDays}
                              onChange={(e) => setFlatFeeWhitelistingDays(Number(e.target.value))}
                              placeholder="Days"
                              className="w-full border rounded-md px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {isOneOff(dealType) && (
                      <div className="space-y-3 mb-3 p-3 bg-gray-50 rounded-md">
                        <label className="block text-xs text-gray-500 mb-1">Content Source</label>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" checked={contentSource === "new"} onChange={() => setContentSource("new")} />
                            <span>New piece</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" checked={contentSource === "existing"} onChange={() => setContentSource("existing")} />
                            <span>Existing piece</span>
                          </label>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {contentSource === "existing"
                            ? "Partner will paste the post URL on acceptance."
                            : "Partner creates a new piece for this deal."}
                        </p>
                      </div>
                    )}

                    {dealType !== "affiliate" && dealType !== "none" && !isOneOff(dealType) && (
                      <div className="mb-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={addAffiliate} onChange={(e) => setAddAffiliate(e.target.checked)} className="rounded border-gray-300" />
                          <span className="text-xs text-gray-600">Add affiliate commission</span>
                        </label>
                        {addAffiliate && (
                          <div className="mt-2">
                            <label className="block text-xs text-gray-500 mb-1">Commission %</label>
                            <input type="number" value={dealAffiliate} onChange={(e) => setDealAffiliate(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Offer Choice Toggle */}
                    {dealType !== "none" && <div className="border-t pt-3 mt-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={offerChoice}
                          onChange={(e) => setOfferChoice(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700 font-medium">Offer two deal options</span>
                      </label>
                      <p className="text-xs text-gray-400 mt-1">Partner can choose between two deal structures</p>
                    </div>}

                    {dealType !== "none" && offerChoice && (
                      <div className="mt-3 pl-3 border-l-2 border-gray-200">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Second Deal Type</label>
                        <select
                          value={secondDealType}
                          onChange={(e) => {
                            const val = e.target.value as typeof secondDealType;
                            setSecondDealType(val);
                            if (val === "affiliate") setSecondAddAffiliate(false);
                          }}
                          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 mb-3"
                        >
                          {dealType !== "retainer" && <option value="retainer">Monthly Retainer</option>}
                          {dealType !== "ad_spend" && <option value="ad_spend">% of Ad Spend</option>}
                          {dealType !== "affiliate" && <option value="affiliate">Affiliate Only</option>}
                          {dealType !== "gift_card" && <option value="gift_card">Gift Card for Content</option>}
                          {dealType !== "flat_fee" && <option value="flat_fee">Flat Fee (Content + Whitelisting)</option>}
                        </select>

                        {secondDealType === "affiliate" && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Commission Rate (%)</label>
                            <input type="number" value={dealAffiliate} onChange={(e) => setDealAffiliate(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                          </div>
                        )}
                        {secondDealType === "ad_spend" && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Percentage of Ad Spend (%)</label>
                              <input type="number" value={dealAdSpendPct} onChange={(e) => setDealAdSpendPct(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Minimum Guarantee (USD, optional)</label>
                              <input type="number" value={dealAdSpendMin} onChange={(e) => setDealAdSpendMin(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" placeholder="0" />
                            </div>
                          </div>
                        )}
                        {secondDealType === "retainer" && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Monthly Retainer (USD)</label>
                            <input type="number" value={dealRetainer} onChange={(e) => setDealRetainer(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                          </div>
                        )}
                        {secondDealType === "gift_card" && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Gift Card Amount (USD)</label>
                            <input type="number" value={dealGiftCard} onChange={(e) => setDealGiftCard(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                          </div>
                        )}
                        {secondDealType === "flat_fee" && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Flat Fee (USD)</label>
                              <input type="number" value={dealFlatFee} onChange={(e) => setDealFlatFee(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Whitelisting Duration (days)</label>
                              <select
                                value={[30, 60, 90, 120].includes(flatFeeWhitelistingDays) ? String(flatFeeWhitelistingDays) : "custom"}
                                onChange={(e) => { if (e.target.value !== "custom") setFlatFeeWhitelistingDays(Number(e.target.value)); }}
                                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
                              >
                                <option value="30">30 days</option>
                                <option value="60">60 days</option>
                                <option value="90">90 days</option>
                                <option value="120">120 days</option>
                                <option value="custom">Custom</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {secondDealType !== "affiliate" && !isOneOff(secondDealType) && (
                          <div className="mt-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={secondAddAffiliate} onChange={(e) => setSecondAddAffiliate(e.target.checked)} className="rounded border-gray-300" />
                              <span className="text-xs text-gray-600">Add affiliate commission</span>
                            </label>
                            {secondAddAffiliate && (
                              <div className="mt-2">
                                <label className="block text-xs text-gray-500 mb-1">Commission %</label>
                                <input type="number" value={dealAffiliate} onChange={(e) => setDealAffiliate(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleGenerateInvite}
                    disabled={submittingInvite || !inviteForm.creatorName}
                    className="w-full px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {submittingInvite ? "Generating..." : "Generate Invite Link"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Outfit Request Review Modal */}
      {reviewingRequest && (() => {
        const req = pendingRequests.find((r) => r.id === reviewingRequest);
        if (!req) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReviewingRequest(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-3">
                  {req.creator_photo ? (
                    <img src={req.creator_photo} alt="" className="w-9 h-9 rounded-full object-cover bg-gray-200" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200" />
                  )}
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{req.creator_name}</div>
                    <div className="text-xs text-gray-500">Outfit request · {req.selections.length} item{req.selections.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <button onClick={() => setReviewingRequest(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-1 overflow-hidden">
                {/* Left: Products */}
                <div className="flex-1 p-6 overflow-y-auto border-r">
                  {req.notes && <p className="text-sm text-gray-600 italic mb-4">&ldquo;{req.notes}&rdquo;</p>}
                  <div className="space-y-3">
                    {req.selections.map((sel, si) => (
                      <div key={si} className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg">
                        {sel.image_url ? (
                          <img src={sel.image_url} alt={sel.product_title} className="w-20 h-20 object-cover rounded-md bg-gray-50" />
                        ) : (
                          <div className="w-20 h-20 rounded-md bg-gray-100 flex items-center justify-center text-xs text-gray-400">No image</div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{sel.product_title}</div>
                          {sel.variant_title && <div className="text-xs text-gray-500">Size: {sel.variant_title}</div>}
                          <div className="text-xs text-gray-400">Qty: {sel.quantity || 1}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Right: Actions */}
                <div className="w-64 p-6 flex flex-col gap-4">
                  <button
                    onClick={() => handleRequestAction(req.id, "approved")}
                    disabled={requestSaving}
                    className="w-full py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {requestSaving ? "Placing Order..." : "Approve & Place Order"}
                  </button>
                  {!req.shopify_customer_id && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">No Shopify customer linked — order won&apos;t be created automatically.</p>
                  )}
                  <div className="border-t pt-4">
                    <button
                      onClick={() => handleRequestAction(req.id, "rejected")}
                      disabled={requestSaving}
                      className="w-full py-2 text-sm font-medium border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Content Review Modal */}
      {reviewingSubmission && (() => {
        const sub = pendingSubmissions.find((s) => s.id === reviewingSubmission);
        if (!sub) return null;
        return (
          <SubmissionReviewModal
            submission={sub}
            onClose={closeReviewModal}
            onAction={(id, action, feedback) => handleReviewAction(id, action, feedback)}
          />
        );
      })()}

      {orderInfluencer && (
        <OrderDialog
          open={orderDialogOpen}
          onClose={() => {
            setOrderDialogOpen(false);
            setOrderInfluencer(null);
          }}
          onSave={refreshPartners}
          influencer={orderInfluencer}
          campaignInfluencer={createVirtualCampaignInfluencer(orderInfluencer)}
        />
      )}
    </div>
  );
}

function KpiCardSkeleton() {
  return (
    <div className="bg-gray-50 rounded-md px-3.5 py-3">
      <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
      <div className="h-6 w-20 bg-gray-200 rounded animate-pulse mt-2" />
      <div className="h-3 w-28 bg-gray-200 rounded animate-pulse mt-1.5" />
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-full bg-gray-50 rounded animate-pulse" />;
}

function ChartStat({
  label,
  value,
  loading,
  tone = "default",
}: {
  label: string;
  value: string;
  loading?: boolean;
  tone?: "default" | "success" | "danger";
}) {
  const valueColor =
    tone === "success" ? "text-green-600" : tone === "danger" ? "text-red-600" : "text-gray-900";
  return (
    <div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      {loading ? (
        <div className="h-5 w-16 bg-gray-200 rounded animate-pulse mt-1" />
      ) : (
        <div className={`text-sm font-medium mt-0.5 ${valueColor}`}>{value}</div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

// Right-column leaderboard: biggest risers/fallers for the active category vs the
// previous equal-length window. Ranked by dollar delta; % shown per row.
function MoversCard({
  category,
  range,
  movers,
  loading,
}: {
  category: OverviewCategory;
  range: ResolvedRange;
  movers: TopMovers | null;
  loading: boolean;
}) {
  // Guard against showing the previous category's data mid-refetch.
  const valid = !!movers && movers.category === category;
  const risers = valid ? movers!.risers : [];
  const fallers = valid ? movers!.fallers : [];
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3.5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-medium text-gray-900">Top movers</h2>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{describeRange(range)}</span>
      </div>
      {loading || !valid ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : risers.length === 0 && fallers.length === 0 ? (
        <div className="text-xs text-gray-500 py-4 text-center">No movement in this window</div>
      ) : (
        <div className="space-y-3">
          <MoverGroup title="Trending up" dir="up" movers={risers} category={category} />
          <MoverGroup title="Trending down" dir="down" movers={fallers} category={category} />
        </div>
      )}
    </div>
  );
}

function MoverGroup({
  title,
  dir,
  movers,
  category,
}: {
  title: string;
  dir: "up" | "down";
  movers: Mover[];
  category: OverviewCategory;
}) {
  if (movers.length === 0) return null;
  const pctTone = dir === "up" ? "text-green-600" : "text-red-600";
  return (
    <div>
      <div className={`text-[10px] font-medium uppercase tracking-wider mb-1.5 ${pctTone}`}>{title}</div>
      <div className="space-y-0.5">
        {movers.map((m) => {
          const displayName = toTitleCase(m.name) || m.handle || "—";
          const subline =
            category === "whitelisting"
              ? m.roas != null
                ? `${m.roas.toFixed(2)}x ROAS`
                : "—"
              : m.handle
                ? `@${m.handle}`
                : "";
          const pctText =
            m.pct_change == null
              ? m.previous > 0
                ? "—"
                : "New"
              : `${m.pct_change >= 0 ? "↑" : "↓"} ${Math.abs(m.pct_change)}%`;
          const rowClass = "flex items-center gap-2 py-1 px-1 -mx-1 rounded transition-colors";
          const key = m.influencer_id || m.handle || displayName;
          const inner = (
            <>
              {m.photo ? (
                <img src={m.photo} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-200 flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium flex-shrink-0">
                  {initialsFor(displayName)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 truncate">{displayName}</div>
                {subline ? <div className="text-[11px] text-gray-500 truncate">{subline}</div> : null}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-medium text-gray-900">{formatMoney(m.current)}</div>
                <div className={`text-[11px] ${pctTone}`}>{pctText}</div>
              </div>
            </>
          );
          return m.creator_id ? (
            <a key={key} href={`/partnerships/creators/${m.creator_id}`} className={`${rowClass} hover:bg-gray-50`}>
              {inner}
            </a>
          ) : (
            <div key={key} className={rowClass}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InboxRow({
  icon,
  label,
  count,
  expanded,
  onToggle,
  children,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? undefined : "border-b border-gray-200"}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="relative inline-flex">
          {icon}
          <NotificationBadge count={count} />
        </span>
        <span className="flex-1 text-[13px] font-medium text-gray-900">{label}</span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
        )}
      </button>
      {expanded && <div className="border-t border-gray-200">{children}</div>}
    </div>
  );
}

function RolePills({ creator }: { creator: Creator }) {
  // Partner is exclusive — when an influencer has a creator account, that's the
  // only pill we render even if they also have legacy/whitelisting data, because
  // those are captured in the columns to the right.
  const pills: Array<{ label: string; classes: string }> = [];
  if (creator.is_partner) {
    pills.push({ label: "Partner", classes: "bg-gray-100 text-gray-700" });
    if (creator.has_retainer) {
      pills.push({ label: "Retainer", classes: "bg-purple-50 text-purple-700" });
    }
    return (
      <div className="flex flex-wrap gap-1">
        {pills.map((p) => (
          <span key={p.label} className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${p.classes}`}>
            {p.label}
          </span>
        ))}
      </div>
    );
  }
  if (creator.is_affiliate) {
    pills.push({ label: "Affiliate", classes: "bg-emerald-50 text-emerald-700" });
  }
  if (creator.is_whitelisted) {
    pills.push({ label: "Whitelisted", classes: "bg-blue-50 text-blue-700" });
  }
  if (pills.length === 0) {
    return <span className="text-gray-400 text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {pills.map((p) => (
        <span
          key={p.label}
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${p.classes}`}
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align: "left" | "right";
}) {
  const isActive = currentKey === sortKey;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 text-xs uppercase tracking-wider transition-colors ${
          isActive ? "text-gray-700 font-medium" : "text-gray-500 font-medium hover:text-gray-700"
        }`}
      >
        {label}
        {isActive ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );
}
