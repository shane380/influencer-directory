"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { InfluencerMediaKit } from "@/types/database";
import { Button } from "@/components/ui/button";
import { FileImage, Upload, Trash2, ExternalLink, Loader2 } from "lucide-react";

interface MediaKitUploadProps {
  influencerId: string;
  mediaKits: InfluencerMediaKit[];
  onUpload: (mediaKit: InfluencerMediaKit) => void;
  onDelete: (mediaKitId: string) => void;
}

export function MediaKitUpload({
  influencerId,
  mediaKits,
  onUpload,
  onDelete,
}: MediaKitUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const fileName = `${influencerId}/${Date.now()}-${file.name}`;

        // Upload to Supabase storage
        const { error: uploadError } = await supabase.storage
          .from("media-kits")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("media-kits")
          .getPublicUrl(fileName);

        // Save to database
        const { data, error: insertError } = await supabase
          .from("influencer_media_kits")
          .insert({
            influencer_id: influencerId,
            file_url: urlData.publicUrl,
            file_name: file.name,
            file_size: file.size,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        onUpload(data);
      }
    } catch (err) {
      console.error("Error uploading media kit:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (mediaKit: InfluencerMediaKit) => {
    setDeleting(mediaKit.id);

    try {
      // Extract file path from URL
      const urlParts = mediaKit.file_url.split("/media-kits/");
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from("media-kits").remove([filePath]);
      }

      // Delete from database
      const { error } = await supabase
        .from("influencer_media_kits")
        .delete()
        .eq("id", mediaKit.id);

      if (error) throw error;

      onDelete(mediaKit.id);
    } catch (err) {
      console.error("Error deleting media kit:", err);
    } finally {
      setDeleting(null);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="border-t pt-4">
      <div className="flex items-center gap-2 mb-3">
        <FileImage className="h-4 w-4 text-purple-600" />
        <h3 className="font-medium">Media Kit</h3>
        <span className="text-xs text-gray-500">(Screenshots, PDFs)</span>
      </div>

      {/* Upload area */}
      <div className="mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id="media-kit-upload"
        />
        <label
          htmlFor="media-kit-upload"
          className={`
            flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed rounded-lg cursor-pointer
            transition-colors
            ${uploading ? "bg-gray-100 cursor-not-allowed" : "hover:bg-gray-50 hover:border-gray-400"}
          `}
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <span className="text-sm text-gray-500">Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-500">Click to upload media kit files</span>
            </>
          )}
        </label>
      </div>

      {/* Uploaded files list */}
      {mediaKits.length > 0 && (
        <div className="space-y-2">
          {mediaKits.map((mediaKit) => (
            <div
              key={mediaKit.id}
              className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileImage className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm truncate">{mediaKit.file_name}</span>
                {mediaKit.file_size && (
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    ({formatFileSize(mediaKit.file_size)})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => window.open(mediaKit.file_url, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                  onClick={() => handleDelete(mediaKit)}
                  disabled={deleting === mediaKit.id}
                >
                  {deleting === mediaKit.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
