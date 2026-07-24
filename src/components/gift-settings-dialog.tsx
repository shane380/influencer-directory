"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadToR2 } from "@/lib/r2-upload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GiftProductPicker } from "@/components/gift-product-picker";
import { generateGiftToken, giftGenericUrl } from "@/lib/gift";
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
  const [heroMobile, setHeroMobile] = useState<{ url: string; r2_key: string } | null>(null);
  const [blurb, setBlurb] = useState("");
  const [maxSelects, setMaxSelects] = useState(3);
  const [selectsDeadline, setSelectsDeadline] = useState("");
  const [pool, setPool] = useState<GiftPoolProduct[]>([]);
  const [genericEnabled, setGenericEnabled] = useState(false);
  const [genericToken, setGenericToken] = useState<string | null>(null);
  const [genericMaxSelects, setGenericMaxSelects] = useState(1);
  const [genericCopied, setGenericCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEnabled(campaign.gift_enabled ?? false);
    setHero(campaign.gift_hero_image ? { url: campaign.gift_hero_image.url, r2_key: campaign.gift_hero_image.r2_key } : null);
    setHeroMobile(
      campaign.gift_hero_image?.mobile_url
        ? { url: campaign.gift_hero_image.mobile_url, r2_key: campaign.gift_hero_image.mobile_r2_key || "" }
        : null
    );
    setBlurb(campaign.gift_blurb ?? "");
    setMaxSelects(campaign.gift_max_selects ?? 3);
    setSelectsDeadline((campaign as any).gift_selects_deadline || "");
    setPool(campaign.gift_products ?? []);
    setGenericEnabled((campaign as any).gift_generic_enabled ?? false);
    setGenericToken((campaign as any).gift_generic_token ?? null);
    setGenericMaxSelects((campaign as any).gift_generic_max_selects ?? 1);
    setGenericCopied(false);
    setError(null);
  }, [open, campaign]);

  async function handleHeroFile(file: File | undefined, target: "desktop" | "mobile" = "desktop") {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const key = `campaigns/gift/${target === "mobile" ? "mobile-" : ""}${campaign.id}-${Date.now()}-${file.name}`;
      const { url, key: r2Key } = await uploadToR2({ key, contentType: file.type, body: compressed });
      if (target === "mobile") setHeroMobile({ url, r2_key: r2Key });
      else setHero({ url, r2_key: r2Key });
    } catch (err) {
      console.error("Hero upload failed:", err);
      setError("Hero upload failed — check your connection.");
    }
    setUploading(false);
  }

  async function save() {
    if (enabled && pool.length === 0) {
      setError("Add at least one product before enabling the selects page.");
      return;
    }
    setSaving(true);
    setError(null);
    const patch = {
      gift_enabled: enabled,
      gift_hero_image: hero
        ? { ...hero, mobile_url: heroMobile?.url || null, mobile_r2_key: heroMobile?.r2_key || null }
        : null,
      gift_blurb: blurb.trim() || null,
      gift_max_selects: Math.max(1, Math.min(10, maxSelects || 3)),
      ...("gift_selects_deadline" in (campaign as any) || selectsDeadline
        ? { gift_selects_deadline: selectsDeadline || null }
        : {}),
      gift_products: pool,
      // Written only when the columns exist (migration applied) or the user
      // touched the feature — so saving other settings never breaks pre-migration.
      ...("gift_generic_enabled" in (campaign as any) || genericEnabled || genericToken
        ? {
            gift_generic_enabled: genericEnabled,
            gift_generic_token: genericToken,
            gift_generic_max_selects: Math.max(1, Math.min(10, genericMaxSelects || 1)),
          }
        : {}),
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
      <DialogContent className="max-w-[95vw] min-w-0" style={{ width: 760 }} onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Selects Page — {campaign.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 min-w-0">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-sm font-medium">Selects link enabled</span>
            <span className="text-xs text-gray-500">Links 404 until this is on.</span>
          </label>

          <div>
            <div className="text-sm font-medium mb-1.5">Hero image</div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 190px" }}>
              <div className="min-w-0">
                <div className="text-xs text-gray-500 mb-1">Desktop — wide banner, cropped from the top (3.5:1)</div>
                {hero ? (
                  <div className="relative">
                    <div className="w-full overflow-hidden rounded-md border" style={{ aspectRatio: "3.5/1" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={hero.url} alt="Desktop hero" className="w-full h-full object-cover" style={{ objectPosition: "50% 15%" }} />
                    </div>
                    <button
                      className="absolute top-2 right-2 bg-white/90 border rounded px-2 py-0.5 text-xs"
                      onClick={() => { setHero(null); setHeroMobile(null); }}
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
                <div className="text-xs text-gray-500 mb-1">Mobile (5:4)</div>
                {hero || heroMobile ? (
                  <div className="relative">
                    <div className="w-full overflow-hidden rounded-md border" style={{ aspectRatio: "5/4" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={(heroMobile || hero)!.url} alt="Mobile hero" className="w-full h-full object-cover" />
                    </div>
                    {heroMobile ? (
                      <button
                        className="absolute top-2 right-2 bg-white/90 border rounded px-2 py-0.5 text-xs"
                        onClick={() => setHeroMobile(null)}
                      >
                        Remove
                      </button>
                    ) : (
                      <label className="absolute bottom-2 left-2 right-2 text-center bg-white/90 border rounded px-2 py-1 text-xs cursor-pointer hover:bg-white">
                        Use a different image
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleHeroFile(e.target.files?.[0], "mobile")}
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-24 border-2 border-dashed rounded-md text-xs text-gray-300 text-center px-2">
                    Add a desktop image first
                  </div>
                )}
              </div>
            </div>
            {heroMobile && hero && (
              <div className="text-xs text-gray-400 mt-1">Mobile uses its own image; remove it to fall back to the desktop one.</div>
            )}
          </div>

          <div>
            <div className="text-sm font-medium mb-1.5">Landing blurb</div>
            <Textarea
              rows={3}
              placeholder={`${campaign.name} is our sharpest collection yet — clean lines, black piping. Before it goes live, we'd love you in it. Pick your pieces below.`}
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
            />
            <div className="text-xs text-gray-400 mt-1">The collection paragraph, shown under “{"{name}"}, you’re on the list.”</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">Outfits</div>
            <Input
              type="number"
              min={1}
              max={10}
              value={maxSelects}
              onChange={(e) => setMaxSelects(parseInt(e.target.value, 10) || 3)}
              className="w-20"
            />
            <span className="text-xs text-gray-500">An outfit is 2–3 pieces — she can pick up to {Math.max(1, Math.min(10, maxSelects || 3)) * 3} pieces. Overridable per influencer.</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">Selects deadline</div>
            <Input
              type="date"
              value={selectsDeadline}
              onChange={(e) => setSelectsDeadline(e.target.value)}
              className="w-40"
            />
            <span className="text-xs text-gray-500">Shown on the page ("make your picks by …"). Leave empty to show shipping time instead.</span>
          </div>

          <div className="border rounded-md p-3 space-y-2.5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={genericEnabled}
                onChange={(e) => {
                  setGenericEnabled(e.target.checked);
                  // Keep the token once minted so pausing doesn't kill the URL.
                  if (e.target.checked && !genericToken) setGenericToken(generateGiftToken());
                }}
              />
              <span className="text-sm font-medium">Open invite link</span>
              <span className="text-xs text-gray-500">One reusable link for creators who aren&rsquo;t in the directory yet.</span>
            </label>
            {genericEnabled && (
              <>
                <div className="flex items-center gap-3">
                  <div className="text-sm">Outfits</div>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={genericMaxSelects}
                    onChange={(e) => setGenericMaxSelects(parseInt(e.target.value, 10) || 1)}
                    className="w-20"
                  />
                  <span className="text-xs text-gray-500">Up to {Math.max(1, Math.min(10, genericMaxSelects || 1)) * 3} pieces per submission on this link.</span>
                </div>
                {genericToken && (
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="text-xs bg-gray-50 border rounded px-2 py-1.5 flex-1 truncate">{giftGenericUrl(genericToken)}</code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(giftGenericUrl(genericToken));
                        setGenericCopied(true);
                        setTimeout(() => setGenericCopied(false), 1500);
                      }}
                    >
                      {genericCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                )}
                <div className="text-xs text-gray-400">Submissions auto-match to existing influencers by IG handle or email, or create new records. Save to activate.</div>
              </>
            )}
          </div>

          <div>
            <div className="text-sm font-medium mb-1.5">Product pool</div>
            <GiftProductPicker products={pool} onChange={setPool} />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving || uploading}>{saving ? "Saving…" : "Save Selects Page"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
