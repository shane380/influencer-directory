"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { InfluencerContent, ContentType } from "@/types/database";
import {
  Camera,
  Play,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  X,
  Upload,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import Image from "next/image";

interface InfluencerContentTabProps {
  influencerId: string;
  influencerName: string;
  instagramHandle: string;
}

interface GroupedContent {
  label: string;
  count: number;
  items: InfluencerContent[];
}

interface CampaignOption {
  id: string;
  name: string;
}

interface DealOption {
  id: string;
  campaign_id: string;
  campaign_name: string;
  deliverables: string;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

const typeColors: Record<string, string> = {
  story: "bg-purple-100 text-purple-800",
  post: "bg-blue-100 text-blue-800",
  reel: "bg-pink-100 text-pink-800",
  content: "bg-gray-100 text-gray-800",
};

function groupByMonth(items: InfluencerContent[]): GroupedContent[] {
  const groups = new Map<string, InfluencerContent[]>();

  for (const item of items) {
    const date = item.posted_at
      ? parseISO(item.posted_at)
      : parseISO(item.uploaded_at || item.scraped_at);
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
  const url = content.media_url || "";
  const name = content.file_name || "";
  return (
    url.includes(".mp4") ||
    url.includes("video") ||
    name.endsWith(".mp4") ||
    name.endsWith(".mov") ||
    content.type === "reel"
  );
}

export function InfluencerContentTab({
  influencerId,
  influencerName,
  instagramHandle,
}: InfluencerContentTabProps) {
  const [content, setContent] = useState<InfluencerContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] =
    useState<InfluencerContent | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(
    new Set()
  );
  const [folderUrl, setFolderUrl] = useState<string | null>(null);

  // Upload state
  const [contentType, setContentType] = useState<ContentType>("post");
  const [association, setAssociation] = useState("none");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<"single" | "separate">("single");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  // Fetch content
  const fetchContent = useCallback(async () => {
    const { data, error } = await supabase
      .from("content")
      .select("*")
      .eq("influencer_id", influencerId)
      .order("uploaded_at", { ascending: false, nullsFirst: false });

    if (!error && data) setContent(data);
  }, [influencerId, supabase]);

  // Fetch campaigns & deals for selector
  const fetchAssociations = useCallback(async () => {
    const [campRes, dealRes] = await Promise.all([
      supabase
        .from("campaign_influencers")
        .select("campaign_id, campaign:campaigns(id, name)")
        .eq("influencer_id", influencerId),
      supabase
        .from("campaign_deals")
        .select("id, campaign_id, campaign:campaigns(id, name), deliverables")
        .eq("influencer_id", influencerId),
    ]);

    if (campRes.data) {
      const unique = new Map<string, CampaignOption>();
      for (const row of campRes.data as any[]) {
        const c = row.campaign as { id: string; name: string } | null;
        if (c) unique.set(c.id, { id: c.id, name: c.name });
      }
      setCampaigns(Array.from(unique.values()));
    }

    if (dealRes.data) {
      setDeals(
        dealRes.data.map((d: any) => ({
          id: d.id,
          campaign_id: d.campaign_id,
          campaign_name: (d.campaign as any)?.name || "Unknown",
          deliverables: (d.deliverables || [])
            .map((del: any) => del.description)
            .filter(Boolean)
            .join(", "),
        }))
      );
    }
  }, [influencerId, supabase]);

  // Fetch folder URL
  const fetchFolderUrl = useCallback(async () => {
    const { data } = await supabase
      .from("influencers")
      .select("*")
      .eq("id", influencerId)
      .single();

    const inf = data as any;
    if (inf?.google_drive_folder_id) {
      setFolderUrl(
        `https://drive.google.com/drive/folders/${inf.google_drive_folder_id}`
      );
    }
  }, [influencerId, supabase]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchContent(), fetchAssociations(), fetchFolderUrl()]).finally(
      () => setLoading(false)
    );
  }, [fetchContent, fetchAssociations, fetchFolderUrl]);

  // Parse association value → campaign_id / deal_id
  function getAssociationIds(): {
    campaign_id: string | null;
    deal_id: string | null;
  } {
    if (association === "none") return { campaign_id: null, deal_id: null };
    if (association.startsWith("campaign:")) {
      return { campaign_id: association.replace("campaign:", ""), deal_id: null };
    }
    if (association.startsWith("deal:")) {
      const dealId = association.replace("deal:", "");
      const deal = deals.find((d) => d.id === dealId);
      return {
        campaign_id: deal?.campaign_id || null,
        deal_id: dealId,
      };
    }
    return { campaign_id: null, deal_id: null };
  }

  // Upload a batch of files as ONE content entry
  async function uploadBatch(fileArray: File[]) {
    const { campaign_id, deal_id } = getAssociationIds();

    const formData = new FormData();
    for (const file of fileArray) {
      formData.append("file", file);
    }
    formData.append("influencer_id", influencerId);
    formData.append("type", contentType);
    if (campaign_id) formData.append("campaign_id", campaign_id);
    if (deal_id) formData.append("deal_id", deal_id);

    const res = await fetch("/api/drive/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Upload failed");
    }

    const data = await res.json();
    if (data.folder_url && !folderUrl) {
      setFolderUrl(data.folder_url);
    }
  }

  // Upload files — respects uploadMode
  async function handleUpload(files: FileList | File[]) {
    const fileArray = Array.from(files);
    const newUploading: UploadingFile[] = fileArray.map((f) => ({
      file: f,
      progress: 0,
      status: "uploading" as const,
    }));
    setUploadingFiles((prev) => [...prev, ...newUploading]);

    if (uploadMode === "single" || fileArray.length === 1) {
      // All files → one content entry
      try {
        await uploadBatch(fileArray);
        setUploadingFiles((prev) =>
          prev.map((u) =>
            fileArray.includes(u.file)
              ? { ...u, status: "done" as const, progress: 100 }
              : u
          )
        );
      } catch (err: any) {
        setUploadingFiles((prev) =>
          prev.map((u) =>
            fileArray.includes(u.file)
              ? { ...u, status: "error" as const, error: err.message }
              : u
          )
        );
      }
    } else {
      // Each file → separate content entry
      for (const file of fileArray) {
        try {
          await uploadBatch([file]);
          setUploadingFiles((prev) =>
            prev.map((u) =>
              u.file === file
                ? { ...u, status: "done" as const, progress: 100 }
                : u
            )
          );
        } catch (err: any) {
          setUploadingFiles((prev) =>
            prev.map((u) =>
              u.file === file
                ? { ...u, status: "error" as const, error: err.message }
                : u
            )
          );
        }
      }
    }

    // Refresh content and clear completed uploads
    await fetchContent();
    setTimeout(() => {
      setUploadingFiles((prev) => prev.filter((u) => u.status === "uploading"));
    }, 2000);
  }

  // Delete content
  async function handleDelete(contentId: string) {
    if (deleting) return;
    setDeleting(contentId);
    try {
      const res = await fetch("/api/drive/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_id: contentId }),
      });
      if (res.ok) {
        setContent((prev) => prev.filter((c) => c.id !== contentId));
        if (selectedContent?.id === contentId) setSelectedContent(null);
      }
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(null);
    }
  }

  // Drag and drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }

  // Get label for association
  function getAssociationLabel(item: InfluencerContent): string | null {
    if (item.deal_id) {
      const deal = deals.find((d) => d.id === item.deal_id);
      if (deal) return deal.campaign_name;
    }
    if (item.campaign_id) {
      const camp = campaigns.find((c) => c.id === item.campaign_id);
      if (camp) return camp.name;
    }
    return null;
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading content...</div>
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
      {/* Drive folder link */}
      {folderUrl && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <FolderOpen className="h-3.5 w-3.5" />
          <a
            href={folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
          >
            Open in Google Drive
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Upload controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={contentType}
          onChange={(e) => setContentType(e.target.value as ContentType)}
          className="h-8 text-xs w-24"
        >
          <option value="story">Story</option>
          <option value="post">Post</option>
          <option value="reel">Reel</option>
          <option value="content">Content</option>
        </Select>

        <Select
          value={association}
          onChange={(e) => setAssociation(e.target.value)}
          className="h-8 text-xs w-48"
          truncate
        >
          <option value="none">No association</option>
          {campaigns.length > 0 && (
            <optgroup label="Campaigns">
              {campaigns.map((c) => (
                <option key={c.id} value={`campaign:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {deals.length > 0 && (
            <optgroup label="Deals">
              {deals.map((d) => (
                <option key={d.id} value={`deal:${d.id}`}>
                  {d.campaign_name}
                  {d.deliverables ? ` — ${d.deliverables}` : ""}
                </option>
              ))}
            </optgroup>
          )}
        </Select>

        <Select
          value={uploadMode}
          onChange={(e) => setUploadMode(e.target.value as "single" | "separate")}
          className="h-8 text-xs w-36"
        >
          <option value="single">Single post</option>
          <option value="separate">Separate posts</option>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3 w-3 mr-1" />
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleUpload(e.target.files);
              e.target.value = "";
            }
          }}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-500">
          Drag and drop images or videos here
        </p>
        <p className="text-xs text-gray-400 mt-1">
          JPG, PNG, WebP, MP4, MOV
        </p>
      </div>

      {/* Upload progress */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-1">
          {uploadingFiles.map((u, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="truncate flex-1 text-gray-700">
                {u.file.name}
              </span>
              {u.status === "uploading" && (
                <span className="text-blue-600">Uploading...</span>
              )}
              {u.status === "done" && (
                <span className="text-green-600">Done</span>
              )}
              {u.status === "error" && (
                <span className="text-red-600">{u.error}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary stats */}
      {content.length > 0 && (
        <div className="text-sm text-gray-600">
          {content.length} total
          {stories > 0 && (
            <span>
              {" "}
              &middot; {stories} {stories === 1 ? "Story" : "Stories"}
            </span>
          )}
          {posts > 0 && (
            <span>
              {" "}
              &middot; {posts} {posts === 1 ? "Post" : "Posts"}
            </span>
          )}
          {reels > 0 && (
            <span>
              {" "}
              &middot; {reels} {reels === 1 ? "Reel" : "Reels"}
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {content.length === 0 && uploadingFiles.length === 0 && (
        <div className="text-center py-6">
          <Camera className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">
            No content yet. Upload files above to get started.
          </p>
        </div>
      )}

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
                {group.items.map((item) => {
                  const assocLabel = getAssociationLabel(item);
                  return (
                    <div
                      key={item.id}
                      className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group cursor-pointer border hover:border-gray-400 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedContent(item)}
                        className="absolute inset-0"
                        title={
                          item.file_name ||
                          (item.posted_at
                            ? format(
                                parseISO(item.posted_at),
                                "MMM d, yyyy h:mm a"
                              )
                            : "Date unknown")
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
                        ) : item.thumbnail_url ? (
                          <Image
                            src={item.thumbnail_url}
                            alt=""
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : item.google_drive_file_id ? (
                          <div className="flex items-center justify-center h-full text-gray-400">
                            <Camera className="h-8 w-8" />
                          </div>
                        ) : (
                          <Image
                            src={item.media_url}
                            alt=""
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        )}
                      </button>

                      {/* Video play icon overlay */}
                      {isVideo(item) && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="bg-black/50 rounded-full p-2">
                            <Play className="h-4 w-4 text-white fill-white" />
                          </div>
                        </div>
                      )}

                      {/* Type badge */}
                      <div className="absolute top-1 left-1 pointer-events-none">
                        <Badge
                          className={`text-[10px] px-1 py-0 ${
                            typeColors[item.type] || typeColors.story
                          }`}
                        >
                          {item.type}
                        </Badge>
                      </div>

                      {/* Campaign/deal badge */}
                      {assocLabel && (
                        <div className="absolute bottom-1 left-1 right-6 pointer-events-none">
                          <Badge className="bg-green-100 text-green-800 text-[9px] px-1 py-0 truncate max-w-full block">
                            {assocLabel}
                          </Badge>
                        </div>
                      )}

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            confirm("Delete this content? This cannot be undone.")
                          ) {
                            handleDelete(item.id);
                          }
                        }}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-red-600 text-white rounded-full p-1"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
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
        <DialogContent
          className="max-w-2xl p-0 overflow-hidden"
          onClose={() => setSelectedContent(null)}
        >
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
                ) : selectedContent.google_drive_file_id &&
                  !selectedContent.thumbnail_url ? (
                  <div className="flex items-center justify-center h-[300px] text-gray-400">
                    <Camera className="h-16 w-16" />
                  </div>
                ) : (
                  <Image
                    src={selectedContent.thumbnail_url || selectedContent.media_url}
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
                  <Badge
                    className={
                      typeColors[selectedContent.type] || typeColors.story
                    }
                  >
                    {selectedContent.type}
                  </Badge>
                  {selectedContent.file_name && (
                    <span className="text-sm text-gray-500 truncate">
                      {selectedContent.file_name}
                    </span>
                  )}
                  {selectedContent.posted_at && (
                    <span className="text-sm text-gray-500">
                      {format(
                        parseISO(selectedContent.posted_at),
                        "MMM d, yyyy 'at' h:mm a"
                      )}
                    </span>
                  )}
                </div>

                {selectedContent.caption && (
                  <p className="text-sm text-gray-700">
                    {selectedContent.caption}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  {selectedContent.google_drive_file_id && (
                    <a
                      href={selectedContent.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                    >
                      Open in Google Drive
                      <ExternalLink className="h-3 w-3" />
                    </a>
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

                {(() => {
                  const label = getAssociationLabel(selectedContent);
                  return label ? (
                    <Badge className="bg-green-100 text-green-800 text-xs">
                      {label}
                    </Badge>
                  ) : null;
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
