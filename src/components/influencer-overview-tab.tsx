"use client";

import { useState, useEffect } from "react";
import { Influencer, InfluencerInsert, InfluencerRates, InfluencerMediaKit, PartnershipType, RelationshipStatus } from "@/types/database";
import { InfluencerRatesSection } from "@/components/influencer-rates-section";
import { MediaKitUpload } from "@/components/media-kit-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Mail, Phone, MapPin, User, Share2, Ruler, ArrowRight } from "lucide-react";

interface CodeChangeRequest {
  id: string;
  creator_id: string;
  influencer_id: string;
  current_code: string;
  requested_code: string;
  status: string;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface InfluencerOverviewTabProps {
  influencer: Influencer | null;
  formData: InfluencerInsert;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  rates: InfluencerRates | null;
  onRatesChange: (rates: Partial<InfluencerRates>) => void;
  mediaKits: InfluencerMediaKit[];
  onMediaKitUpload: (mediaKit: InfluencerMediaKit) => void;
  onMediaKitDelete: (mediaKitId: string) => void;
}

export function InfluencerOverviewTab({
  influencer,
  formData,
  onChange,
  rates,
  onRatesChange,
  mediaKits,
  onMediaKitUpload,
  onMediaKitDelete,
}: InfluencerOverviewTabProps) {
  const [codeRequest, setCodeRequest] = useState<CodeChangeRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!influencer?.id) {
      setCodeRequest(null);
      return;
    }
    async function fetchCodeRequest() {
      try {
        const res = await fetch(`/api/admin/code-change-requests?influencer_id=${influencer!.id}`);
        const data = await res.json();
        if (data.requests && data.requests.length > 0) {
          setCodeRequest(data.requests[0]);
        } else {
          setCodeRequest(null);
        }
      } catch {}
    }
    fetchCodeRequest();
  }, [influencer?.id]);

  async function handleCodeAction(action: "approve" | "reject") {
    if (!codeRequest) return;
    if (action === "reject" && !rejectReason.trim()) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/admin/code-change-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: codeRequest.id,
          action,
          admin_notes: action === "reject" ? rejectReason : undefined,
          reviewed_by: "Admin",
        }),
      });
      if (res.ok) {
        setCodeRequest(null);
        setShowRejectInput(false);
        setRejectReason("");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to process request");
      }
    } catch (err) {
      console.error("Code change action error:", err);
    }
    setProcessing(false);
  }

  return (
    <div className="space-y-5 pt-4">
      {/* Code Change Request Alert */}
      {codeRequest && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="warning" className="text-[10px]">Code Change Requested</Badge>
            <span className="text-xs text-gray-400">
              {new Date(codeRequest.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <code className="bg-white px-2 py-0.5 rounded border text-xs font-mono">
              {codeRequest.current_code.toUpperCase()}
            </code>
            <ArrowRight className="h-3 w-3 text-gray-400" />
            <code className="bg-white px-2 py-0.5 rounded border text-xs font-mono font-bold">
              {codeRequest.requested_code}
            </code>
          </div>
          {showRejectInput ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs"
                placeholder="Rejection reason (required)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                autoFocus
              />
              <Button
                size="sm"
                variant="destructive"
                className="h-6 text-[10px] px-2"
                disabled={processing || !rejectReason.trim()}
                onClick={() => handleCodeAction("reject")}
              >
                Confirm Reject
              </Button>
              <button
                className="text-[10px] text-gray-400 hover:text-gray-600"
                onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <Button
                size="sm"
                variant="default"
                className="h-6 text-[10px] px-3"
                disabled={processing}
                onClick={() => handleCodeAction("approve")}
              >
                {processing ? "Processing..." : "Approve"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-3"
                disabled={processing}
                onClick={() => setShowRejectInput(true)}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Name & Handle - editable */}
      <div className="grid grid-cols-2 gap-4 pb-4 border-b">
        <div>
          <Label htmlFor="name" className="text-xs font-medium">Name</Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={onChange}
            required
          />
        </div>
        <div>
          <Label htmlFor="instagram_handle" className="text-xs font-medium">Instagram Handle</Label>
          <Input
            id="instagram_handle"
            name="instagram_handle"
            value={formData.instagram_handle}
            onChange={onChange}
            required
          />
        </div>
      </div>

      {/* Partnership & Status */}
      <div className="grid grid-cols-2 gap-4 pb-4 border-b">
        <div>
          <Label htmlFor="partnership_type" className="text-xs font-medium">Partnership Type</Label>
          <Select
            id="partnership_type"
            name="partnership_type"
            value={formData.partnership_type}
            onChange={onChange}
          >
            <option value="unassigned">Unassigned</option>
            <option value="gifted_no_ask">Gifted No Ask</option>
            <option value="gifted_soft_ask">Gifted Soft Ask</option>
            <option value="gifted_deliverable_ask">Gifted Deliverable Ask</option>
            <option value="gifted_recurring">Gifted Recurring</option>
            <option value="paid">Paid</option>
            <option value="whitelisting">Whitelisting</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="relationship_status" className="text-xs font-medium">Status</Label>
          <Select
            id="relationship_status"
            name="relationship_status"
            value={formData.relationship_status}
            onChange={onChange}
          >
            <option value="prospect">Prospect</option>
            <option value="contacted">Contacted</option>
            <option value="followed_up">Followed Up</option>
            <option value="lead_dead">Lead Dead</option>
            <option value="creator_wants_paid">Creator Wants Paid</option>
            <option value="order_placed">Order Placed</option>
            <option value="order_delivered">Order Delivered</option>
            <option value="order_follow_up_sent">Order Follow Up Sent</option>
            <option value="order_follow_up_two_sent">Order Follow Up Two Sent</option>
            <option value="posted">Posted</option>
          </Select>
        </div>
      </div>

      {/* Contact Section */}
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="py-2">
          <Mail className="h-4 w-4 text-gray-400" />
          Contact Information
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 pb-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email" className="text-xs font-medium">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email || ""}
                onChange={onChange}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <Label htmlFor="phone" className="text-xs font-medium">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone || ""}
                onChange={onChange}
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="mailing_address" className="text-xs font-medium">Mailing Address</Label>
            <Textarea
              id="mailing_address"
              name="mailing_address"
              value={formData.mailing_address || ""}
              onChange={onChange}
              rows={2}
              placeholder="Street, City, State, ZIP"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Sizing */}
      <Collapsible defaultOpen={false} className="border-t pt-4">
        <CollapsibleTrigger className="py-2">
          <Ruler className="h-4 w-4 text-gray-400" />
          Sizing
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 pb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="top_size" className="text-xs font-medium">Top Size</Label>
              <Select
                id="top_size"
                name="top_size"
                value={formData.top_size || ""}
                onChange={onChange}
              >
                <option value="">Select size...</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="bottoms_size" className="text-xs font-medium">Bottoms Size</Label>
              <Select
                id="bottoms_size"
                name="bottoms_size"
                value={formData.bottoms_size || ""}
                onChange={onChange}
              >
                <option value="">Select size...</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Agent Section */}
      <Collapsible defaultOpen={false} className="border-t pt-4">
        <CollapsibleTrigger className="py-2">
          <User className="h-4 w-4 text-gray-400" />
          Agent Contact
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 pb-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="agent_name" className="text-xs font-medium">Name</Label>
              <Input
                id="agent_name"
                name="agent_name"
                value={formData.agent_name || ""}
                onChange={onChange}
                placeholder="Agent name"
              />
            </div>
            <div>
              <Label htmlFor="agent_email" className="text-xs font-medium">Email</Label>
              <Input
                id="agent_email"
                name="agent_email"
                type="email"
                value={formData.agent_email || ""}
                onChange={onChange}
                placeholder="agent@agency.com"
              />
            </div>
            <div>
              <Label htmlFor="agent_phone" className="text-xs font-medium">Phone</Label>
              <Input
                id="agent_phone"
                name="agent_phone"
                type="tel"
                value={formData.agent_phone || ""}
                onChange={onChange}
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Whitelisting */}
      <div className="pt-4 border-t">
        <div className="flex items-center gap-2 mb-3">
          <Share2 className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Whitelisting</span>
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="whitelisting_enabled"
              checked={formData.whitelisting_enabled || false}
              onChange={onChange}
              className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700">Available for Meta ad whitelisting</span>
          </label>
          {formData.whitelisting_enabled && (
            <div className="ml-6">
              <Label htmlFor="whitelisting_type" className="text-xs font-medium">Whitelisting Type</Label>
              <Select
                id="whitelisting_type"
                name="whitelisting_type"
                value={formData.whitelisting_type || ""}
                onChange={onChange}
              >
                <option value="">Select type...</option>
                <option value="paid">Paid</option>
                <option value="gifted">Gifted</option>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Rate Card - Only for Paid partnership */}
      {formData.partnership_type === "paid" && (
        <div className="border-t pt-4">
          <InfluencerRatesSection
            rates={rates}
            onChange={onRatesChange}
          />
        </div>
      )}

      {/* Media Kit Upload - Only for Paid partnership and existing influencers */}
      {formData.partnership_type === "paid" && influencer && (
        <div className="pt-2">
          <MediaKitUpload
            influencerId={influencer.id}
            mediaKits={mediaKits}
            onUpload={onMediaKitUpload}
            onDelete={onMediaKitDelete}
          />
        </div>
      )}

      {/* Last Contacted */}
      <div className="pt-4 border-t">
        <div>
          <Label htmlFor="last_contacted_at" className="text-xs font-medium">Last Contacted</Label>
          <Input
            id="last_contacted_at"
            name="last_contacted_at"
            type="date"
            value={formData.last_contacted_at || ""}
            onChange={onChange}
            className="w-auto"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="pt-4 border-t">
        <div>
          <Label htmlFor="notes" className="text-xs font-medium">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            value={formData.notes || ""}
            onChange={onChange}
            rows={3}
            placeholder="Add any relevant notes about this influencer..."
          />
        </div>
      </div>
    </div>
  );
}
