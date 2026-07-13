"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  file: File;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

const VIEW = 460; // max display size of the source image
const OUTPUT = 1080; // exported square size

/**
 * Interactive 1:1 crop for feed images: the square spans the image's short
 * side; drag it along the long axis to choose what survives the crop.
 */
export function SquareCropDialog({ file, onCancel, onCropped }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startPointer: number; startOffset: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const landscape = natural ? natural.w >= natural.h : true;
  const dispW = natural ? (landscape ? VIEW : Math.round((natural.w / natural.h) * VIEW)) : VIEW;
  const dispH = natural ? (landscape ? Math.round((natural.h / natural.w) * VIEW) : VIEW) : VIEW;
  const side = Math.min(dispW, dispH);
  const maxOffset = (landscape ? dispW : dispH) - side;

  const clamp = useCallback(
    (v: number) => Math.max(0, Math.min(maxOffset, v)),
    [maxOffset]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startPointer: landscape ? e.clientX : e.clientY,
      startOffset: offset,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const pointer = landscape ? e.clientX : e.clientY;
    setOffset(clamp(dragRef.current.startOffset + (pointer - dragRef.current.startPointer)));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const confirm = useCallback(async () => {
    if (!natural || !imgRef.current || exporting) return;
    setExporting(true);
    try {
      const scale = (landscape ? natural.w : natural.h) / (landscape ? dispW : dispH);
      const srcSide = Math.round(side * scale);
      const srcX = landscape ? Math.round(offset * scale) : 0;
      const srcY = landscape ? 0 : Math.round(offset * scale);

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(imgRef.current, srcX, srcY, srcSide, srcSide, 0, 0, OUTPUT, OUTPUT);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );
      if (!blob) throw new Error("Could not export the crop");
      const name = file.name.replace(/\.[^.]+$/, "") + "-1x1.jpg";
      onCropped(new File([blob], name, { type: "image/jpeg" }));
    } catch {
      setExporting(false);
    }
  }, [natural, landscape, dispW, dispH, side, offset, file, onCropped, exporting]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-5 max-w-[560px]">
        <p className="text-sm font-semibold text-gray-900">Crop to 1:1 for feed</p>
        <p className="text-[12px] text-gray-500 mb-4">
          Drag the square to choose the crop — everything dimmed gets cut.
        </p>

        <div
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
                setOffset(0);
              }}
              style={{ width: dispW, height: dispH }}
              className="block"
            />
          )}
          {natural && (
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="absolute border-2 border-white rounded-sm cursor-grab active:cursor-grabbing"
              style={{
                width: side,
                height: side,
                left: landscape ? offset : 0,
                top: landscape ? 0 : offset,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              }}
            >
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-60">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="border border-white/30" />
                ))}
              </div>
            </div>
          )}
        </div>

        {natural && maxOffset > 0 && (
          <input
            type="range"
            min={0}
            max={maxOffset}
            value={offset}
            onChange={(e) => setOffset(clamp(Number(e.target.value)))}
            className="w-full mt-3"
          />
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
