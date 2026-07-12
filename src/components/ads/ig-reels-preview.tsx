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
  /** True when this is the feed asset standing in for a missing 9:16 upload */
  isFallback?: boolean;
}

/** Lightweight stories/reels (9:16) mockup — renders the actual uploaded asset. */
export function IgReelsPreview({
  copy,
  ctaLabel,
  identityName,
  identitySub,
  mediaUrl,
  mediaKind,
  posterUrl,
  isFallback,
}: Props) {
  const caption = copy.primaryText?.trim() || "Primary text shows here…";
  const truncated = caption.length > 70 ? `${caption.slice(0, 70)}…` : caption;

  return (
    <div className="w-[150px]">
      <div className="relative w-[150px] h-[267px] rounded-xl bg-gray-900 overflow-hidden shadow-sm">
        {mediaUrl && mediaKind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl} alt="Ad creative" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {mediaUrl && mediaKind === "video" && (
          <video
            src={mediaUrl}
            poster={posterUrl || undefined}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
            loop
            autoPlay
          />
        )}
        {!mediaUrl && (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-500">
            9:16 creative
          </span>
        )}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute top-2 left-2 right-2 flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-200 to-rose-300 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[9.5px] font-semibold text-white leading-tight truncate">{identityName}</p>
            <p className="text-[8.5px] text-white/70 leading-tight truncate">{identitySub}</p>
          </div>
        </div>
        <div className="absolute left-2 right-2 bottom-2">
          <p className="text-[9.5px] text-white/90 leading-snug mb-1.5">{truncated}</p>
          <div className="bg-white text-gray-900 rounded-full text-center text-[10.5px] font-semibold py-1.5">
            {ctaLabel}
          </div>
        </div>
      </div>
      {isFallback && (
        <p className="text-[10px] text-gray-400 text-center mt-1">Using feed creative (no 9:16 uploaded)</p>
      )}
    </div>
  );
}
