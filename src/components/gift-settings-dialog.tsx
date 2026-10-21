"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadToR2 } from "@/lib/r2-upload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GiftProductPicker } from "@/components/gift-product-picker";
import { generateGiftToken, giftGenericUrl, giftPreviewDraftKey } from "@/lib/gift";
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

// Default crops match the gift page's CSS fallbacks.
const DEFAULT_DESKTOP_POSITION = "50% 15%";
const DEFAULT_MOBILE_POSITION = "50% 50%";

function parsePosition(pos: string): { x: number; y: number } {
  const [x, y] = pos.split(" ").map((v) => parseFloat(v));
  return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 50 };
}

// Hero image in its page crop; drag to choose which part of the photo shows.
// object-position % maps to the overflow, so pointer movement is scaled by it.
function HeroFrame({
  url,
  aspect,
  position,
  onPositionChange,
  alt,
  children,
}: {
  url: string;
  aspect: string;
  position: string;
  onPositionChange: (next: string) => void;
  alt: string;
  children?: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ startX: number; startY: number; pos: { x: number; y: number } } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, label")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, pos: parsePosition(position) };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!d || !frame || !img || !img.naturalWidth) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const scale = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
    const overflowX = img.naturalWidth * scale - fw;
    const overflowY = img.naturalHeight * scale - fh;
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(100, v)));
    const x = overflowX > 1 ? clamp(d.pos.x - ((e.clientX - d.startX) / overflowX) * 100) : d.pos.x;
    const y = overflowY > 1 ? clamp(d.pos.y - ((e.clientY - d.startY) / overflowY) * 100) : d.pos.y;
    onPositionChange(`${x}% ${y}%`);
  }

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden rounded-md border cursor-move select-none touch-none"
      style={{ aspectRatio: aspect }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      title="Drag to reposition"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        draggable={false}
        className="w-full h-full object-cover pointer-events-none"
        style={{ objectPosition: position }}
      />
      {children}
    </div>
  );
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
  const [heroPosition, setHeroPosition] = useState(DEFAULT_DESKTOP_POSITION);
  const [heroMobilePosition, setHeroMobilePosition] = useState(DEFAULT_MOBILE_POSITION);
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
  const [heroDropError, setHeroDropError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEnabled(campaign.gift_enabled ?? false);
    setHero(campaign.gift_hero_image?.url ? { url: campaign.gift_hero_image.url, r2_key: campaign.gift_hero_image.r2_key || "" } : null);
    setHeroPosition(campaign.gift_hero_image?.position || DEFAULT_DESKTOP_POSITION);
    setHeroMobilePosition(campaign.gift_hero_image?.mobile_position || DEFAULT_MOBILE_POSITION);
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
    setHeroDropError(null);
    setError(null);
  }, [open, campaign]);

  // Pool thumbnails are snapshotted when a product is added — often a draft
  // with no photos yet. Refresh them from Shopify on open (saved on next Save).
  useEffect(() => {
    const ids = (campaign.gift_products ?? []).map((p) => String(p.product_id));
    if (!open || ids.length === 0) return;
    let cancelled = false;
    fetch(`/api/gift/pool-images?ids=${ids.join(",")}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const images: Record<string, string | null> | undefined = data?.images;
        if (cancelled || !images) return;
        setPool((prev) =>
          prev.map((p) => {
            const live = images[String(p.product_id)];
            return live && live !== p.image_url ? { ...p, image_url: live } : p;
          })
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, campaign]);

  async function handleHeroFile(file: File | undefined, target: "desktop" | "mobile" = "desktop") {
    if (!file) return;
    setHeroDropError(null);
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const key = `campaigns/gift/${target === "mobile" ? "mobile-" : ""}${campaign.id}-${Date.now()}-${file.name}`;
      const { url, key: r2Key } = await uploadToR2({ key, contentType: file.type, body: compressed });
      if (target === "mobile") {
        setHeroMobile({ url, r2_key: r2Key });
        setHeroMobilePosition(DEFAULT_MOBILE_POSITION);
      } else {
        setHero({ url, r2_key: r2Key });
        setHeroPosition(DEFAULT_DESKTOP_POSITION);
      }
    } catch (err) {
      console.error("Hero upload failed:", err);
      setError("Hero upload failed — check your connection.");
    }
    setUploading(false);
  }

  // Images dragged out of a browser tab (Drive, Slack, Gmail) usually arrive
  // as a link, not a file — say so instead of silently doing nothing.
  function handleHeroDrop(e: React.DragEvent, target: "desktop" | "mobile") {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      setHeroDropError("That drop didn't include an image file. Save the image to your computer first, then drag it from there (or click to upload).");
      return;
    }
    handleHeroFile(file, target);
  }

  // Either image may exist alone; the page falls back to whichever is set.
  function heroImagePayload() {
    if (!hero && !heroMobile) return null;
    return {
      url: hero?.url || null,
      r2_key: hero?.r2_key || null,
      mobile_url: heroMobile?.url || null,
      mobile_r2_key: heroMobile?.r2_key || null,
      position: heroPosition,
      mobile_position: heroMobilePosition,
    };
  }

  // Opens the page as creators will see it, using what's in this dialog now
  // (saved or not). Works before the link is enabled.
  function openPreview() {
    const draft = {
      hero_image: heroImagePayload(),
      blurb: blurb.trim() || null,
      outfits: Math.max(1, Math.min(10, maxSelects || 3)),
      selects_deadline: selectsDeadline || null,
      pool,
    };
    try {
      localStorage.setItem(giftPreviewDraftKey(campaign.id), JSON.stringify(draft));
    } catch {
      // Storage blocked — the preview falls back to the saved settings.
    }
    window.open(`/gift/preview/${campaign.id}`, "_blank");
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
      gift_hero_image: heroImagePayload(),
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
                <div className="text-xs text-gray-500 mb-1">Desktop — wide banner (3.5:1)</div>
                {hero ? (
                  <HeroFrame url={hero.url} aspect="3.5/1" position={heroPosition} onPositionChange={setHeroPosition} alt="Desktop hero">
                    <button
                      className="absolute top-2 right-2 bg-white/90 border rounded px-2 py-0.5 text-xs"
                      onClick={() => setHero(null)}
                    >
                      Remove
                    </button>
                  </HeroFrame>
                ) : (
                  <label
                    className="flex items-center justify-center h-24 border-2 border-dashed rounded-md text-sm text-gray-400 cursor-pointer hover:border-gray-400 text-center px-2"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => handleHeroDrop(e, "desktop")}
                  >
                    {uploading ? "Uploading…" : heroMobile ? "Drag an image here or click to upload — until then desktop uses the mobile image" : "Drag an image here or click to upload"}
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
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => handleHeroDrop(e, "mobile")}
                  >
                    <HeroFrame url={(heroMobile || hero)!.url} aspect="5/4" position={heroMobilePosition} onPositionChange={setHeroMobilePosition} alt="Mobile hero">
                      {heroMobile ? (
                        <button
                          className="absolute top-2 right-2 bg-white/90 border rounded px-2 py-0.5 text-xs"
                          onClick={() => setHeroMobile(null)}
                        >
                          Remove
                        </button>
                      ) : (
                        <label className="absolute bottom-2 left-2 right-2 text-center bg-white/90 border rounded px-2 py-1 text-xs cursor-pointer hover:bg-white">
                          {uploading ? "Uploading…" : "Use a different image"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleHeroFile(e.target.files?.[0], "mobile")}
                          />
                        </label>
                      )}
                    </HeroFrame>
                  </div>
                ) : (
                  <label
                    className="flex items-center justify-center h-24 border-2 border-dashed rounded-md text-xs text-gray-400 text-center px-2 cursor-pointer hover:border-gray-400"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => handleHeroDrop(e, "mobile")}
                  >
                    {uploading ? "Uploading…" : "Optional — uses the desktop image if empty"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleHeroFile(e.target.files?.[0], "mobile")}
                    />
                  </label>
                )}
              </div>
            </div>
            {heroDropError && <div className="text-xs text-red-600 mt-1">{heroDropError}</div>}
            {(hero || heroMobile) && (
              <div className="text-xs text-gray-400 mt-1">
                Drag an image to reposition it in its frame.
                {heroMobile && hero ? " Mobile uses its own image; remove it to fall back to the desktop one." : ""}
              </div>
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
            <GiftProductPicker
              products={pool}
              onChange={setPool}
              onUploadImage={async (file, productId) => {
                const compressed = await compressImage(file);
                const key = `campaigns/gift/product-${campaign.id}-${productId}-${Date.now()}-${file.name}`;
                const { url, key: r2Key } = await uploadToR2({ key, contentType: file.type, body: compressed });
                return { url, r2_key: r2Key };
              }}
            />
            <div className="text-xs text-gray-400 mt-1">“Campaign image” swaps a product&rsquo;s photo on the selects page only — the live Shopify product keeps its own.</div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className="mr-auto" onClick={openPreview} disabled={pool.length === 0 || uploading}>
              Preview
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving || uploading}>{saving ? "Saving…" : "Save Selects Page"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
