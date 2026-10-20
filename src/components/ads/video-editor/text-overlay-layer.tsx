"use client";

import { useEffect, useRef, useState } from "react";
import type { TextOverlay } from "@/types/meta-ads";
import { OVERLAY_FONTS, OVERLAY_LINE_HEIGHT } from "@/lib/video-overlay-render";
import { overlayVisible } from "@/lib/video-edit";

/** CSS for one overlay at a given displayed frame width — mirrors drawOverlays(). */
export function overlayTextStyle(o: TextOverlay, dispW: number): React.CSSProperties {
  const f = OVERLAY_FONTS[o.font] || OVERLAY_FONTS["sans-bold"];
  return {
    fontFamily: f.family,
    fontWeight: f.weight,
    fontStyle: f.style,
    fontSize: o.size * dispW,
    lineHeight: OVERLAY_LINE_HEIGHT,
    color: o.color,
    whiteSpace: "pre",
    textAlign: "center",
  };
}

/**
 * Read-only overlay layer for thumbnails and previews. Mirrors `object-fit`
 * on the video underneath so text sits where it will be burned in. With
 * `time` (output seconds), only text on screen at that moment is shown.
 */
export function TextOverlayLayer({
  overlays,
  frameW,
  frameH,
  fit = "cover",
  time,
}: {
  overlays: TextOverlay[];
  frameW: number;
  frameH: number;
  fit?: "cover" | "contain";
  time?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setBox({ w: e.contentRect.width, h: e.contentRect.height })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let frame: React.ReactNode = null;
  if (box && frameW && frameH) {
    const scale =
      fit === "cover"
        ? Math.max(box.w / frameW, box.h / frameH)
        : Math.min(box.w / frameW, box.h / frameH);
    const dispW = frameW * scale;
    const dispH = frameH * scale;
    frame = (
      <div
        className="absolute"
        style={{ width: dispW, height: dispH, left: (box.w - dispW) / 2, top: (box.h - dispH) / 2 }}
      >
        {overlays
          .filter((o) => time === undefined || overlayVisible(o, time))
          .map((o) => (
            <div
              key={o.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: o.x * dispW, top: o.y * dispH, ...overlayTextStyle(o, dispW) }}
            >
              {o.text}
            </div>
          ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden pointer-events-none">
      {frame}
    </div>
  );
}
