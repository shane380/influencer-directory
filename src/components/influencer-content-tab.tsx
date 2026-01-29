"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { InfluencerContent } from "@/types/database";
import { Camera, Play, ExternalLink, ChevronDown, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import Image from "next/image";

interface InfluencerContentTabProps {
  influencerId: string;
}

interface GroupedContent {
  label: string;
  count: number;
  items: InfluencerContent[];
}

const typeColors: Record<string, string> = {
  story: "bg-purple-100 text-purple-800",
  post: "bg-blue-100 text-blue-800",
  reel: "bg-pink-100 text-pink-800",
};

function groupByMonth(items: InfluencerContent[]): GroupedContent[] {
  const groups = new Map<string, InfluencerContent[]>();

  for (const item of items) {
    const date = item.posted_at ? parseISO(item.posted_at) : parseISO(item.scraped_at);
    const key = format(date, "yyyy-MM");
    const existing = groups.get(key) || [];
    existing.push(item);
    groups.set(key, existing);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => {
      const date = parseISO(`${key}-01`);
      return {
        label: format(date, "MMMM yyyy"),
        count: items.length,
        items,
      };
    });
}

function isVideo(content: InfluencerContent): boolean {
  return (
    content.media_url.includes(".mp4") ||
    content.media_url.includes("video") ||
    content.type === "reel"
  );
}

export function InfluencerContentTab({ influencerId }: InfluencerContentTabProps) {
  const [content, setContent] = useState<InfluencerContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<InfluencerContent | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  const supabase = createClient();

  useEffect(() => {
    async function fetchContent() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("content")
          .select("*")
          .eq("influencer_id", influencerId)
          .order("posted_at", { ascending: false, nullsFirst: false });

        if (error) throw error;
        setContent(data || []);
      } catch (err) {
        console.error("Failed to fetch content:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchContent();
  }, [influencerId, supabase]);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading content...</div>
    );
  }

  if (content.length === 0) {
    return (
      <div className="text-center py-12">
        <Camera className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No content captured yet
        </h3>
        <p className="text-gray-500 max-w-sm mx-auto">
          Stories and posts tagging @nama will appear here automatically.
        </p>
      </div>
    );
  }

  const stories = content.filter((c) => c.type === "story").length;
  const posts = content.filter((c) => c.type === "post").length;
  const reels = content.filter((c) => c.type === "reel").length;
  const grouped = groupByMonth(content);

  const toggleMonth = (label: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Summary stats */}
      <div className="text-sm text-gray-600">
        {content.length} total
        {stories > 0 && <span> &middot; {stories} {stories === 1 ? "Story" : "Stories"}</span>}
        {posts > 0 && <span> &middot; {posts} {posts === 1 ? "Post" : "Posts"}</span>}
        {reels > 0 && <span> &middot; {reels} {reels === 1 ? "Reel" : "Reels"}</span>}
      </div>

      {/* Grouped by month */}
      {grouped.map((group) => {
        const isCollapsed = collapsedMonths.has(group.label);
        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => toggleMonth(group.label)}
              className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 mb-2"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {group.label} ({group.count})
            </button>

            {!isCollapsed && (
              <div className="grid grid-cols-4 gap-2">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedContent(item)}
                    className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group cursor-pointer border hover:border-gray-400 transition-colors"
                    title={
                      item.posted_at
                        ? format(parseISO(item.posted_at), "MMM d, yyyy h:mm a")
                        : "Date unknown"
                    }
                  >
                    {isVideo(item) && item.thumbnail_url ? (
                      <Image
                        src={item.thumbnail_url}
                        alt=""
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <Image
                        src={item.media_url}
                        alt=""
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    )}

                    {/* Video play icon overlay */}
                    {isVideo(item) && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-black/50 rounded-full p-2">
                          <Play className="h-4 w-4 text-white fill-white" />
                        </div>
                      </div>
                    )}

                    {/* Type badge */}
                    <div className="absolute top-1 left-1">
                      <Badge className={`text-[10px] px-1 py-0 ${typeColors[item.type] || typeColors.story}`}>
                        {item.type}
                      </Badge>
                    </div>

                    {/* Campaign tag */}
                    {item.campaign_id && (
                      <div className="absolute bottom-1 right-1">
                        <div className="w-2 h-2 rounded-full bg-green-500" title="Linked to campaign" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Lightbox Modal */}
      <Dialog
        open={!!selectedContent}
        onOpenChange={() => setSelectedContent(null)}
      >
        <DialogContent className="max-w-2xl p-0 overflow-hidden" onClose={() => setSelectedContent(null)}>
          {selectedContent && (
            <div>
              {/* Media */}
              <div className="relative bg-black flex items-center justify-center min-h-[300px] max-h-[500px]">
                {isVideo(selectedContent) ? (
                  <video
                    src={selectedContent.media_url}
                    controls
                    autoPlay
                    className="max-h-[500px] max-w-full"
                  />
                ) : (
                  <Image
                    src={selectedContent.media_url}
                    alt=""
                    width={600}
                    height={500}
                    className="object-contain max-h-[500px] w-auto"
                    unoptimized
                  />
                )}
                <button
                  type="button"
                  onClick={() => setSelectedContent(null)}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Details */}
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={typeColors[selectedContent.type] || typeColors.story}>
                    {selectedContent.type}
                  </Badge>
                  {selectedContent.posted_at && (
                    <span className="text-sm text-gray-500">
                      {format(parseISO(selectedContent.posted_at), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  )}
                </div>

                {selectedContent.caption && (
                  <p className="text-sm text-gray-700">{selectedContent.caption}</p>
                )}

                {selectedContent.original_url && (
                  <a
                    href={selectedContent.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                  >
                    View on Instagram
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
