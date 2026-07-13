"use client";

import { useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { AdCopy } from "@/types/meta-ads";

export interface CarouselPreviewCard {
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  posterUrl?: string | null;
  headline?: string | null;
}

interface Props {
  copy: AdCopy;
  ctaLabel: string;
  identityName: string;
  identitySub: string;
  cards: CarouselPreviewCard[];
}

function CardMedia({ card }: { card: CarouselPreviewCard }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <div className="relative w-full h-full">
      {card.mediaUrl && card.mediaKind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.mediaUrl} alt="Card creative" className="w-full h-full object-cover" />
      )}
      {card.mediaUrl && card.mediaKind === "video" && (
        <>
          <video
            ref={videoRef}
            src={card.mediaUrl}
            poster={card.posterUrl || undefined}
            className="w-full h-full object-cover"
            muted
            playsInline
            loop
            autoPlay
          />
          <button
            type="button"
            onClick={toggleMute}
            className="absolute bottom-2.5 right-2.5 bg-black/60 hover:bg-black/75 text-white rounded-full p-1.5"
            aria-label={muted ? "Unmute video" : "Mute video"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </>
      )}
      {!card.mediaUrl && (
        <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
          Card creative
        </div>
      )}
    </div>
  );
}

/**
 * Instagram feed carousel mockup (375px content width): square cards in a
 * scroll-snap strip with dot indicators, rendering the actual uploads.
 */
export function IgCarouselPreview({ copy, ctaLabel, identityName, identitySub, cards }: Props) {
  const caption = copy.primaryText?.trim() || "Primary text shows here…";
  const truncated = caption.length > 125 ? `${caption.slice(0, 125)}` : caption;
  const [activeIdx, setActiveIdx] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = stripRef.current;
    if (!el || !el.clientWidth) return;
    setActiveIdx(Math.min(cards.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
  };

  return (
    <div className="w-[375px] max-w-full rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-200 to-rose-300 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-gray-900 leading-tight truncate">{identityName}</p>
          <p className="text-[12px] text-gray-400 leading-tight truncate">{identitySub}</p>
        </div>
        <span className="ml-auto text-gray-400 text-[12px] font-medium">
          {activeIdx + 1}/{cards.length}
        </span>
      </div>
      <div
        ref={stripRef}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {cards.map((card, i) => (
          <div key={i} className="w-full flex-shrink-0 snap-center aspect-square bg-gray-100">
            <CardMedia card={card} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3.5 py-3 bg-gray-50 border-y border-gray-100">
        <span className="text-[14px] font-semibold text-gray-900 truncate">
          {cards[activeIdx]?.headline || ctaLabel}
        </span>
        <span className="text-gray-500 text-base flex-shrink-0">›</span>
      </div>
      <div className="flex items-center px-3.5 pt-2.5 text-gray-800 text-[18px] leading-none relative">
        <span className="flex gap-4">
          <span>♡</span>
          <span>◌</span>
          <span>➦</span>
        </span>
        <span className="absolute left-1/2 -translate-x-1/2 flex gap-1">
          {cards.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i === activeIdx ? "bg-blue-500" : "bg-gray-300"}`}
            />
          ))}
        </span>
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
