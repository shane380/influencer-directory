"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createInvite } from "@/lib/invites";
import { Sidebar } from "@/components/sidebar";
import { X, Search, Copy, Check, Settings, ExternalLink } from "lucide-react";
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
  invite_slug: string | null;
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
    usageRights: "90 days per campaign, renewable",
  });
  const [dealType, setDealType] = useState<"affiliate" | "ad_spend" | "retainer">("retainer");
  const [dealAffiliate, setDealAffiliate] = useState(10);
  const [dealAdSpendPct, setDealAdSpendPct] = useState(5);
  const [dealAdSpendMin, setDealAdSpendMin] = useState(0);
  const [dealRetainer, setDealRetainer] = useState(1500);
  const [addAffiliate, setAddAffiliate] = useState(false);
  const [offerChoice, setOfferChoice] = useState(false);
  const [secondDealType, setSecondDealType] = useState<"affiliate" | "ad_spend" | "retainer">("ad_spend");
  const [secondAddAffiliate, setSecondAddAffiliate] = useState(false);
  const [isExistingCreator, setIsExistingCreator] = useState(false);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Pending invites
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);

  // Edit Terms modal state
  const [editTermsInvite, setEditTermsInvite] = useState<any>(null);
  const [editTermsLoading, setEditTermsLoading] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser({
          displayName: user.user_metadata?.full_name || user.email || "",
          email: user.email || "",
          profilePhotoUrl: null,
          isAdmin: user.user_metadata?.role === "admin",
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

      if (!creatorsData || creatorsData.length === 0) {
        setLoading(false);
        return;
      }

      const enriched = await Promise.all(
        creatorsData.map(async (c: any) => {
          let influencer = null;
          let invite_slug: string | null = null;

          if (c.invite_id) {
            const { data: invite } = await supabase
              .from("creator_invites" as any)
              .select("influencer_id, slug")
              .eq("id", c.invite_id)
              .single() as any;

            invite_slug = invite?.slug || null;

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
            invite_slug,
          } as Creator;
        })
      );

      setCreators(enriched);
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
      usageRights: "90 days per campaign, renewable",
    });
    setDealType("retainer");
    setDealAffiliate(10);
    setDealAdSpendPct(5);
    setDealAdSpendMin(0);
    setDealRetainer(1500);
    setAddAffiliate(false);
    setOfferChoice(false);
    setSecondDealType("ad_spend");
    setSecondAddAffiliate(false);
    setIsExistingCreator(false);
    setGeneratedUrl(null);
    setCopied(false);
  }

  function buildDealStructure() {
    switch (dealType) {
      case "affiliate":
        return { type: "affiliate", commission_rate: dealAffiliate };
      case "ad_spend":
        return { type: "ad_spend", percentage: dealAdSpendPct, ...(dealAdSpendMin > 0 ? { first_month_minimum: dealAdSpendMin } : {}), ...(addAffiliate ? { commission_rate: dealAffiliate } : {}) };
      case "retainer":
        return { type: "retainer", monthly_rate: dealRetainer, ...(addAffiliate ? { commission_rate: dealAffiliate } : {}) };
    }
  }

  function getInviteFields() {
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

    return { retainerAmount, adSpendPercentage, adSpendMinimum, commissionRate };
  }

  async function handleGenerateInvite() {
    setSubmittingInvite(true);
    const ds = buildDealStructure();
    const fields = getInviteFields();
    try {
      const { url } = await (createInvite as any)({
        creatorName: inviteForm.creatorName,
        creatorEmail: inviteForm.email || null,
        commissionRate: fields.commissionRate,
        videosPerMonth: inviteForm.videosPerMonth,
        usageRights: inviteForm.usageRights,
        influencerId: selectedInfluencer?.id || null,
        dealStructure: ds,
        dealType,
        retainerAmount: fields.retainerAmount,
        adSpendPercentage: fields.adSpendPercentage,
        adSpendMinimum: fields.adSpendMinimum,
        offerChoice,
        isExistingCreator,
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        activeTab="creators"
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
            <h1 className="text-2xl font-semibold text-gray-900">Creators</h1>
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

          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : creators.length === 0 && pendingInvites.length === 0 ? (
            <p className="text-gray-500 text-sm">No creators yet.</p>
          ) : creators.length > 0 ? (
            <>
            {pendingInvites.length > 0 && (
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Active Creators</h2>
            )}
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Creator</th>
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
                          {creator.invite_slug && (
                            <a
                              href={`${process.env.NEXT_PUBLIC_APP_URL || "https://creators.namaclo.com"}/invite/${creator.invite_slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              title="View Creator Profile"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
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
                {generatedUrl ? "Invite Created" : "Generate Creator Invite"}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Creator Name</label>
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Videos / Month</label>
                    <input
                      type="text"
                      value={inviteForm.videosPerMonth}
                      onChange={(e) => setInviteForm((f) => ({ ...f, videosPerMonth: e.target.value }))}
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isExistingCreator}
                      onChange={(e) => setIsExistingCreator(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Existing creator</span>
                  </label>

                  {/* Deal Structure */}
                  <div className="border-t pt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Deal Type</label>
                    <select
                      value={dealType}
                      onChange={(e) => {
                        const val = e.target.value as typeof dealType;
                        setDealType(val);
                        if (val === "affiliate") setAddAffiliate(false);
                        if (offerChoice && val === secondDealType) {
                          const opts = ["retainer", "ad_spend", "affiliate"].filter(t => t !== val) as typeof dealType[];
                          setSecondDealType(opts[0]);
                        }
                      }}
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 mb-3"
                    >
                      <option value="retainer">Monthly Retainer</option>
                      <option value="ad_spend">% of Ad Spend</option>
                      <option value="affiliate">Affiliate Only</option>
                    </select>

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

                    {dealType !== "affiliate" && (
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
                    <div className="border-t pt-3 mt-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={offerChoice}
                          onChange={(e) => setOfferChoice(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700 font-medium">Offer two deal options</span>
                      </label>
                      <p className="text-xs text-gray-400 mt-1">Creator can choose between two deal structures</p>
                    </div>

                    {offerChoice && (
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

                        {secondDealType !== "affiliate" && (
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
    </div>
  );
}
