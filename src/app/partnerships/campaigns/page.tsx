"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { Plus, Search, ChevronDown, ChevronRight, ExternalLink, X, Pencil } from "lucide-react";

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  brief_url: string | null;
  brief_images: { url: string; drive_file_id?: string }[];
  due_date: string | null;
  available_products: Product[];
  max_selects: number;
  campaign_type: string;
  status: string;
  created_by: string | null;
  created_at: string;
  parent_campaign_id: string | null;
  banner_image: { url: string; drive_file_id?: string } | null;
  deliverables: string | null;
  go_live_date: string | null;
  counts: { total: number; confirmed: number; content_submitted: number; complete: number };
}

interface Product {
  variant_id: string;
  product_id?: string;
  product_title: string;
  variant_title?: string;
  image_url?: string;
}

interface Assignment {
  id: string;
  campaign_id: string;
  influencer_id: string | null;
  creator_id: string | null;
  status: string;
  selected_products: Product[];
  creator_notes: string | null;
  admin_notes: string | null;
  order_id: string | null;
  sent_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
  creator_name?: string;
  influencer_name?: string;
  influencer_handle?: string;
}

interface Creator {
  id: string;
  creator_name: string;
  invite_id: string;
  influencer?: { id: string; name: string; instagram_handle: string } | null;
}

interface SearchProduct {
  product_id: number;
  variant_id: number;
  title: string;
  variant_title: string | null;
  sku: string;
  price: string;
  image: string | null;
}

export default function CampaignsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    brief_url: "",
    due_date: "",
    max_selects: 2,
    campaign_type: "mass" as "mass" | "individual",
    deliverables: "",
    go_live_date: "",
  });
  const [briefImages, setBriefImages] = useState<{ url: string; drive_file_id?: string }[]>([]);
  const [bannerImage, setBannerImage] = useState<{ url: string; drive_file_id?: string } | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [selectedCreators, setSelectedCreators] = useState<{ influencer_id: string | null; creator_id: string | null; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Product search
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<SearchProduct[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // Creator search
  const [creators, setCreators] = useState<Creator[]>([]);
  const [creatorsLoaded, setCreatorsLoaded] = useState(false);

  // Creative Invitation modal
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [invitationParentId, setInvitationParentId] = useState<string>("");
  const [invProductTab, setInvProductTab] = useState<"wardrobe" | "new">("wardrobe");
  const [wardrobeItems, setWardrobeItems] = useState<Product[]>([]);
  const [wardrobeLoading, setWardrobeLoading] = useState(false);

  // Existing assignments for edit modal
  const [existingAssignments, setExistingAssignments] = useState<Assignment[]>([]);

  // Detail view
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [childInvitations, setChildInvitations] = useState<Campaign[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    fetchCampaigns();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUser({
          displayName: user.user_metadata?.full_name || user.email || "",
          email: user.email || "",
          profilePhotoUrl: null,
          isAdmin: user.user_metadata?.role === "admin",
        });
      }
    });
  }, []);

  async function fetchCampaigns() {
    setLoading(true);
    let result: Campaign[] = [];
    try {
      const res = await fetch("/api/creator/campaigns");
      const data = await res.json();
      result = data.campaigns || [];
      setCampaigns(result);
    } catch {}
    setLoading(false);
    return result;
  }

  async function fetchCreators() {
    if (creatorsLoaded) return;
    const { data } = await (supabase
      .from("creators") as any)
      .select("id, creator_name, invite_id")
      .order("creator_name");

    const enriched: Creator[] = [];
    for (const c of (data || []) as any[]) {
      const { data: invite } = await (supabase
        .from("creator_invites") as any)
        .select("influencer_id")
        .eq("id", c.invite_id)
        .single();

      let inf = null;
      if (invite?.influencer_id) {
        const { data: iData } = await supabase
          .from("influencers")
          .select("id, name, instagram_handle")
          .eq("id", invite.influencer_id)
          .single();
        inf = iData;
      }
      enriched.push({ ...c, influencer: inf as any });
    }
    setCreators(enriched);
    setCreatorsLoaded(true);
  }

  async function searchProducts() {
    if (!productQuery.trim()) return;
    setSearchingProducts(true);
    try {
      const res = await fetch(`/api/shopify/products?query=${encodeURIComponent(productQuery)}`);
      const data = await res.json();
      // Group variants by product_id, keep one representative per product, newest first
      const allProducts: SearchProduct[] = data.products || [];
      const grouped = new Map<number, SearchProduct>();
      for (const p of allProducts) {
        if (!grouped.has(p.product_id)) grouped.set(p.product_id, p);
      }
      // Reverse so newest products (highest product_id) appear first
      const deduped = Array.from(grouped.values()).sort((a, b) => b.product_id - a.product_id);
      setProductResults(deduped);
    } catch {}
    setSearchingProducts(false);
  }

  async function uploadBanner(file: File) {
    setBannerUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/drive/banner", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setBannerImage({ url: data.url, drive_file_id: data.fileId });
      }
    } catch (err) {
      console.error("Banner upload failed:", err);
    }
    setBannerUploading(false);
  }

  async function deleteBanner() {
    if (bannerImage?.drive_file_id) {
      try {
        await fetch("/api/drive/banner", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: bannerImage.drive_file_id }),
        });
      } catch {}
    }
    setBannerImage(null);
  }

  function addProduct(p: SearchProduct) {
    if (availableProducts.find(ap => String(ap.product_id) === String(p.product_id))) return;
    setAvailableProducts(prev => [...prev, {
      variant_id: String(p.variant_id),
      product_id: String(p.product_id),
      product_title: p.title,
      variant_title: p.variant_title || undefined,
      image_url: p.image || undefined,
    }]);
  }

  function removeProduct(variantId: string) {
    setAvailableProducts(prev => prev.filter(p => p.variant_id !== variantId));
  }

  function toggleCreator(c: Creator) {
    const exists = selectedCreators.find(sc => sc.creator_id === c.id);
    let next: typeof selectedCreators;
    if (exists) {
      next = selectedCreators.filter(sc => sc.creator_id !== c.id);
    } else {
      next = [...selectedCreators, {
        creator_id: c.id,
        influencer_id: c.influencer?.id || null,
        name: c.creator_name,
      }];
    }
    setSelectedCreators(next);
    if (showInvitationModal) fetchWardrobeForCreators(next);
  }

  async function fetchWardrobeForCreators(creatorList: { influencer_id: string | null; creator_id: string | null; name: string }[]) {
    const influencerIds = creatorList.map(c => c.influencer_id).filter(Boolean) as string[];
    if (influencerIds.length === 0) { setWardrobeItems([]); return; }
    setWardrobeLoading(true);
    try {
      const { data: orders } = await (supabase
        .from("influencer_orders") as any)
        .select("line_items")
        .in("influencer_id", influencerIds);
      const seen = new Set<string>();
      const items: Product[] = [];
      for (const order of orders || []) {
        for (const li of order.line_items || []) {
          const key = `${li.product_name}||${li.variant_title || ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push({
            variant_id: `wardrobe-${seen.size}`,
            product_title: li.product_name,
            variant_title: li.variant_title || undefined,
            image_url: li.image_url || undefined,
          });
        }
      }
      setWardrobeItems(items);
    } catch {
      setWardrobeItems([]);
    }
    setWardrobeLoading(false);
  }

  function openCreateModal() {
    setEditingCampaign(null);
    setInvitationParentId("");
    setForm({ title: "", description: "", brief_url: "", due_date: "", max_selects: 2, campaign_type: "mass", deliverables: "", go_live_date: "" });
    setBriefImages([]);
    setBannerImage(null);
    setAvailableProducts([]);
    setSelectedCreators([]);
    setShowModal(true);
    setShowInvitationModal(false);
    fetchCreators();
  }

  async function openEditModal(campaign: Campaign) {
    setEditingCampaign(campaign);
    setSelectedCampaign(null);
    setInvitationParentId("");
    setForm({
      title: campaign.title,
      description: campaign.description || "",
      brief_url: campaign.brief_url || "",
      due_date: campaign.due_date || "",
      max_selects: campaign.max_selects,
      campaign_type: campaign.campaign_type as "mass" | "individual",
      deliverables: campaign.deliverables || "",
      go_live_date: campaign.go_live_date || "",
    });
    setBriefImages(campaign.brief_images || []);
    setBannerImage(campaign.banner_image || null);
    setAvailableProducts(campaign.available_products || []);
    setSelectedCreators([]);
    setExistingAssignments([]);
    setShowModal(true);
    setShowInvitationModal(false);
    fetchCreators();
    // Fetch existing assignments for this campaign
    try {
      const res = await fetch(`/api/creator/campaigns/assignments?campaign_id=${campaign.id}`);
      const data = await res.json();
      setExistingAssignments(data.assignments || []);
    } catch {}
  }

  function openCreateInvitation(parentId?: string) {
    setEditingCampaign(null);
    setInvitationParentId(parentId || "");
    setForm({ title: "", description: "", brief_url: "", due_date: "", max_selects: 2, campaign_type: "mass", deliverables: "", go_live_date: "" });
    setBriefImages([]);
    setAvailableProducts([]);
    setSelectedCreators([]);
    setWardrobeItems([]);
    setInvProductTab("wardrobe");
    setShowInvitationModal(true);
    setShowModal(false);
    fetchCreators();
  }

  async function saveCampaign(publish: boolean) {
    if (!form.title.trim()) return;
    setSaving(true);

    const isInvitation = showInvitationModal;
    const parentId = isInvitation ? invitationParentId : null;

    if (isInvitation && !parentId) { setSaving(false); return; }

    const body: Record<string, unknown> = {
      title: form.title,
      description: form.description || null,
      brief_url: form.brief_url || null,
      brief_images: briefImages,
      due_date: form.due_date || null,
      available_products: availableProducts,
      max_selects: form.max_selects,
      campaign_type: form.campaign_type,
      status: editingCampaign ? editingCampaign.status : (publish ? "active" : "draft"),
      banner_image: bannerImage || null,
      deliverables: form.deliverables || null,
      go_live_date: form.go_live_date || null,
    };

    if (parentId) {
      body.parent_campaign_id = parentId;
    }

    if (editingCampaign && selectedCreators.length > 0) {
      // Add new assignments to existing campaign
      body.status = "active";
      body.assignments = selectedCreators.map(sc => ({
        influencer_id: sc.influencer_id,
        creator_id: sc.creator_id,
      }));
    } else if (publish && !editingCampaign) {
      body.assignments = selectedCreators.map(sc => ({
        influencer_id: sc.influencer_id,
        creator_id: sc.creator_id,
      }));
    }

    try {
      if (editingCampaign) {
        body.id = editingCampaign.id;
        await fetch("/api/creator/campaigns", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/creator/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      const refreshed = await fetchCampaigns();
      setShowModal(false);
      setShowInvitationModal(false);
      if (editingCampaign) {
        const updated = (refreshed || []).find((c: Campaign) => c.id === editingCampaign.id);
        if (updated) { setSelectedCampaign(updated); openDetail(updated); }
      } else if (selectedCampaign) {
        openDetail(selectedCampaign);
      }
    } catch {}
    setSaving(false);
  }

  async function openDetail(campaign: Campaign) {
    setSelectedCampaign(campaign);
    setLoadingAssignments(true);
    try {
      const [assignRes, invRes] = await Promise.all([
        fetch(`/api/creator/campaigns/assignments?campaign_id=${campaign.id}`),
        fetch(`/api/creator/campaigns?parent_campaign_id=${campaign.id}`),
      ]);
      const assignData = await assignRes.json();
      const invData = await invRes.json();
      setAssignments(assignData.assignments || []);
      setChildInvitations(invData.campaigns || []);
    } catch {}
    setLoadingAssignments(false);
  }

  async function updateAssignment(id: string, updates: Record<string, unknown>) {
    try {
      await fetch("/api/creator/campaigns/assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      // Refresh
      if (selectedCampaign) {
        const res = await fetch(`/api/creator/campaigns/assignments?campaign_id=${selectedCampaign.id}`);
        const data = await res.json();
        setAssignments(data.assignments || []);
      }
      await fetchCampaigns();
    } catch {}
  }

  async function createGiftedOrder(assignment: Assignment) {
    if (!assignment.selected_products?.length) return;
    try {
      const lineItems = assignment.selected_products.map(p => ({
        variant_id: p.variant_id,
        quantity: 1,
      }));
      const res = await fetch("/api/shopify/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_items: lineItems, note: `Campaign: ${selectedCampaign?.title}` }),
      });
      const data = await res.json();
      if (data.order?.id) {
        await updateAssignment(assignment.id, { order_id: String(data.order.id) });
      }
    } catch (err) {
      console.error("Order creation failed:", err);
    }
  }

  const filtered = campaigns.filter(c => !c.parent_campaign_id && (statusFilter === "all" || c.status === statusFilter));

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      active: "bg-green-100 text-green-800",
      closed: "bg-red-100 text-red-700",
      sent: "bg-blue-100 text-blue-700",
      confirmed: "bg-amber-100 text-amber-800",
      content_submitted: "bg-purple-100 text-purple-800",
      complete: "bg-green-100 text-green-800",
      declined: "bg-gray-100 text-gray-600",
    };
    return map[status] || "bg-gray-100 text-gray-700";
  };

  function renderInvitationModal() {
    if (!showInvitationModal) return null;
    return (
      <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto pt-12 pb-12">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold">New Creative Invitation</h2>
            <button onClick={() => setShowInvitationModal(false)}><X className="h-5 w-5 text-gray-400" /></button>
          </div>

          <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Parent Campaign */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Link to Campaign</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={invitationParentId}
                onChange={e => setInvitationParentId(e.target.value)}
              >
                <option value="">Select a campaign...</option>
                {campaigns.filter(c => !c.parent_campaign_id && c.status === "active").map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Title</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Creative invitation name"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Description / Brief</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief text or creative direction..."
              />
            </div>

            {/* Brief URL */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Brief URL (optional)</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.brief_url}
                onChange={e => setForm(f => ({ ...f, brief_url: e.target.value }))}
                placeholder="https://... (PDF or Canva link)"
              />
            </div>

            {/* Due Date + Max Selects */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Due Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Max Selects</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.max_selects}
                  onChange={e => setForm(f => ({ ...f, max_selects: parseInt(e.target.value) || 2 }))}
                />
              </div>
            </div>

            {/* Campaign Type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Type</label>
              <div className="flex gap-2">
                <button
                  className={`px-3 py-1.5 text-xs rounded-full border ${form.campaign_type === "mass" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200"}`}
                  onClick={() => setForm(f => ({ ...f, campaign_type: "mass" }))}
                >
                  Mass Campaign
                </button>
                <button
                  className={`px-3 py-1.5 text-xs rounded-full border ${form.campaign_type === "individual" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200"}`}
                  onClick={() => setForm(f => ({ ...f, campaign_type: "individual" }))}
                >
                  Individual
                </button>
              </div>
            </div>

            {/* Products */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Available Products</label>
              <div className="flex gap-1 mb-3">
                <button
                  className={`px-3 py-1 text-xs rounded-full border ${invProductTab === "wardrobe" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"}`}
                  onClick={() => setInvProductTab("wardrobe")}
                >
                  From Wardrobe
                </button>
                <button
                  className={`px-3 py-1 text-xs rounded-full border ${invProductTab === "new" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"}`}
                  onClick={() => setInvProductTab("new")}
                >
                  Send New Items
                </button>
              </div>

              {invProductTab === "wardrobe" && (
                <div>
                  {selectedCreators.length === 0 ? (
                    <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">Select partners below to see their wardrobe items</div>
                  ) : wardrobeLoading ? (
                    <div className="text-xs text-gray-400 py-3 text-center">Loading wardrobe...</div>
                  ) : wardrobeItems.length === 0 ? (
                    <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">No wardrobe items found for selected partners</div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {wardrobeItems.map(w => {
                        const alreadyAdded = availableProducts.find(ap => ap.product_title === w.product_title && (ap.variant_title || "") === (w.variant_title || ""));
                        return (
                          <div
                            key={w.variant_id}
                            className={`flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-b-0 ${alreadyAdded ? "opacity-50 cursor-default" : "hover:bg-gray-50 cursor-pointer"}`}
                            onClick={() => {
                              if (alreadyAdded) return;
                              setAvailableProducts(prev => [...prev, { ...w, variant_id: `wardrobe-${Date.now()}-${Math.random().toString(36).slice(2)}` }]);
                            }}
                          >
                            {w.image_url ? <img src={w.image_url} alt="" className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-gray-100 rounded" />}
                            <span className="text-xs flex-1">{w.product_title}{w.variant_title ? ` — ${w.variant_title}` : ""}</span>
                            {alreadyAdded ? <span className="text-xs text-green-600">Added</span> : <span className="text-xs text-gray-400">+ Add</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {invProductTab === "new" && (
                <div>
                  <div className="flex gap-2 mb-2">
                    <input
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={productQuery}
                      onChange={e => setProductQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && searchProducts()}
                      placeholder="Search Shopify products..."
                    />
                    <button
                      onClick={searchProducts}
                      disabled={searchingProducts}
                      className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
                    >
                      {searchingProducts ? "..." : "Search"}
                    </button>
                  </div>

                  {productResults.length > 0 && (
                    <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto mb-2">
                      {productResults.map(p => (
                        <div
                          key={p.product_id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0"
                          onClick={() => addProduct(p)}
                        >
                          {p.image && <img src={p.image} alt="" className="w-8 h-8 object-cover rounded" />}
                          <span className="text-xs flex-1">{p.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {availableProducts.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-1">Selected ({availableProducts.length})</div>
                  <div className="flex gap-2 flex-wrap">
                    {availableProducts.map(p => (
                      <div key={p.variant_id} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-xs">
                        {p.image_url && <img src={p.image_url} alt="" className="w-5 h-5 object-cover rounded" />}
                        {p.product_title}{p.variant_title ? ` — ${p.variant_title}` : ""}
                        <button onClick={() => removeProduct(p.variant_id)} className="ml-1 text-gray-400 hover:text-gray-600">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Assign Partners */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Assign to Partners ({selectedCreators.length} selected)
              </label>
              {!creatorsLoaded ? (
                <div className="text-xs text-gray-400 py-2">Loading partners...</div>
              ) : (
                <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                  {creators.map(c => {
                    const isSelected = selectedCreators.find(sc => sc.creator_id === c.id);
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 border-b border-gray-50 last:border-b-0 ${isSelected ? "bg-blue-50" : ""}`}
                        onClick={() => toggleCreator(c)}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${isSelected ? "bg-gray-900 border-gray-900 text-white" : "border-gray-300"}`}>
                          {isSelected && "✓"}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{c.creator_name}</div>
                          {c.influencer && <div className="text-xs text-gray-400">@{c.influencer.instagram_handle}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={() => setShowInvitationModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              onClick={() => saveCampaign(false)}
              disabled={saving || !form.title.trim() || !invitationParentId}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              onClick={() => saveCampaign(true)}
              disabled={saving || !form.title.trim() || !invitationParentId || selectedCreators.length === 0}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Detail view
  if (selectedCampaign) {
    return (
      <div className="flex h-screen bg-white">
        <Sidebar activeTab="partners" onTabChange={(tab) => { if (tab !== "partners") router.push(`/?tab=${tab}`); }} currentUser={currentUser} onLogout={async () => { await supabase.auth.signOut(); router.push("/login"); }} />
        <div className="flex-1 ml-48 overflow-y-auto p-8">
          <button onClick={() => {
            if (selectedCampaign.parent_campaign_id) {
              const parent = campaigns.find(c => c.id === selectedCampaign.parent_campaign_id);
              if (parent) { openDetail(parent); return; }
            }
            setSelectedCampaign(null);
          }} className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1">
            ← {selectedCampaign.parent_campaign_id ? "Back to Campaign" : "Back to Campaigns"}
          </button>
          {selectedCampaign.parent_campaign_id && (
            <span className="inline-block text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full mb-3">Creative Invitation</span>
          )}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">{selectedCampaign.title}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(selectedCampaign.status)}`}>
                  {selectedCampaign.status}
                </span>
                <span className="text-sm text-gray-500">{selectedCampaign.campaign_type === "mass" ? "Mass" : "Individual"}</span>
                {selectedCampaign.due_date && <span className="text-sm text-gray-500">Due {new Date(selectedCampaign.due_date + "T00:00:00").toLocaleDateString("en", { month: "long", day: "numeric" })}</span>}
              </div>
            </div>
            <button
              onClick={() => openEditModal(selectedCampaign)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Edit Campaign
            </button>
          </div>

          {selectedCampaign.banner_image?.url && (
            <div className="mb-4 rounded-lg overflow-hidden border border-gray-200">
              <img src={selectedCampaign.banner_image.url} alt="Campaign banner" className="w-full h-48 object-cover" />
            </div>
          )}

          {selectedCampaign.description && <p className="text-sm text-gray-600 mb-4">{selectedCampaign.description}</p>}

          {selectedCampaign.deliverables && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Deliverables</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedCampaign.deliverables}</p>
            </div>
          )}

          {selectedCampaign.go_live_date && (
            <div className="mb-4 text-sm text-gray-500">
              Go live: {new Date(selectedCampaign.go_live_date + "T00:00:00").toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}
            </div>
          )}

          {selectedCampaign.brief_url && (
            <a href={selectedCampaign.brief_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4">
              <ExternalLink className="h-3 w-3" /> View Brief
            </a>
          )}

          {selectedCampaign.status === "active" && (
            <button
              onClick={() => openCreateInvitation(selectedCampaign.id)}
              className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 ml-4 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Plus className="h-3 w-3" /> New Creative Invitation
            </button>
          )}

          {selectedCampaign.available_products?.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Available Products ({selectedCampaign.available_products.length})</h3>
              <div className="flex gap-2 flex-wrap">
                {selectedCampaign.available_products.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 border border-gray-200 rounded px-2 py-1">
                    {p.image_url && <img src={p.image_url} alt="" className="w-8 h-8 object-cover rounded" />}
                    <span className="text-xs">{p.product_title}{p.variant_title ? ` — ${p.variant_title}` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assignments ({assignments.length})</h3>

          {loadingAssignments ? (
            <div className="text-gray-400 text-sm py-4">Loading...</div>
          ) : assignments.length === 0 ? (
            <div className="text-gray-400 text-sm py-4">No assignments yet.</div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Partner</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Selected</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Order</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Content</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <div className="font-medium">{a.creator_name || a.influencer_name || "—"}</div>
                        {a.influencer_handle && <div className="text-xs text-gray-400">@{a.influencer_handle}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(a.status)}`}>
                          {a.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {a.selected_products?.length > 0 ? (
                          <div className="flex gap-1">
                            {a.selected_products.map((p, i) => (
                              <span key={i} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded" title={p.product_title}>
                                {p.product_title?.substring(0, 15)}
                              </span>
                            ))}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {a.order_id ? (
                          <span className="text-green-600">#{a.order_id}</span>
                        ) : a.status === "confirmed" ? (
                          <button onClick={() => createGiftedOrder(a)} className="text-blue-600 hover:text-blue-800 underline">
                            Create order
                          </button>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {a.status === "content_submitted" || a.status === "complete" ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {a.status === "content_submitted" && (
                            <button
                              onClick={() => updateAssignment(a.id, { status: "complete" })}
                              className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                            >
                              Complete
                            </button>
                          )}
                          {editingNote === a.id ? (
                            <div className="flex gap-1">
                              <input
                                className="text-xs border border-gray-200 rounded px-2 py-1 w-32"
                                value={noteText}
                                onChange={e => setNoteText(e.target.value)}
                                placeholder="Note..."
                              />
                              <button
                                onClick={() => { updateAssignment(a.id, { admin_notes: noteText }); setEditingNote(null); }}
                                className="text-xs bg-gray-800 text-white px-2 py-1 rounded"
                              >
                                Save
                              </button>
                              <button onClick={() => setEditingNote(null)} className="text-xs text-gray-400">Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingNote(a.id); setNoteText(a.admin_notes || ""); }}
                              className="text-xs text-gray-500 hover:text-gray-800"
                            >
                              {a.admin_notes ? "Edit note" : "Add note"}
                            </button>
                          )}
                        </div>
                        {a.admin_notes && editingNote !== a.id && <div className="text-xs text-gray-400 mt-1">{a.admin_notes}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Creative Invitations */}
          {childInvitations.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Creative Invitations ({childInvitations.length})</h3>
              <div className="space-y-3">
                {childInvitations.map(inv => (
                  <div key={inv.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-medium text-sm">{inv.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(inv.status)}`}>{inv.status}</span>
                          {inv.due_date && <span className="text-xs text-gray-500">Due {new Date(inv.due_date + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => openDetail(inv)}
                        className="text-xs text-gray-500 hover:text-gray-800"
                      >
                        View details →
                      </button>
                    </div>
                    {inv.description && <p className="text-xs text-gray-500 mt-1">{inv.description}</p>}
                    {inv.available_products?.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-2">
                        {inv.available_products.map((p, i) => (
                          <span key={i} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{p.product_title}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 mt-2 text-xs text-gray-400">
                      <span>Assigned: {inv.counts.total}</span>
                      <span>Confirmed: {inv.counts.confirmed}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {renderInvitationModal()}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar activeTab="partners" onTabChange={(tab) => { if (tab !== "partners") router.push(`/?tab=${tab}`); }} currentUser={currentUser} onLogout={async () => { await supabase.auth.signOut(); router.push("/login"); }} />
      <div className="flex-1 ml-48 overflow-y-auto p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Partner Campaigns</h1>
            <p className="text-sm text-gray-500 mt-1">Send briefs, manage product selects, and track content delivery.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => openCreateInvitation()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" /> Creative Invitation
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" /> New Campaign
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {["all", "draft", "active", "closed"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-full border ${statusFilter === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm py-12 text-center">Loading campaigns...</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-400 text-sm py-12 text-center">No campaigns found.</div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Title</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Assigned</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Confirmed</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Content</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Due</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr
                    key={c.id}
                    className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                    onClick={() => openDetail(c)}
                  >
                    <td className="px-4 py-3 font-medium">{c.title}</td>
                    <td className="px-4 py-3 text-gray-500">{c.campaign_type === "mass" ? "Mass" : "Individual"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.counts.total}</td>
                    <td className="px-4 py-3 text-gray-500">{c.counts.confirmed}</td>
                    <td className="px-4 py-3 text-gray-500">{c.counts.content_submitted + c.counts.complete}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.due_date ? new Date(c.due_date + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditModal(c); }}
                        className="text-gray-400 hover:text-gray-700"
                        title="Edit campaign"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto pt-12 pb-12">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold">{editingCampaign ? "Edit Campaign" : "New Campaign"}</h2>
                <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-gray-400" /></button>
              </div>

              <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Title</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Campaign name"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Description / Brief</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                    rows={3}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Brief text or campaign description..."
                  />
                </div>

                {/* Brief URL */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Brief URL (optional)</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.brief_url}
                    onChange={e => setForm(f => ({ ...f, brief_url: e.target.value }))}
                    placeholder="https://... (PDF or Canva link)"
                  />
                </div>

                {/* Banner Image */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Banner Image (optional)</label>
                  {bannerImage?.url ? (
                    <div className="relative border border-gray-200 rounded-lg overflow-hidden">
                      <img src={bannerImage.url} alt="Banner preview" className="w-full h-32 object-cover" />
                      <button
                        onClick={deleteBanner}
                        className="absolute top-2 right-2 bg-white/90 rounded-full p-1 hover:bg-white shadow-sm"
                      >
                        <X className="h-4 w-4 text-gray-500" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${bannerUploading ? "border-gray-300 bg-gray-50" : "border-gray-200 hover:border-gray-400"}`}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        const file = e.dataTransfer?.files?.[0];
                        if (file && file.type.startsWith("image/")) uploadBanner(file);
                      }}
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/*";
                        input.onchange = () => {
                          const file = input.files?.[0];
                          if (file) uploadBanner(file);
                        };
                        input.click();
                      }}
                    >
                      {bannerUploading ? (
                        <div className="text-sm text-gray-400">Uploading...</div>
                      ) : (
                        <>
                          <div className="text-sm text-gray-400">Drop an image here or click to upload</div>
                          <div className="text-xs text-gray-300 mt-1">JPG, PNG, WebP</div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Deliverables */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Deliverables (optional)</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                    rows={2}
                    value={form.deliverables}
                    onChange={e => setForm(f => ({ ...f, deliverables: e.target.value }))}
                    placeholder="e.g., 2 Reels, 1 Story set..."
                  />
                </div>

                {/* Due Date + Go Live Date + Max Selects */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Due Date</label>
                    <input
                      type="date"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.due_date}
                      onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Go Live Date</label>
                    <input
                      type="date"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.go_live_date}
                      onChange={e => setForm(f => ({ ...f, go_live_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Max Selects</label>
                    <input
                      type="number"
                      min={1}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.max_selects}
                      onChange={e => setForm(f => ({ ...f, max_selects: parseInt(e.target.value) || 2 }))}
                    />
                  </div>
                </div>

                {/* Campaign Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Type</label>
                  <div className="flex gap-2">
                    <button
                      className={`px-3 py-1.5 text-xs rounded-full border ${form.campaign_type === "mass" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200"}`}
                      onClick={() => setForm(f => ({ ...f, campaign_type: "mass" }))}
                    >
                      Mass Campaign
                    </button>
                    <button
                      className={`px-3 py-1.5 text-xs rounded-full border ${form.campaign_type === "individual" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200"}`}
                      onClick={() => setForm(f => ({ ...f, campaign_type: "individual" }))}
                    >
                      Individual
                    </button>
                  </div>
                </div>

                {/* Products */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Available Products</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={productQuery}
                      onChange={e => setProductQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && searchProducts()}
                      placeholder="Search Shopify products..."
                    />
                    <button
                      onClick={searchProducts}
                      disabled={searchingProducts}
                      className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
                    >
                      {searchingProducts ? "..." : "Search"}
                    </button>
                  </div>

                  {productResults.length > 0 && (
                    <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto mb-2">
                      {productResults.map(p => (
                        <div
                          key={p.product_id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0"
                          onClick={() => addProduct(p)}
                        >
                          {p.image && <img src={p.image} alt="" className="w-8 h-8 object-cover rounded" />}
                          <span className="text-xs flex-1">{p.title}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {availableProducts.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {availableProducts.map(p => (
                        <div key={p.variant_id} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-xs">
                          {p.image_url && <img src={p.image_url} alt="" className="w-5 h-5 object-cover rounded" />}
                          {p.product_title}{p.variant_title ? ` — ${p.variant_title}` : ""}
                          <button onClick={() => removeProduct(p.variant_id)} className="ml-1 text-gray-400 hover:text-gray-600">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assigned Creators (edit mode) */}
                {editingCampaign && existingAssignments.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Assigned Creators ({existingAssignments.length})
                    </label>
                    <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
                      {existingAssignments.map(a => (
                        <div key={a.id} className="flex items-center gap-3 px-3 py-2 border-b border-gray-50 last:border-b-0">
                          <div className="w-4 h-4 rounded border bg-gray-900 border-gray-900 text-white flex items-center justify-center text-xs">✓</div>
                          <div>
                            <div className="text-sm font-medium">{a.creator_name || a.influencer_name || "Unknown"}</div>
                            {a.influencer_handle && <div className="text-xs text-gray-400">@{a.influencer_handle}</div>}
                          </div>
                          <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(a.status)}`}>{a.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assign (more) Creators */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    {editingCampaign ? `Add More Creators (${selectedCreators.length} selected)` : `Assign to Creators (${selectedCreators.length} selected)`}
                  </label>
                  {!creatorsLoaded ? (
                    <div className="text-xs text-gray-400 py-2">Loading creators...</div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {creators.filter(c => !existingAssignments.some(a => a.creator_id === c.id)).map(c => {
                        const isSelected = selectedCreators.find(sc => sc.creator_id === c.id);
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 border-b border-gray-50 last:border-b-0 ${isSelected ? "bg-blue-50" : ""}`}
                            onClick={() => toggleCreator(c)}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${isSelected ? "bg-gray-900 border-gray-900 text-white" : "border-gray-300"}`}>
                              {isSelected && "✓"}
                            </div>
                            <div>
                              <div className="text-sm font-medium">{c.creator_name}</div>
                              {c.influencer && <div className="text-xs text-gray-400">@{c.influencer.instagram_handle}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                {editingCampaign ? (
                  <button
                    onClick={() => saveCampaign(false)}
                    disabled={saving || !form.title.trim()}
                    className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : (selectedCreators.length > 0 ? "Save & Send to New Creators" : "Save Changes")}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => saveCampaign(false)}
                      disabled={saving || !form.title.trim()}
                      className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      Save as Draft
                    </button>
                    <button
                      onClick={() => saveCampaign(true)}
                      disabled={saving || !form.title.trim() || selectedCreators.length === 0}
                      className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      {saving ? "Publishing..." : "Publish & Send"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {renderInvitationModal()}
      </div>
    </div>
  );
}
