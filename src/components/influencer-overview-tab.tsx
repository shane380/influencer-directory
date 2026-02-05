"use client";

import { Influencer, InfluencerInsert, InfluencerRates, InfluencerMediaKit, PartnershipType, RelationshipStatus } from "@/types/database";
import { InfluencerRatesSection } from "@/components/influencer-rates-section";
import { MediaKitUpload } from "@/components/media-kit-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Mail, Phone, MapPin, User, Share2 } from "lucide-react";

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
  return (
    <div className="space-y-5 pt-4">
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

      {/* Contact Section */}
      <Collapsible defaultOpen={true}>
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

      {/* Sizes */}
      <div className="pt-4 border-t">
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
      </div>

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

      {/* Partnership & Status */}
      <div className="pt-4 border-t">
        <div className="grid grid-cols-2 gap-4">
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
      </div>

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
