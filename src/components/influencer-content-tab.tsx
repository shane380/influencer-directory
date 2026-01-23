"use client";

import { Camera } from "lucide-react";

export function InfluencerContentTab() {
  return (
    <div className="text-center py-12">
      <Camera className="h-12 w-12 mx-auto mb-4 text-gray-300" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        Content Tracking Coming Soon
      </h3>
      <p className="text-gray-500 max-w-sm mx-auto">
        Track posted content, engagement metrics, and content performance for this influencer.
      </p>
    </div>
  );
}
