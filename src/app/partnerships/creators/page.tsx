"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createInvite } from "@/lib/invites";
import { Sidebar } from "@/components/sidebar";
import { X, Search, Copy, Check, Settings, ExternalLink, Trash2 } from "lucide-react";
import { EditTermsModal } from "@/components/edit-terms-modal";

interface Creator {
  id: string;
  creator_name: string;
  email: string;
  commission_rate: number;
  affiliate_code: string;
  invite_id: string;
  created_at: string;
  influencer?: {
    id: string;
    name: string;
    instagram_handle: string;
    profile_photo_url: string | null;
  } | null;
  pending_requests: number;
  last_submission: string | null;
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
  }>>([]);
  const [reviewingSubmission, setReviewingSubmission] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<Creator | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit Terms modal state
  const [editTermsInvite, setEditTermsInvite] = useState<any>(null);
  const [editTermsLoading, setEditTermsLoading] = useState<string | null>(null);

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

      const { data: creatorsData } = await supabase
        .from("creators" as any)
        .select("*")
        .order("onboarded_at", { ascending: false });

      // Fetch pending invites (before early return so they always load)
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

      if (!creatorsData || creatorsData.length === 0) {
        setLoading(false);
        return;
      }

      const enriched = await Promise.all(
        creatorsData.map(async (c: any) => {
          let influencer = null;

          if (c.invite_id) {
            const { data: invite } = await supabase
              .from("creator_invites" as any)
              .select("influencer_id")
              .eq("id", c.invite_id)
              .single() as any;

            if (invite?.influencer_id) {
              const { data: inf } = await supabase
                .from("influencers")
                .select("id, name, instagram_handle, profile_photo_url")
                .eq("id", invite.influencer_id)
                .single();
              influencer = inf;
            }
          }

          const { count } = await supabase
            .from("creator_sample_requests" as any)
            .select("id", { count: "exact", head: true })
            .eq("creator_id", c.id)
            .eq("status", "pending") as any;

          const { data: lastSub } = await supabase
            .from("creator_content_submissions" as any)
            .select("created_at")
            .eq("creator_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1) as any;

          return {
            ...c,
            influencer,
            pending_requests: count || 0,
            last_submission: lastSub?.[0]?.created_at || null,
          } as Creator;
        })
      );

      setCreators(enriched);

      // Fetch action queue items
      const creatorMap = new Map(enriched.map((c: any) => [c.id, c]));

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

  async function handleReviewAction(submissionId: string, action: "approved" | "revision_requested") {
    setReviewSaving(true);
    try {
      const res = await fetch("/api/creator/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: submissionId,
          status: action,
          admin_feedback: action === "revision_requested" ? reviewFeedback : undefined,
        }),
      });
      if (res.ok) {
        setPendingSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
        setReviewingSubmission(null);
        setReviewFeedback("");
      }
    } catch {}
    setReviewSaving(false);
  }

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
      <main className="flex-1 ml-48 px-8 pt-12 pb-8">
        <div className="max-w-5xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Partners</h1>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 transition-colors"
            >
              Generate Invite
            </button>
          </div>

          {/* Pending Invites */}
          {!loading && pendingInvites.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Pending Invites</h2>
              <div className="space-y-2">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="bg-white border rounded-lg px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{inv.creator_name}</div>
                      <div className="text-xs text-gray-500">
                        {inv.creator_email || "No email"}
                        {inv.deal_type && <> · <span className="capitalize">{inv.deal_type === "ad_spend" ? "% of Ad Spend" : inv.deal_type === "retainer" ? "Retainer" : "Affiliate"}</span></>}
                        {" "}· Sent {new Date(inv.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
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
                        onClick={() => {
                          setEditTermsInvite(inv);
                        }}
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
                ))}
              </div>
            </div>
          )}

          {/* Pending One-Off Deals — accepted gift card / flat fee awaiting fulfillment */}
          {!loading && pendingOneOffs.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Pending One-Off Deals ({pendingOneOffs.length})</h2>
              <div className="space-y-2">
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
                    <div key={inv.id} className="bg-white border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
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
            </div>
          )}

          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : creators.length === 0 && pendingInvites.length === 0 ? (
            <p className="text-gray-500 text-sm">No creators yet.</p>
          ) : creators.length > 0 ? (
            <>
            {(pendingRequests.length > 0 || pendingSubmissions.length > 0) && (
              <div className="mb-6">
                <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Needs Attention ({pendingRequests.length + pendingSubmissions.length})
                </h2>
                <div className="space-y-2">
                  {pendingRequests.map((req) => {
                    const productNames = req.selections
                      .map((s) => [s.product_title, s.variant_title].filter(Boolean).join(" - "))
                      .join(", ");
                    return (
                      <div key={`req-${req.id}`} className="bg-white border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
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
                  {pendingSubmissions.map((sub) => {
                    const [yr, mo] = (sub.month || "").split("-");
                    const monthLabel = yr && mo
                      ? new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString("en", { month: "long", year: "numeric" })
                      : sub.month;
                    return (
                      <div key={`sub-${sub.id}`} className="bg-white border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {sub.creator_photo ? (
                            <img src={sub.creator_photo} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-200 flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900">{sub.creator_name}</div>
                            <div className="text-xs text-gray-500">
                              Content submission · {sub.file_count} file{sub.file_count !== 1 ? "s" : ""} for {monthLabel}
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
                            onClick={() => { setReviewingSubmission(sub.id); setReviewFeedback(""); }}
                            className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
                          >
                            Review
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {(pendingInvites.length > 0 || pendingRequests.length > 0 || pendingSubmissions.length > 0) && (
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Active Partners</h2>
            )}
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Partner</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Commission</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Affiliate Code</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Pending Requests</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Last Submission</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {creators.map((creator) => (
                    <tr
                      key={creator.id}
                      className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/partnerships/creators/${creator.id}`)}
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
                              {creator.influencer?.name || creator.creator_name}
                            </div>
                            {creator.influencer?.instagram_handle && (
                              <div className="text-gray-500 text-xs">
                                @{creator.influencer.instagram_handle}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{creator.commission_rate}%</td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {creator.affiliate_code}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        {creator.pending_requests > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            {creator.pending_requests} pending
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {creator.last_submission
                          ? new Date(creator.last_submission).toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <a
                            href={`/creator/dashboard?creator_id=${creator.id}`}
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
                                openEditTerms(creator.id, creator.invite_id);
                              }}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              title="Edit Terms"
                            >
                              {editTermsLoading === creator.id ? (
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          ) : null}
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
                      body: JSON.stringify({ creator_id: deleteConfirm.id }),
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
                      <div className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">Monthly Retainer (USD)</label>
                        <input type="number" value={dealRetainer} onChange={(e) => setDealRetainer(Number(e.target.value))} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
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
        const [yr, mo] = (sub.month || "").split("-");
        const monthLabel = yr && mo
          ? new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString("en", { month: "long", year: "numeric" })
          : sub.month;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReviewingSubmission(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-3">
                  {sub.creator_photo ? (
                    <img src={sub.creator_photo} alt="" className="w-9 h-9 rounded-full object-cover bg-gray-200" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200" />
                  )}
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{sub.creator_name}</div>
                    <div className="text-xs text-gray-500">{sub.file_count} file{sub.file_count !== 1 ? "s" : ""} for {monthLabel}</div>
                  </div>
                </div>
                <button onClick={() => setReviewingSubmission(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-1 overflow-hidden">
                {/* Left: Content */}
                <div className="flex-1 p-6 overflow-y-auto border-r">
                  {sub.notes && <p className="text-sm text-gray-600 italic mb-4">&ldquo;{sub.notes}&rdquo;</p>}
                  <div className="space-y-4">
                    {sub.files.map((file, fi) => {
                      const isImage = file.mime_type?.startsWith("image/");
                      const isVideo = file.mime_type?.startsWith("video/");
                      return (
                        <div key={fi}>
                          {isImage && file.r2_url ? (
                            <a href={file.r2_url} target="_blank" rel="noopener noreferrer">
                              <img src={file.r2_url} alt={file.name} className="w-full max-h-[400px] object-contain rounded-lg border border-gray-200 hover:opacity-90 transition-opacity bg-gray-50" />
                            </a>
                          ) : isVideo && file.r2_url ? (
                            <video controls preload="metadata" playsInline className="w-full max-h-[400px] rounded-lg border border-gray-200 bg-black">
                              <source src={file.r2_url} type={file.mime_type || "video/mp4"} />
                              <source src={file.r2_url} type="video/mp4" />
                            </video>
                          ) : file.r2_url ? (
                            <a href={file.r2_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                              <div className="text-xs text-gray-400">{file.name?.split(".").pop()?.toUpperCase()}</div>
                              <div className="text-sm text-gray-700">{file.name}</div>
                            </a>
                          ) : (
                            <div className="p-4 border border-gray-200 rounded-lg text-sm text-gray-400">{file.name}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">{file.name}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Right: Actions */}
                <div className="w-64 p-6 flex flex-col gap-4">
                  <button
                    onClick={() => handleReviewAction(sub.id, "approved")}
                    disabled={reviewSaving}
                    className="w-full py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {reviewSaving ? "Saving..." : "Approve"}
                  </button>
                  <div className="border-t pt-4">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Request Revision</label>
                    <textarea
                      placeholder="What changes are needed?"
                      value={reviewFeedback}
                      onChange={(e) => setReviewFeedback(e.target.value)}
                      rows={4}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
                    />
                    <button
                      onClick={() => handleReviewAction(sub.id, "revision_requested")}
                      disabled={reviewSaving}
                      className="w-full mt-2 py-2 text-sm font-medium border border-amber-400 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
                    >
                      Request Revision
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
