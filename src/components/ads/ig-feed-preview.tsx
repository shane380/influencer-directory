"use client";

import type { AdCopy } from "@/types/meta-ads";

interface Props {
  copy: AdCopy;
  ctaLabel: string;
  identityName: string;
  identitySub: string;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  posterUrl?: string | null;
}

/**
 * Instagram feed mockup at close to iPhone scale (375px content width)
 * rendering the actual uploaded asset.
 */
export function IgFeedPreview({
  copy,
  ctaLabel,
  identityName,
  identitySub,
  mediaUrl,
  mediaKind,
  posterUrl,
}: Props) {
  const caption = copy.primaryText?.trim() || "Primary text shows here…";
  const truncated = caption.length > 125 ? `${caption.slice(0, 125)}` : caption;

  return (
    <div className="w-[375px] max-w-full rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-200 to-rose-300 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-gray-900 leading-tight truncate">{identityName}</p>
          <p className="text-[12px] text-gray-400 leading-tight truncate">{identitySub}</p>
        </div>
        <span className="ml-auto text-gray-400 tracking-widest text-sm">···</span>
      </div>
      <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
        {mediaUrl && mediaKind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl} alt="Ad creative" className="w-full h-full object-cover" />
        )}
        {mediaUrl && mediaKind === "video" && (
          <video
            src={mediaUrl}
            poster={posterUrl || undefined}
            className="w-full h-full object-cover"
            muted
            playsInline
            loop
            autoPlay
          />
        )}
        {!mediaUrl && <span className="text-sm text-gray-400">Feed creative</span>}
      </div>
      <div className="flex items-center justify-between px-3.5 py-3 bg-gray-50 border-y border-gray-100">
        <span className="text-[14px] font-semibold text-gray-900">{ctaLabel}</span>
        <span className="text-gray-500 text-base">›</span>
      </div>
      <div className="flex items-center gap-4 px-3.5 pt-2.5 text-gray-800 text-[18px] leading-none">
        <span>♡</span>
        <span>◌</span>
        <span>➦</span>
      </div>
      <div className="px-3.5 pt-2 pb-3.5">
        {copy.headline?.trim() && (
          <p className="text-[13.5px] font-semibold text-gray-900 mb-0.5 truncate">{copy.headline}</p>
        )}
        <p className="text-[13px] text-gray-700 leading-snug">
          <span className="font-semibold text-gray-900">{identityName}</span> {truncated}
          {caption.length > 125 && <span className="text-gray-400">… more</span>}
        </p>
      </div>
    </div>
  );
}
