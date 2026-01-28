"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Influencer, CampaignInfluencer, ApprovalStatus, Profile } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Check, X, Clock, User } from "lucide-react";
import Image from "next/image";

interface ApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  influencer: Influencer;
  campaignInfluencer: CampaignInfluencer;
  profiles?: Profile[];
}

const approvalStatusColors: Record<ApprovalStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
};

const approvalStatusLabels: Record<ApprovalStatus, string> = {
  pending: "Pending Approval",
  approved: "Approved",
  declined: "Declined",
};

export function ApprovalDialog({
  open,
  onClose,
  onSave,
  influencer,
  campaignInfluencer,
  profiles = [],
}: ApprovalDialogProps) {
  const [note, setNote] = useState(campaignInfluencer.approval_note || "");
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getApproverName = (userId: string | null) => {
    if (!userId) return null;
    const profile = profiles.find(p => p.id === userId);
    return profile?.display_name || "Unknown";
  };

  const handleApprove = async () => {
    await updateApprovalStatus("approved");
  };

  const handleDecline = async () => {
    await updateApprovalStatus("declined");
  };

  const handleRemoveApproval = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await (supabase.from("campaign_influencers") as any)
        .update({
          approval_status: null,
          approval_note: null,
          approved_at: null,
          approved_by: null,
        })
        .eq("id", campaignInfluencer.id);

      if (error) throw error;

      onSave();
      onClose();
    } catch (err) {
      console.error("Error removing approval requirement:", err);
    } finally {
      setSaving(false);
    }
  };

  const updateApprovalStatus = async (status: ApprovalStatus) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await (supabase.from("campaign_influencers") as any)
        .update({
          approval_status: status,
          approval_note: note || null,
          approved_at: new Date().toISOString(),
          approved_by: user?.id || null,
        })
        .eq("id", campaignInfluencer.id);

      if (error) throw error;

      onSave();
      onClose();
    } catch (err) {
      console.error("Error updating approval status:", err);
    } finally {
      setSaving(false);
    }
  };

  const currentStatus = campaignInfluencer.approval_status;
  const isPending = currentStatus === "pending";
  const isDecided = currentStatus === "approved" || currentStatus === "declined";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl" style={{ width: "700px" }} onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Approval Review</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Influencer Info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            {influencer.profile_photo_url ? (
              <Image
                src={influencer.profile_photo_url}
                alt={influencer.name}
                width={48}
                height={48}
                className="rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-gray-500 font-medium">
                  {influencer.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1">
              <p className="font-medium">{influencer.name}</p>
              <p className="text-sm text-gray-500">@{influencer.instagram_handle}</p>
              <p className="text-xs text-gray-400">{formatNumber(influencer.follower_count)} followers</p>
            </div>
            {currentStatus && (
              <Badge className={approvalStatusColors[currentStatus]}>
                {approvalStatusLabels[currentStatus]}
              </Badge>
            )}
          </div>

          {/* Previous Decision Info */}
          {isDecided && campaignInfluencer.approved_at && (
            <div className="text-sm text-gray-500 space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{formatDate(campaignInfluencer.approved_at)}</span>
              </div>
              {campaignInfluencer.approved_by && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>by {getApproverName(campaignInfluencer.approved_by)}</span>
                </div>
              )}
              {campaignInfluencer.approval_note && (
                <div className="mt-2 p-2 bg-gray-100 rounded text-gray-700">
                  {campaignInfluencer.approval_note}
                </div>
              )}
            </div>
          )}

          {/* Note Input - shown when pending or to update decision */}
          {(isPending || isDecided) && (
            <div className="space-y-2">
              <Label htmlFor="approval-note">Note (optional)</Label>
              <Textarea
                id="approval-note"
                placeholder="Add a note about this decision..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/* Remove Approval Requirement */}
          <Button
            variant="ghost"
            onClick={handleRemoveApproval}
            disabled={saving}
            className="text-gray-500 hover:text-gray-700 sm:mr-auto"
          >
            Remove Approval
          </Button>

          {/* Decision Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={saving}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="h-4 w-4 mr-1" />
              Decline
            </Button>
            <Button
              onClick={handleApprove}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Check className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
