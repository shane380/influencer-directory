"use client";

import { Influencer, InfluencerInsert, Profile, PartnershipType, RelationshipStatus } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Search, Loader2 } from "lucide-react";
import Image from "next/image";

interface InfluencerProfileHeaderProps {
  influencer: Influencer | null;
  formData: InfluencerInsert;
  profiles: Profile[];
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onInstagramLookup?: () => void;
  lookingUp?: boolean;
  searchHandle?: string;
  onSearchHandleChange?: (value: string) => void;
  contentCount?: number;
}

const statusColors: Record<RelationshipStatus, string> = {
  prospect: "bg-gray-100 text-gray-800",
  contacted: "bg-blue-100 text-blue-800",
  followed_up: "bg-yellow-100 text-yellow-800",
  lead_dead: "bg-red-100 text-red-800",
  creator_wants_paid: "bg-pink-100 text-pink-800",
  order_placed: "bg-orange-100 text-orange-800",
  order_delivered: "bg-teal-100 text-teal-800",
  order_follow_up_sent: "bg-indigo-100 text-indigo-800",
  order_follow_up_two_sent: "bg-purple-100 text-purple-800",
  posted: "bg-green-100 text-green-800",
};

const statusLabels: Record<RelationshipStatus, string> = {
  prospect: "Prospect",
  contacted: "Contacted",
  followed_up: "Followed Up",
  lead_dead: "Lead Dead",
  creator_wants_paid: "Creator Wants Paid",
  order_placed: "Order Placed",
  order_delivered: "Order Delivered",
  order_follow_up_sent: "Order Follow Up Sent",
  order_follow_up_two_sent: "Order Follow Up Two Sent",
  posted: "Posted",
};

const partnershipTypeLabels: Record<PartnershipType, string> = {
  unassigned: "Unassigned",
  gifted_no_ask: "Gifted No Ask",
  gifted_soft_ask: "Gifted Soft Ask",
  gifted_deliverable_ask: "Gifted Deliverable Ask",
  gifted_recurring: "Gifted Recurring",
  paid: "Paid",
};

const partnershipTypeColors: Record<PartnershipType, string> = {
  unassigned: "bg-red-100 text-red-800",
  gifted_no_ask: "bg-gray-100 text-gray-800",
  gifted_soft_ask: "bg-blue-100 text-blue-800",
  gifted_deliverable_ask: "bg-yellow-100 text-yellow-800",
  gifted_recurring: "bg-green-100 text-green-800",
  paid: "bg-purple-100 text-purple-800",
};

function formatFollowerCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

export function InfluencerProfileHeader({
  influencer,
  formData,
  profiles,
  onChange,
  onInstagramLookup,
  lookingUp,
  searchHandle,
  onSearchHandleChange,
  contentCount,
}: InfluencerProfileHeaderProps) {
  // For new influencers, show a more compact input form
  if (!influencer) {
    return (
      <div className="space-y-4">
        {/* Instagram Lookup */}
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <Label className="text-sm font-medium">Quick Add from Instagram</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">@</span>
              <Input
                placeholder="instagram_handle"
                value={searchHandle || ""}
                onChange={(e) => onSearchHandleChange?.(e.target.value.replace("@", ""))}
                className="pl-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onInstagramLookup?.();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              onClick={onInstagramLookup}
              disabled={lookingUp || !searchHandle?.trim()}
            >
              {lookingUp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2">{lookingUp ? "Looking up..." : "Lookup"}</span>
            </Button>
          </div>
        </div>

        {/* Basic form for new influencer */}
        <div className="flex items-start gap-4">
          <div className="relative flex-shrink-0">
            {formData.profile_photo_url ? (
              <Image
                src={formData.profile_photo_url}
                alt="Profile"
                width={80}
                height={80}
                className="rounded-full object-cover w-20 h-20"
                unoptimized
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-gray-500 text-2xl font-medium">
                  {formData.name?.charAt(0)?.toUpperCase() || "?"}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name" className="text-xs">Name *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={onChange}
                required
                placeholder="Full name"
              />
            </div>
            <div>
              <Label htmlFor="instagram_handle" className="text-xs">Instagram *</Label>
              <Input
                id="instagram_handle"
                name="instagram_handle"
                value={formData.instagram_handle}
                onChange={onChange}
                placeholder="username"
                required
              />
            </div>
            <div>
              <Label htmlFor="follower_count" className="text-xs">Followers *</Label>
              <Input
                id="follower_count"
                name="follower_count"
                type="number"
                value={formData.follower_count}
                onChange={onChange}
                min={0}
                required
              />
            </div>
            <div>
              <Label htmlFor="assigned_to" className="text-xs">Assigned To</Label>
              <Select
                id="assigned_to"
                name="assigned_to"
                value={formData.assigned_to || ""}
                onChange={onChange}
              >
                <option value="">Unassigned</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.display_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For existing influencers, show the profile header with stats
  return (
    <div className="flex items-start gap-5">
      {/* Profile Photo - 96px */}
      <div className="relative flex-shrink-0 mt-1">
        {formData.profile_photo_url ? (
          <Image
            src={formData.profile_photo_url}
            alt="Profile"
            width={96}
            height={96}
            className="rounded-full object-cover"
            style={{ width: 96, height: 96 }}
            unoptimized
          />
        ) : (
          <div className="rounded-full bg-gray-200 flex items-center justify-center" style={{ width: 96, height: 96 }}>
            <span className="text-gray-500 text-3xl font-medium">
              {formData.name?.charAt(0)?.toUpperCase() || "?"}
            </span>
          </div>
        )}
      </div>

      {/* Name & Stats */}
      <div className="flex-1 min-w-0 space-y-0.5">
        {/* Name - large and bold, aligned with top of photo */}
        <h2 className="text-xl font-bold text-gray-900 truncate leading-tight">
          {formData.name}
        </h2>

        {/* Handle - smaller, gray, below name */}
        {formData.instagram_handle && (
          <a
            href={`https://instagram.com/${formData.instagram_handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1"
          >
            @{formData.instagram_handle}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {/* Stats Row - followers and status */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-sm text-gray-600">
            {formatFollowerCount(formData.follower_count)} followers
          </span>
          {contentCount !== undefined && contentCount > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-600">
                {contentCount} content
              </span>
            </>
          )}
          <span className="text-gray-300">·</span>
          <Badge className={statusColors[formData.relationship_status as RelationshipStatus]}>
            {statusLabels[formData.relationship_status as RelationshipStatus]}
          </Badge>
        </div>

        {/* Partnership & Assignment - with more spacing */}
        <div className="flex items-center gap-2 pt-2">
          <Badge className={partnershipTypeColors[formData.partnership_type as PartnershipType]}>
            {partnershipTypeLabels[formData.partnership_type as PartnershipType]}
          </Badge>
          <span className="text-gray-300">·</span>
          <span className="text-sm text-gray-500">Assigned:</span>
          <Select
            name="assigned_to"
            value={formData.assigned_to || ""}
            onChange={onChange}
            className="h-7 text-xs py-0 px-2"
          >
            <option value="">Unassigned</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
