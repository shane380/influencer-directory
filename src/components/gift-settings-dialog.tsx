"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadToR2 } from "@/lib/r2-upload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GiftProductPicker } from "@/components/gift-product-picker";
import type { Campaign, GiftPoolProduct } from "@/types/database";

// Campaign-level configuration for the public gift selection page.

async function compressImage(file: File, maxWidth = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export function GiftSettingsDialog({
  open,
  onClose,
  campaign,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  campaign: Campaign;
  onSaved: (updated: Partial<Campaign>) => void;
}) {
  const supabase = createClient();
  const [enabled, setEnabled] = useState(false);
  const [hero, setHero] = useState<{ url: string; r2_key: string } | null>(null);
  const [blurb, setBlurb] = useState("");
  const [maxSelects, setMaxSelects] = useState(3);
  const [pool, setPool] = useState<GiftPoolProduct[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEnabled(campaign.gift_enabled ?? false);
    setHero(campaign.gift_hero_image ?? null);
    setBlurb(campaign.gift_blurb ?? "");
    setMaxSelects(campaign.gift_max_selects ?? 3);
    setPool(campaign.gift_products ?? []);
    setError(null);
  }, [open, campaign]);

  async function handleHeroFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const key = `campaigns/gift/${campaign.id}-${Date.now()}-${file.name}`;
      const { url, key: r2Key } = await uploadToR2({ key, contentType: file.type, body: compressed });
      setHero({ url, r2_key: r2Key });
    } catch (err) {
      console.error("Hero upload failed:", err);
      setError("Hero upload failed — check your connection.");
    }
    setUploading(false);
  }

  async function save() {
    if (enabled && pool.length === 0) {
      setError("Add at least one product before enabling the gift page.");
      return;
    }
    setSaving(true);
    setError(null);
    const patch = {
      gift_enabled: enabled,
      gift_hero_image: hero,
      gift_blurb: blurb.trim() || null,
      gift_max_selects: Math.max(1, Math.min(10, maxSelects || 3)),
      gift_products: pool,
    };
    const { error: err } = await (supabase.from("campaigns") as any).update(patch).eq("id", campaign.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved(patch as Partial<Campaign>);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[560px] max-w-[92vw]" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Gift Page — {campaign.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-sm font-medium">Gift link enabled</span>
            <span className="text-xs text-gray-500">Links 404 until this is on.</span>
          </label>

          <div>
            <div className="text-sm font-medium mb-1.5">Hero image</div>
            {hero ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hero.url} alt="Hero" className="w-full h-32 object-cover rounded-md border" />
                <button
                  className="absolute top-2 right-2 bg-white/90 border rounded px-2 py-0.5 text-xs"
                  onClick={() => setHero(null)}
                >
                  Remove
                </button>
              </div>
            ) : (
              <label
                className="flex items-center justify-center h-24 border-2 border-dashed rounded-md text-sm text-gray-400 cursor-pointer hover:border-gray-400"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleHeroFile(e.dataTransfer.files?.[0]);
                }}
              >
                {uploading ? "Uploading…" : "Drag an image here or click to upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleHeroFile(e.target.files?.[0])}
                />
              </label>
            )}
          </div>

          <div>
            <div className="text-sm font-medium mb-1.5">Landing blurb</div>
            <Textarea
              rows={3}
              placeholder={`We're launching ${campaign.name} and want you in it first — pick your pieces on us.`}
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
            />
            <div className="text-xs text-gray-400 mt-1">Shown under “Hi {"{name}"}, pick your pieces.”</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">Max selects</div>
            <Input
              type="number"
              min={1}
              max={10}
              value={maxSelects}
              onChange={(e) => setMaxSelects(parseInt(e.target.value, 10) || 3)}
              className="w-20"
            />
            <span className="text-xs text-gray-500">Overridable per influencer.</span>
          </div>

          <div>
            <div className="text-sm font-medium mb-1.5">Product pool</div>
            <GiftProductPicker products={pool} onChange={setPool} />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving || uploading}>{saving ? "Saving…" : "Save Gift Page"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
