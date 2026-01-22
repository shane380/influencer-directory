"use client";

import { InfluencerRates } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign } from "lucide-react";

interface InfluencerRatesSectionProps {
  rates: InfluencerRates | null;
  onChange: (rates: Partial<InfluencerRates>) => void;
}

export function InfluencerRatesSection({ rates, onChange }: InfluencerRatesSectionProps) {
  const handleChange = (field: keyof InfluencerRates, value: string) => {
    const numValue = value === "" ? null : parseFloat(value);
    onChange({ [field]: numValue });
  };

  const handleNotesChange = (value: string) => {
    onChange({ notes: value || null });
  };

  return (
    <div className="border-t pt-4">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="h-4 w-4 text-purple-600" />
        <h3 className="font-medium">Rate Card</h3>
        <span className="text-xs text-gray-500">(Paid Partnership)</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ugc_rate">UGC Rate</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <Input
              id="ugc_rate"
              type="number"
              min="0"
              step="50"
              value={rates?.ugc_rate ?? ""}
              onChange={(e) => handleChange("ugc_rate", e.target.value)}
              placeholder="500"
              className="pl-7"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="collab_post_rate">Collab Post Rate</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <Input
              id="collab_post_rate"
              type="number"
              min="0"
              step="50"
              value={rates?.collab_post_rate ?? ""}
              onChange={(e) => handleChange("collab_post_rate", e.target.value)}
              placeholder="1500"
              className="pl-7"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="organic_post_rate">Organic Post Rate</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <Input
              id="organic_post_rate"
              type="number"
              min="0"
              step="50"
              value={rates?.organic_post_rate ?? ""}
              onChange={(e) => handleChange("organic_post_rate", e.target.value)}
              placeholder="300"
              className="pl-7"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="whitelisting_rate">Whitelisting Rate</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <Input
              id="whitelisting_rate"
              type="number"
              min="0"
              step="50"
              value={rates?.whitelisting_rate ?? ""}
              onChange={(e) => handleChange("whitelisting_rate", e.target.value)}
              placeholder="200"
              className="pl-7"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="rate_notes">Rate Notes</Label>
        <Textarea
          id="rate_notes"
          value={rates?.notes ?? ""}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Any rate conditions, package deals, or notes..."
          rows={2}
        />
      </div>
    </div>
  );
}
