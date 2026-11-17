"use client";

import { useRef } from "react";

function parsePosition(pos: string): { x: number; y: number } {
  const [x, y] = pos.split(" ").map((v) => parseFloat(v));
  return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 50 };
}

// An image shown in its page crop; drag to choose which part of the photo
// shows. Used for the selects-page hero banners and per-product campaign images.
// object-position % maps to the overflow, so pointer movement is scaled by it.
export function ImagePositionFrame({
  url,
  aspect,
  position,
  onPositionChange,
  alt,
  children,
}: {
  url: string;
  aspect: string;
  position: string;
  onPositionChange: (next: string) => void;
  alt: string;
  children?: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ startX: number; startY: number; pos: { x: number; y: number } } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, label")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, pos: parsePosition(position) };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!d || !frame || !img || !img.naturalWidth) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const scale = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
    const overflowX = img.naturalWidth * scale - fw;
    const overflowY = img.naturalHeight * scale - fh;
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(100, v)));
    const x = overflowX > 1 ? clamp(d.pos.x - ((e.clientX - d.startX) / overflowX) * 100) : d.pos.x;
    const y = overflowY > 1 ? clamp(d.pos.y - ((e.clientY - d.startY) / overflowY) * 100) : d.pos.y;
    onPositionChange(`${x}% ${y}%`);
  }

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden rounded-md border cursor-move select-none touch-none"
      style={{ aspectRatio: aspect }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      // Parents may be HTML5-draggable (pool rows reorder by drag); a
      // reposition drag must not start one of those.
      draggable={false}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
      title="Drag to reposition"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        draggable={false}
        className="w-full h-full object-cover pointer-events-none"
        style={{ objectPosition: position }}
      />
      {children}
    </div>
  );
}
