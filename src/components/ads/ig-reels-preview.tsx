"use client";

import { useRef, useState } from "react";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Heart,
  Menu,
  MessageCircle,
  Repeat2,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { AdCopy } from "@/types/meta-ads";
import { useEditedPlayback } from "./video-editor/use-edited-playback";
import type { PreviewEdit } from "./video-editor/types";

interface Props {
  copy: AdCopy;
  ctaLabel: string;
  identityName: string;
  identitySub: string;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  posterUrl?: string | null;
  /** Unrendered edit (cuts, mute, text) — played live so the preview matches what ships */
  edit?: PreviewEdit;
  /** True when this is the feed asset standing in for a missing 9:16 upload */
  isFallback?: boolean;
}

/**
 * Reels (9:16) mockup at ~3/4 iPhone scale (280×498 media), laid out the
 * way Instagram renders a reels ad: action rail bottom-right, then CTA →
 * identity row → caption stacked bottom-left, with the "Followed by…" /
 * comment bar underneath the media. The CTA stays white (Instagram tints
 * it from the creative, which we don't try to match).
 */
export function IgReelsPreview({
  copy,
  ctaLabel,
  identityName,
  identitySub,
  mediaUrl,
  mediaKind,
  posterUrl,
  edit,
  isFallback,
}: Props) {
  const caption = copy.primaryText?.trim() || "Primary text shows here…";
  // Instagram tags plain ads "Ad" in the bottom bar; anything else
  // (e.g. "Paid partnership") is shown as given.
  const adTag = identitySub.trim().toLowerCase() === "sponsored" ? "Ad" : identitySub;
  const videoRef = useRef<HTMLVideoElement>(null);
  const { time } = useEditedPlayback(videoRef, edit?.clips, { enabled: !!edit });
  const [muted, setMuted] = useState(true);
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v || edit?.muted) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <div className="w-[280px] max-w-full">
      <div className="w-full rounded-2xl bg-black overflow-hidden shadow-sm">
        <div className="relative w-full h-[498px] bg-gray-900">
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
              loop={!edit?.clips}
              autoPlay
            />
          )}
          {mediaUrl && mediaKind === "video" && edit?.overlay?.(time)}
          {!mediaUrl && (
            <span className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
              9:16 creative
            </span>
          )}
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

          {/* Top chrome: back chevron, mute toggle */}
          <ChevronLeft className="absolute top-3 left-2 h-6 w-6 text-white drop-shadow" strokeWidth={2.25} />
          {mediaUrl && mediaKind === "video" && (
            <button
              type="button"
              onClick={toggleMute}
              className="absolute top-3 right-3 bg-black/60 hover:bg-black/75 text-white rounded-full p-1.5"
              aria-label={muted ? "Unmute video" : "Mute video"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}

          {/* Action rail */}
          <div className="absolute right-2.5 bottom-3 flex flex-col items-center gap-4 text-white drop-shadow">
            <div className="flex flex-col items-center gap-0.5">
              <Heart className="h-[22px] w-[22px]" strokeWidth={1.75} />
              <span className="text-[9px] leading-none">Likes</span>
            </div>
            <MessageCircle className="h-[22px] w-[22px] -scale-x-100" strokeWidth={1.75} />
            <Repeat2 className="h-[22px] w-[22px]" strokeWidth={1.75} />
            <Send className="h-[21px] w-[21px]" strokeWidth={1.75} />
            <Menu className="h-[20px] w-[20px]" strokeWidth={2} />
          </div>

          {/* CTA → identity → caption */}
          <div className="absolute left-3 right-12 bottom-3 text-white">
            <div className="flex items-center justify-between bg-white text-gray-900 rounded-lg px-3 h-[34px] text-[13px] font-semibold">
              <span className="truncate">{ctaLabel}</span>
              <ChevronRight className="h-4 w-4 flex-shrink-0" strokeWidth={2.5} />
            </div>
            <div className="flex items-center gap-2 mt-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-200 to-rose-300 flex-shrink-0" />
              <p className="text-[13px] font-semibold leading-tight truncate">{identityName}</p>
              <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0 fill-sky-500 text-white" strokeWidth={2} />
              <span className="flex-shrink-0 border border-white/80 rounded-md px-2 py-[3px] text-[11px] font-semibold leading-none">
                Follow
              </span>
            </div>
            <p className="text-[13px] leading-snug mt-2 truncate">{caption}</p>
          </div>
        </div>

        {/* Bottom bar: social proof + comment field */}
        <div className="bg-[#1c1c1e] px-3 pt-2 pb-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex -space-x-1.5 flex-shrink-0">
                <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-stone-300 to-stone-500 ring-1 ring-[#1c1c1e]" />
                <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 ring-1 ring-[#1c1c1e]" />
                <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-rose-200 to-rose-400 ring-1 ring-[#1c1c1e]" />
              </div>
              <p className="text-[10px] text-white/80 truncate">
                Followed by <span className="font-semibold text-white">friends</span> and others
              </p>
            </div>
            <span className="text-[10px] font-semibold text-white flex-shrink-0">{adTag}</span>
          </div>
          <div className="mt-2 h-8 rounded-full bg-[#2c2c2e] flex items-center px-3 text-[11px] text-white/50">
            Add comment…
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
