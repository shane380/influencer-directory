"use client";

import { useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
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

/**
 * Stories/reels (9:16) mockup at ~3/4 iPhone scale (280×498)
 * rendering the actual uploaded asset.
 */
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
  const truncated = caption.length > 90 ? `${caption.slice(0, 90)}…` : caption;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <div className="w-[280px] max-w-full">
      <div className="relative w-full h-[498px] rounded-2xl bg-gray-900 overflow-hidden shadow-sm">
        {mediaUrl && mediaKind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl} alt="Ad creative" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {mediaUrl && mediaKind === "video" && (
          <video
            ref={videoRef}
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
          <span className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            9:16 creative
          </span>
        )}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute top-3 left-3 right-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-200 to-rose-300 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white leading-tight truncate">{identityName}</p>
            <p className="text-[11px] text-white/70 leading-tight truncate">{identitySub}</p>
          </div>
        </div>
        {mediaUrl && mediaKind === "video" && (
          <button
            type="button"
            onClick={toggleMute}
            className="absolute top-14 right-3 bg-black/60 hover:bg-black/75 text-white rounded-full p-1.5"
            aria-label={muted ? "Unmute video" : "Mute video"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
        <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 text-white/90 text-[20px] leading-none">
          <span>♡</span>
          <span>◌</span>
          <span>➦</span>
        </div>
        <div className="absolute left-3 right-12 bottom-4">
          <p className="text-[13px] text-white/95 leading-snug mb-2.5">{truncated}</p>
          <div className="bg-white text-gray-900 rounded-lg text-center text-[14px] font-semibold py-2.5">
            {ctaLabel}
          </div>
        </div>
      </div>
      {isFallback && (
        <p className="text-[11px] text-gray-400 text-center mt-1.5">
          Using feed creative (no 9:16 uploaded)
        </p>
      )}
    </div>
  );
}
