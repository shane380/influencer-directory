"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GiftProductPicker } from "@/components/gift-product-picker";
import type { Campaign, CampaignInfluencer, GiftPoolProduct } from "@/types/database";

// Per-influencer customization of the gift page: which products she sees
// (default = inherit the campaign pool) and optionally her own max selects.

export function GiftOverrideDialog({
  open,
  onClose,
  campaign,
  campaignInfluencer,
  influencerName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  campaign: Campaign;
  campaignInfluencer: CampaignInfluencer;
  influencerName: string;
  onSaved: (patch: Partial<CampaignInfluencer>) => void;
}) {
  const supabase = createClient();
  const pool = campaign.gift_products ?? [];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<GiftPoolProduct[]>([]);
  const [maxOverride, setMaxOverride] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const override = campaignInfluencer.gift_products_override;
    if (override && Array.isArray(override)) {
      const poolIds = new Set(pool.map((p) => String(p.product_id)));
      setChecked(new Set(override.filter((p) => poolIds.has(String(p.product_id))).map((p) => String(p.product_id))));
      setExtras(override.filter((p) => !poolIds.has(String(p.product_id))));
    } else {
      setChecked(new Set(pool.map((p) => String(p.product_id))));
      setExtras([]);
    }
    setMaxOverride(
      campaignInfluencer.gift_max_selects_override != null ? String(campaignInfluencer.gift_max_selects_override) : ""
    );
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaignInfluencer]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    const allPoolChecked = pool.length > 0 && pool.every((p) => checked.has(String(p.product_id)));
    const isInherit = allPoolChecked && extras.length === 0;
    const overrideList: GiftPoolProduct[] | null = isInherit
      ? null
      : [...pool.filter((p) => checked.has(String(p.product_id))), ...extras];
    if (overrideList && overrideList.length === 0) {
      setError("Select at least one product, or leave everything checked to inherit the campaign pool.");
      return;
    }
    const maxVal = maxOverride.trim() === "" ? null : Math.max(1, Math.min(10, parseInt(maxOverride, 10) || 1));
    setSaving(true);
    setError(null);
    const patch = { gift_products_override: overrideList, gift_max_selects_override: maxVal };
    const { error: err } = await (supabase.from("campaign_influencers") as any)
      .update(patch)
      .eq("id", campaignInfluencer.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved(patch as Partial<CampaignInfluencer>);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] min-w-0" style={{ width: 620 }} onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Customize selects — {influencerName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 min-w-0">
          <div>
            <div className="text-sm font-medium mb-1.5">Campaign pool</div>
            <div className="text-xs text-gray-500 mb-2">All checked = she sees the standard campaign pool.</div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {pool.length === 0 && (
                <div className="text-sm text-gray-400">No products in the campaign pool yet — set them in Gift Page settings.</div>
              )}
              {pool.map((p) => (
                <label key={p.product_id} className="flex items-center gap-3 border rounded-md px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={checked.has(String(p.product_id))}
                    onChange={() => toggle(String(p.product_id))}
                  />
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="w-8 h-10 object-cover rounded flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-10 bg-gray-100 rounded flex-shrink-0" />
                  )}
                  <span className="text-sm truncate">{p.product_title}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1.5">Extra products (just for her)</div>
            <GiftProductPicker products={extras} onChange={setExtras} />
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">Outfits override</div>
            <Input
              type="number"
              min={1}
              max={10}
              placeholder={String(campaign.gift_max_selects ?? 3)}
              value={maxOverride}
              onChange={(e) => setMaxOverride(e.target.value)}
              className="w-20"
            />
            <span className="text-xs text-gray-500">Blank = campaign default.</span>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
