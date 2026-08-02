"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  file: File;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

const VIEW = 460; // max display size of the source image
/** Meta's recommended 1:1 resolution — below this an ad can look soft. */
const IDEAL = 1080;
/** Meta's hard minimum for a 1:1 feed image; the zoom never crops below it. */
const MIN_SRC_SIDE = 600;
/**
 * Ceiling on the export. Meta's own 1:1 guidance tops out at 1440, so this
 * leaves headroom without producing needlessly huge uploads (30MB limit).
 */
const MAX_OUTPUT = 2048;

type Corner = "nw" | "ne" | "sw" | "se";
interface Crop {
  x: number;
  y: number;
  size: number;
}

/**
 * Interactive 1:1 crop for feed images: drag the square to reposition it,
 * drag a corner (or the zoom slider) to tighten the framing.
 */
export function SquareCropDialog({ file, onCancel, onCropped }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, size: 0 });
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
  const maxSize = Math.min(dispW, dispH);
  const minSize = useMemo(
    () => Math.min(maxSize, Math.max(48, MIN_SRC_SIDE / scale)),
    [maxSize, scale]
  );

  const clampCrop = useCallback(
    (c: Crop): Crop => {
      const size = Math.max(minSize, Math.min(maxSize, c.size));
      return {
        size,
        x: Math.max(0, Math.min(dispW - size, c.x)),
        y: Math.max(0, Math.min(dispH - size, c.y)),
      };
    },
    [dispW, dispH, minSize, maxSize]
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
    // square follows whichever axis the pointer moved furthest along.
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const right = start.x + start.size;
    const bottom = start.y + start.size;

    let anchorX: number;
    let anchorY: number;
    let size: number;
    let limit: number;

    switch (mode) {
      case "se":
        anchorX = start.x;
        anchorY = start.y;
        size = Math.max(px - anchorX, py - anchorY);
        limit = Math.min(dispW - anchorX, dispH - anchorY);
        break;
      case "nw":
        anchorX = right;
        anchorY = bottom;
        size = Math.max(anchorX - px, anchorY - py);
        limit = Math.min(anchorX, anchorY);
        break;
      case "ne":
        anchorX = start.x;
        anchorY = bottom;
        size = Math.max(px - anchorX, anchorY - py);
        limit = Math.min(dispW - anchorX, anchorY);
        break;
      default: // "sw"
        anchorX = right;
        anchorY = start.y;
        size = Math.max(anchorX - px, py - anchorY);
        limit = Math.min(anchorX, dispH - anchorY);
        break;
    }

    size = Math.max(minSize, Math.min(limit, size));
    setCrop({
      size,
      x: mode === "nw" || mode === "sw" ? anchorX - size : anchorX,
      y: mode === "nw" || mode === "ne" ? anchorY - size : anchorY,
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  /** Zoom slider: resize around the crop's centre so framing holds. */
  const setZoomSize = (size: number) => {
    setCrop((prev) =>
      clampCrop({
        size,
        x: prev.x + (prev.size - size) / 2,
        y: prev.y + (prev.size - size) / 2,
      })
    );
  };

  const srcSide = Math.round(crop.size * scale);
  const soft = natural ? srcSide < IDEAL : false;
  /**
   * Export at the crop's own resolution rather than a fixed size: never
   * upscale (that invents no detail, just bytes) and never downscale unless
   * the crop is bigger than the ceiling.
   */
  const outputSide = Math.min(srcSide, MAX_OUTPUT);

  const confirm = useCallback(async () => {
    if (!natural || !imgRef.current || exporting) return;
    setExporting(true);
    try {
      const side = Math.round(crop.size * scale);
      const out = Math.min(side, MAX_OUTPUT);
      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      // Only matters when the crop exceeds the ceiling and gets scaled down;
      // browsers default to a cheap filter that visibly aliases fine detail.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        imgRef.current,
        Math.round(crop.x * scale),
        Math.round(crop.y * scale),
        side,
        side,
        0,
        0,
        out,
        out
      );

      // Keep PNG sources lossless — they're usually graphics or text, where
      // JPEG ringing is obvious. Photos stay JPEG at a high quality factor.
      const png = file.type === "image/png";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", png ? undefined : 0.92)
      );
      if (!blob) throw new Error("Could not export the crop");
      const ext = png ? "png" : "jpg";
      const name = `${file.name.replace(/\.[^.]+$/, "")}-1x1.${ext}`;
      onCropped(new File([blob], name, { type: png ? "image/png" : "image/jpeg" }));
    } catch {
      setExporting(false);
    }
  }, [natural, crop, scale, file, onCropped, exporting]);

  const handleCls =
    "absolute w-3.5 h-3.5 bg-white border border-gray-400 rounded-[2px] shadow-sm";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-5 max-w-[560px]">
        <p className="text-sm font-semibold text-gray-900">Crop to 1:1 for feed</p>
        <p className="text-[12px] text-gray-500 mb-4">
          Drag the square to reposition, drag a corner to zoom — everything dimmed gets cut.
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
                const w = el.naturalWidth >= el.naturalHeight
                  ? VIEW
                  : Math.round((el.naturalWidth / el.naturalHeight) * VIEW);
                const h = el.naturalWidth >= el.naturalHeight
                  ? Math.round((el.naturalHeight / el.naturalWidth) * VIEW)
                  : VIEW;
                const size = Math.min(w, h);
                setCrop({ size, x: (w - size) / 2, y: (h - size) / 2 });
              }}
              style={{ width: dispW, height: dispH }}
              className="block"
            />
          )}
          {natural && crop.size > 0 && (
            <div
              onPointerDown={beginDrag("move")}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="absolute border-2 border-white rounded-sm cursor-grab active:cursor-grabbing"
              style={{
                width: crop.size,
                height: crop.size,
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

        {natural && maxSize > minSize && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[11px] text-gray-400 w-8">Zoom</span>
            <input
              type="range"
              min={minSize}
              max={maxSize}
              step={1}
              // Inverted: dragging right shrinks the square, i.e. zooms in.
              value={minSize + maxSize - crop.size}
              onChange={(e) => setZoomSize(minSize + maxSize - Number(e.target.value))}
              className="flex-1"
            />
          </div>
        )}
        {natural && (
          <p className="text-[11px] text-gray-400 mt-1.5">
            Exports at {outputSide}&times;{outputSide}
            {srcSide > MAX_OUTPUT && ` (crop is ${srcSide}px, capped)`}
          </p>
        )}
        {soft && (
          <p className="text-[11px] text-amber-700 mt-1">
            {srcSide < MIN_SRC_SIDE
              ? `Only ${srcSide}px — under Meta's 600px minimum, so this image may be rejected.`
              : crop.size >= maxSize - 1
                ? // Already fully zoomed out — the source itself is the limit.
                  `This image is only ${srcSide}px on its short side, under Meta's ${IDEAL}px ideal, so the ad may look slightly soft.`
                : `This crop is ${srcSide}px wide — below Meta's ${IDEAL}px ideal, so the ad may look slightly soft. Zoom out a little for a sharper export.`}
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
