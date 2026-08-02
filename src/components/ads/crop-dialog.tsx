"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  file: File;
  /** Target aspect as width / height — 1 for feed, 9/16 for stories & reels. */
  aspect: number;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

const VIEW = 460; // max display size of the source image
/** Meta's recommended short edge — below this an ad can look soft. */
const IDEAL_SHORT = 1080;
/** Meta's hard minimum short edge for an image ad; the zoom never goes below. */
const MIN_SRC_SHORT = 600;
/** Export ceilings. Meta's own guidance tops out well below these. */
const MAX_SHORT = 2048;
const MAX_LONG = 2560;

type Corner = "nw" | "ne" | "sw" | "se";
/** Crop rect in display pixels; height is derived from `w` and the aspect. */
interface Crop {
  x: number;
  y: number;
  w: number;
}

export function ratioLabel(aspect: number): string {
  if (Math.abs(aspect - 1) < 0.01) return "1:1";
  if (Math.abs(aspect - 9 / 16) < 0.01) return "9:16";
  return aspect.toFixed(2);
}

/**
 * Interactive fixed-ratio crop: drag the frame to reposition it, drag a
 * corner (or the zoom slider) to tighten the framing.
 */
export function CropDialog({ file, aspect, onCancel, onCropped }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, w: 0 });
  const [exporting, setExporting] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: "move" | Corner;
    startClientX: number;
    startClientY: number;
    start: Crop;
  } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const landscape = natural ? natural.w >= natural.h : true;
  const dispW = natural ? (landscape ? VIEW : Math.round((natural.w / natural.h) * VIEW)) : VIEW;
  const dispH = natural ? (landscape ? Math.round((natural.h / natural.w) * VIEW) : VIEW) : VIEW;
  /** Source pixels per displayed pixel (uniform — the preview keeps aspect). */
  const scale = natural ? natural.w / dispW : 1;
  const cropH = useCallback((w: number) => w / aspect, [aspect]);
  /** Widest crop of this ratio that still fits inside the image. */
  const maxW = Math.min(dispW, dispH * aspect);
  const minW = useMemo(
    () => Math.min(maxW, Math.max(32, (MIN_SRC_SHORT * Math.max(1, aspect)) / scale)),
    [maxW, aspect, scale]
  );

  const clampCrop = useCallback(
    (c: Crop): Crop => {
      const w = Math.max(minW, Math.min(maxW, c.w));
      const h = cropH(w);
      return {
        w,
        x: Math.max(0, Math.min(dispW - w, c.x)),
        y: Math.max(0, Math.min(dispH - h, c.y)),
      };
    },
    [dispW, dispH, minW, maxW, cropH]
  );

  const beginDrag = (mode: "move" | Corner) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      start: crop,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { mode, start } = drag;

    if (mode === "move") {
      setCrop(
        clampCrop({
          ...start,
          x: start.x + (e.clientX - drag.startClientX),
          y: start.y + (e.clientY - drag.startClientY),
        })
      );
      return;
    }

    // Resize: the corner opposite the one being dragged stays pinned, and the
    // frame follows whichever axis the pointer moved furthest along.
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const right = start.x + start.w;
    const bottom = start.y + cropH(start.w);

    let anchorX: number;
    let anchorY: number;
    let w: number;
    let limit: number;

    switch (mode) {
      case "se":
        anchorX = start.x;
        anchorY = start.y;
        w = Math.max(px - anchorX, (py - anchorY) * aspect);
        limit = Math.min(dispW - anchorX, (dispH - anchorY) * aspect);
        break;
      case "nw":
        anchorX = right;
        anchorY = bottom;
        w = Math.max(anchorX - px, (anchorY - py) * aspect);
        limit = Math.min(anchorX, anchorY * aspect);
        break;
      case "ne":
        anchorX = start.x;
        anchorY = bottom;
        w = Math.max(px - anchorX, (anchorY - py) * aspect);
        limit = Math.min(dispW - anchorX, anchorY * aspect);
        break;
      default: // "sw"
        anchorX = right;
        anchorY = start.y;
        w = Math.max(anchorX - px, (py - anchorY) * aspect);
        limit = Math.min(anchorX, (dispH - anchorY) * aspect);
        break;
    }

    w = Math.max(minW, Math.min(limit, w));
    setCrop({
      w,
      x: mode === "nw" || mode === "sw" ? anchorX - w : anchorX,
      y: mode === "nw" || mode === "ne" ? anchorY - cropH(w) : anchorY,
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  /** Zoom slider: resize around the frame's centre so framing holds. */
  const setZoomWidth = (w: number) => {
    setCrop((prev) =>
      clampCrop({
        w,
        x: prev.x + (prev.w - w) / 2,
        y: prev.y + (cropH(prev.w) - cropH(w)) / 2,
      })
    );
  };

  /** Export size: the crop's own resolution, never upscaled, capped. */
  const exportSize = useCallback(
    (cropWidth: number) => {
      const srcW = cropWidth * scale;
      const srcH = srcW / aspect;
      const short = Math.min(srcW, srcH);
      const long = Math.max(srcW, srcH);
      const factor = Math.min(1, MAX_SHORT / short, MAX_LONG / long);
      return { w: Math.round(srcW * factor), h: Math.round(srcH * factor), srcW, srcH };
    },
    [scale, aspect]
  );

  const out = exportSize(crop.w);
  const srcShort = Math.round(Math.min(out.srcW, out.srcH));
  const soft = natural ? srcShort < IDEAL_SHORT : false;
  const capped = out.w < Math.round(out.srcW);

  const confirm = useCallback(async () => {
    if (!natural || !imgRef.current || exporting) return;
    setExporting(true);
    try {
      const { w: outW, h: outH } = exportSize(crop.w);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        imgRef.current,
        Math.round(crop.x * scale),
        Math.round(crop.y * scale),
        Math.round(crop.w * scale),
        Math.round(cropH(crop.w) * scale),
        0,
        0,
        outW,
        outH
      );

      // Keep PNG sources lossless — they're usually graphics or text, where
      // JPEG ringing is obvious. Photos stay JPEG at a high quality factor.
      const png = file.type === "image/png";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", png ? undefined : 0.92)
      );
      if (!blob) throw new Error("Could not export the crop");
      const ext = png ? "png" : "jpg";
      const tag = ratioLabel(aspect).replace(":", "x");
      const name = `${file.name.replace(/\.[^.]+$/, "")}-${tag}.${ext}`;
      onCropped(new File([blob], name, { type: png ? "image/png" : "image/jpeg" }));
    } catch {
      setExporting(false);
    }
  }, [natural, crop, scale, aspect, cropH, exportSize, file, onCropped, exporting]);

  const handleCls =
    "absolute w-3.5 h-3.5 bg-white border border-gray-400 rounded-[2px] shadow-sm";
  const label = ratioLabel(aspect);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-5 max-w-[560px]">
        <p className="text-sm font-semibold text-gray-900">
          Crop to {label} for {label === "1:1" ? "feed" : "stories & reels"}
        </p>
        <p className="text-[12px] text-gray-500 mb-4">
          Drag the frame to reposition, drag a corner to zoom — everything dimmed gets cut.
        </p>

        <div
          ref={frameRef}
          className="relative mx-auto overflow-hidden rounded-lg bg-gray-100 select-none touch-none"
          style={{ width: dispW, height: dispH }}
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={src}
              alt="Crop source"
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget;
                setNatural({ w: el.naturalWidth, h: el.naturalHeight });
                const wide = el.naturalWidth >= el.naturalHeight;
                const w = wide ? VIEW : Math.round((el.naturalWidth / el.naturalHeight) * VIEW);
                const h = wide ? Math.round((el.naturalHeight / el.naturalWidth) * VIEW) : VIEW;
                const cw = Math.min(w, h * aspect);
                setCrop({ w: cw, x: (w - cw) / 2, y: (h - cw / aspect) / 2 });
              }}
              style={{ width: dispW, height: dispH }}
              className="block"
            />
          )}
          {natural && crop.w > 0 && (
            <div
              onPointerDown={beginDrag("move")}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="absolute border-2 border-white rounded-sm cursor-grab active:cursor-grabbing"
              style={{
                width: crop.w,
                height: cropH(crop.w),
                left: crop.x,
                top: crop.y,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              }}
            >
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-60">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="border border-white/30" />
                ))}
              </div>
              {(
                [
                  ["nw", "-top-2 -left-2 cursor-nwse-resize"],
                  ["ne", "-top-2 -right-2 cursor-nesw-resize"],
                  ["sw", "-bottom-2 -left-2 cursor-nesw-resize"],
                  ["se", "-bottom-2 -right-2 cursor-nwse-resize"],
                ] as [Corner, string][]
              ).map(([corner, pos]) => (
                <div
                  key={corner}
                  onPointerDown={beginDrag(corner)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  className={`${handleCls} ${pos}`}
                />
              ))}
            </div>
          )}
        </div>

        {natural && maxW > minW && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[11px] text-gray-400 w-8">Zoom</span>
            <input
              type="range"
              min={minW}
              max={maxW}
              step={1}
              // Inverted: dragging right shrinks the frame, i.e. zooms in.
              value={minW + maxW - crop.w}
              onChange={(e) => setZoomWidth(minW + maxW - Number(e.target.value))}
              className="flex-1"
            />
          </div>
        )}
        {natural && (
          <p className="text-[11px] text-gray-400 mt-1.5">
            Exports at {out.w}&times;{out.h}
            {capped && ` (crop is ${Math.round(out.srcW)}px wide, capped)`}
          </p>
        )}
        {soft && (
          <p className="text-[11px] text-amber-700 mt-1">
            {srcShort < MIN_SRC_SHORT
              ? `Only ${srcShort}px on the short edge — under Meta's ${MIN_SRC_SHORT}px minimum, so this image may be rejected.`
              : crop.w >= maxW - 1
                ? `This image gives ${srcShort}px on the short edge, under Meta's ${IDEAL_SHORT}px ideal, so the ad may look slightly soft.`
                : `This crop is ${srcShort}px on the short edge — below Meta's ${IDEAL_SHORT}px ideal, so the ad may look slightly soft. Zoom out a little for a sharper export.`}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="border border-gray-300 rounded-md px-4 py-1.5 text-[13px] text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!natural || exporting}
            className="bg-gray-900 text-white rounded-md px-4 py-1.5 text-[13px] font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5"
          >
            {exporting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Crop &amp; use
          </button>
        </div>
      </div>
    </div>
  );
}
