"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadToR2 } from "@/lib/r2-upload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GiftProductPicker } from "@/components/gift-product-picker";
import { ImagePositionFrame } from "@/components/image-position-frame";
import { formatGiftEventTime, generateGiftToken, giftGenericUrl, giftPreviewDraftKey } from "@/lib/gift";
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
  const [maxSelects, setMaxSelects] = useState(1);
  const [selectsDeadline, setSelectsDeadline] = useState("");
  const [pool, setPool] = useState<GiftPoolProduct[]>([]);
  const [ignoreStock, setIgnoreStock] = useState(false);
  const [eventMode, setEventMode] = useState(false);
  const [eventTime, setEventTime] = useState("");
  const [eventVenue, setEventVenue] = useState("");
  const [eventAddress, setEventAddress] = useState("");
  const [hideTitle, setHideTitle] = useState(false);
  const [signOff, setSignOff] = useState("");
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
    setMaxSelects(campaign.gift_max_selects ?? 1);
    setSelectsDeadline((campaign as any).gift_selects_deadline || "");
    setPool(campaign.gift_products ?? []);
    setIgnoreStock((campaign as any).gift_ignore_stock ?? false);
    setEventMode((campaign as any).gift_event_mode ?? false);
    setEventTime((campaign as any).gift_event_time || "");
    {
      // Stored as "venue\naddress" — the page shows the two lines separately.
      const [venue = "", ...rest] = String((campaign as any).gift_event_location || "").split("\n");
      setEventVenue(venue);
      setEventAddress(rest.join("\n"));
    }
    setHideTitle(Boolean(campaign.gift_hero_image?.hide_title));
    setSignOff(campaign.gift_hero_image?.sign_off || "");
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
    // Also carries page presentation settings (hide_title, sign_off), so it
    // is kept even without an image when one of those is set.
    if (!hero && !heroMobile && !hideTitle && !signOff.trim()) return null;
    return {
      url: hero?.url || null,
      r2_key: hero?.r2_key || null,
      mobile_url: heroMobile?.url || null,
      mobile_r2_key: heroMobile?.r2_key || null,
      position: heroPosition,
      mobile_position: heroMobilePosition,
      hide_title: hideTitle,
      sign_off: signOff.trim() || null,
    };
  }

  function eventLocationValue(): string | null {
    return [eventVenue.trim(), eventAddress.trim()].filter(Boolean).join("\n") || null;
  }

  // Opens the page as creators will see it, using what's in this dialog now
  // (saved or not). Works before the link is enabled.
  function openPreview() {
    const draft = {
      hero_image: heroImagePayload(),
      blurb: blurb.trim() || null,
      outfits: Math.max(1, Math.min(10, maxSelects || 1)),
      selects_deadline: selectsDeadline || null,
      ignore_stock: ignoreStock,
      event_mode: eventMode,
      event_time: eventMode && eventTime ? eventTime : null,
      event_location: eventMode ? eventLocationValue() : null,
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
      gift_max_selects: Math.max(1, Math.min(10, maxSelects || 1)),
      ...("gift_selects_deadline" in (campaign as any) || selectsDeadline
        ? { gift_selects_deadline: selectsDeadline || null }
        : {}),
      gift_products: pool,
      ...("gift_ignore_stock" in (campaign as any) || ignoreStock ? { gift_ignore_stock: ignoreStock } : {}),
      ...("gift_event_mode" in (campaign as any) || eventMode
        ? {
            gift_event_mode: eventMode,
            gift_event_time: eventMode && eventTime ? eventTime : null,
            gift_event_location: eventMode ? eventLocationValue() : null,
          }
        : {}),
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
                  <ImagePositionFrame url={hero.url} aspect="3.5/1" position={heroPosition} onPositionChange={setHeroPosition} alt="Desktop hero">
                    <button
                      className="absolute top-2 right-2 bg-white/90 border rounded px-2 py-0.5 text-xs"
                      onClick={() => setHero(null)}
                    >
                      Remove
                    </button>
                  </ImagePositionFrame>
                ) : (
                  <label
                    className="flex items-center justify-center h-24 border-2 border-dashed rounded-md text-sm text-gray-400 cursor-pointer hover:border-gray-400 text-center px-2"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => handleHeroDrop(e, "desktop")}
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
                {heroMobile ? (
                  <ImagePositionFrame url={heroMobile.url} aspect="5/4" position={heroMobilePosition} onPositionChange={setHeroMobilePosition} alt="Mobile hero">
                    <button
                      className="absolute top-2 right-2 bg-white/90 border rounded px-2 py-0.5 text-xs"
                      onClick={() => setHeroMobile(null)}
                    >
                      Remove
                    </button>
                  </ImagePositionFrame>
                ) : (
                  <label
                    className="flex items-center justify-center h-24 border-2 border-dashed rounded-md text-xs text-gray-400 text-center px-2 cursor-pointer hover:border-gray-400"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => handleHeroDrop(e, "mobile")}
                  >
                    {uploading ? "Uploading…" : "Drag a separate mobile image here or click to upload"}
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
                {hero && !heroMobile ? " No mobile image yet — phones show the desktop image until you add one." : ""}
                {heroMobile && !hero ? " No desktop image yet — desktop shows the mobile image until you add one." : ""}
              </div>
            )}
            {(hero || heroMobile) && (
              <label className="flex items-center gap-3 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={hideTitle}
                  onChange={(e) => setHideTitle(e.target.checked)}
                />
                <span className="text-sm">Hide the title block under the banner</span>
                <span className="text-xs text-gray-500">For banners that already show the campaign name.</span>
              </label>
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
            <div className="text-sm font-medium">Signed by</div>
            <Input
              value={signOff}
              onChange={(e) => setSignOff(e.target.value)}
              placeholder="Daisy"
              className="w-40"
            />
            <span className="text-xs text-gray-500">The letter ends “— {signOff.trim() || "Daisy"} &amp; the Nama team”.</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">Outfits</div>
            <Input
              type="number"
              min={1}
              max={10}
              value={maxSelects}
              onChange={(e) => setMaxSelects(parseInt(e.target.value, 10) || 1)}
              className="w-20"
            />
            <span className="text-xs text-gray-500">An outfit is 2–3 pieces — she can pick up to {Math.max(1, Math.min(10, maxSelects || 1)) * 3} pieces. Overridable per influencer.</span>
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
                checked={eventMode}
                onChange={(e) => setEventMode(e.target.checked)}
              />
              <span className="text-sm font-medium">Event</span>
              <span className="text-xs text-gray-500">Outfits are collected at an event, not shipped — shows the event date, says the outfit is ready on arrival, and drops the address fields.</span>
            </label>
            {eventMode && (
              <>
                <div className="flex items-center gap-3">
                  <div className="text-sm">Arrival time</div>
                  <Input
                    type="time"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="w-32"
                  />
                  <span className="text-xs text-gray-500">
                    Shown as &ldquo;Event date · {campaign.start_date
                      ? new Date(campaign.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })
                      : "—"}{formatGiftEventTime(eventTime) ? ` · Arrive at ${formatGiftEventTime(eventTime)}` : ""}&rdquo;.
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm w-24">Venue</div>
                  <Input
                    value={eventVenue}
                    onChange={(e) => setEventVenue(e.target.value)}
                    placeholder="Example Studio"
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm w-24">Address</div>
                  <Input
                    value={eventAddress}
                    onChange={(e) => setEventAddress(e.target.value)}
                    placeholder="123 Example St, City, ST 00000"
                    className="flex-1"
                  />
                </div>
                <div className="text-xs text-gray-400 -mt-2">Shown under &ldquo;Where&rdquo; as two lines: venue, then address.</div>
                <div className="text-xs text-gray-400">
                  {campaign.start_date
                    ? "The date is the campaign start date — change it on the campaign to move the event."
                    : "Set the campaign start date so the event date shows on the page."}
                </div>
              </>
            )}
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={ignoreStock}
              onChange={(e) => setIgnoreStock(e.target.checked)}
            />
            <span className="text-sm font-medium">Ignore stock</span>
            <span className="text-xs text-gray-500">Every size is selectable, even when Shopify shows it out of stock.</span>
          </label>

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
