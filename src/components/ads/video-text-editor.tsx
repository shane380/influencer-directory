"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { OverlayFont, TextOverlay } from "@/types/meta-ads";
import { OVERLAY_FONTS, OVERLAY_LINE_HEIGHT } from "@/lib/video-overlay-render";

/**
 * iPhone screen width in CSS px. The editor shows the video at the size it's
 * actually seen on a phone (a 9:16 Reel fills the screen, a 1:1 feed post spans
 * its width), so text size reads true. Shrinks only if the window is too short.
 */
const PHONE_W = 390;
/** Vertical room the dialog's header, padding and buttons need. */
const DIALOG_CHROME_H = 190;
const COLORS = ["#ffffff", "#000000", "#f5e6d3", "#c8a27a", "#e11d48", "#facc15"];
/** Font size limits as a fraction of frame width */
const MIN_SIZE = 0.025;
const MAX_SIZE = 0.3;
/** Reels UI covers roughly the top 14% and bottom 35% of a 9:16 frame. */
const SAFE_TOP = 0.14;
const SAFE_BOTTOM = 0.35;

let overlayCounter = 0;
export const newOverlayId = () => `txt-${Date.now()}-${overlayCounter++}`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function textStyle(o: TextOverlay, dispW: number): React.CSSProperties {
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
 * on the video underneath so text sits where it will be burned in.
 */
export function TextOverlayLayer({
  overlays,
  frameW,
  frameH,
  fit = "cover",
}: {
  overlays: TextOverlay[];
  frameW: number;
  frameH: number;
  fit?: "cover" | "contain";
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
        {overlays.map((o) => (
          <div
            key={o.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: o.x * dispW, top: o.y * dispH, ...textStyle(o, dispW) }}
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

interface Props {
  videoUrl: string;
  initial: TextOverlay[];
  /** Show Reels safe-zone guides (stories & reels slot) */
  vertical: boolean;
  onCancel: () => void;
  onSave: (overlays: TextOverlay[], frame: { w: number; h: number }) => void;
}

/**
 * Add, drag and resize static text on a video. Geometry is stored relative to
 * the video frame; the burn-in happens later, at full resolution, on submit.
 */
export function VideoTextEditor({ videoUrl, initial, vertical, onCancel, onSave }: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [overlays, setOverlays] = useState<TextOverlay[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const frameRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    start: TextOverlay;
    /** resize: distance from the text centre at pointer-down */
    startDist: number;
  } | null>(null);

  const [maxH, setMaxH] = useState(800);
  useEffect(() => {
    const update = () => setMaxH(Math.max(320, window.innerHeight - DIALOG_CHROME_H));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const aspect = natural ? natural.w / natural.h : 9 / 16;
  const fitScale = Math.min(1, maxH / (PHONE_W / aspect));
  const dispW = Math.round(PHONE_W * fitScale);
  const dispH = Math.round((PHONE_W / aspect) * fitScale);
  const isNineSixteen = !!natural && Math.abs(natural.w / natural.h / (9 / 16) - 1) < 0.05;

  const selected = overlays.find((o) => o.id === selectedId) || null;
  const patch = useCallback(
    (id: string, p: Partial<TextOverlay>) =>
      setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...p } : o))),
    []
  );

  const addText = () => {
    const o: TextOverlay = {
      id: newOverlayId(),
      text: "Your text",
      font: selected?.font || "sans-bold",
      color: selected?.color || "#ffffff",
      x: 0.5,
      // Land new text clear of the Reels caption area on vertical videos.
      y: vertical ? 0.42 : 0.5,
      size: 0.08,
    };
    setOverlays((prev) => [...prev, o]);
    setSelectedId(o.id);
    requestAnimationFrame(() => textareaRef.current?.select());
  };

  const remove = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    setSelectedId(null);
  };

  const beginDrag = (o: TextOverlay, mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(o.id);
    const rect = frameRef.current?.getBoundingClientRect();
    const cx = (rect?.left ?? 0) + o.x * dispW;
    const cy = (rect?.top ?? 0) + o.y * dispH;
    dragRef.current = {
      id: o.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      start: o,
      startDist: Math.max(4, Math.hypot(e.clientX - cx, e.clientY - cy)),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "move") {
      patch(d.id, {
        x: clamp(d.start.x + (e.clientX - d.startX) / dispW, 0, 1),
        y: clamp(d.start.y + (e.clientY - d.startY) / dispH, 0, 1),
      });
    } else {
      const rect = frameRef.current?.getBoundingClientRect();
      const cx = (rect?.left ?? 0) + d.start.x * dispW;
      const cy = (rect?.top ?? 0) + d.start.y * dispH;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      patch(d.id, { size: clamp((d.start.size * dist) / d.startDist, MIN_SIZE, MAX_SIZE) });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  // Delete/Backspace removes the selected box when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) remove(selectedId);
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onCancel]);

  const handleCls = "absolute w-3 h-3 bg-white border border-gray-500 rounded-[2px] shadow-sm";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-5 max-w-[900px] w-full max-h-[98vh] overflow-auto">
        <p className="text-sm font-semibold text-gray-900">Text on video</p>
        <p className="text-[12px] text-gray-500 mb-4">
          Drag text to move it, drag the corner handle to resize. It&apos;s burned in at full
          quality when you submit.
        </p>

        <div className="flex gap-5 flex-wrap">
          <div
            ref={frameRef}
            onPointerDown={() => setSelectedId(null)}
            className="relative overflow-hidden rounded-lg bg-gray-900 select-none touch-none flex-shrink-0"
            style={{ width: dispW, height: dispH }}
          >
            <video
              src={videoUrl}
              className="absolute inset-0 w-full h-full"
              muted
              playsInline
              loop
              autoPlay
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth && v.videoHeight) setNatural({ w: v.videoWidth, h: v.videoHeight });
              }}
            />
            {vertical && isNineSixteen && (
              <>
                <div
                  className="absolute inset-x-0 top-0 bg-black/25 border-b border-dashed border-white/60 pointer-events-none"
                  style={{ height: SAFE_TOP * dispH }}
                />
                <div
                  className="absolute inset-x-0 bottom-0 bg-black/25 border-t border-dashed border-white/60 pointer-events-none flex items-end justify-center pb-1"
                  style={{ height: SAFE_BOTTOM * dispH }}
                >
                  <span className="text-[10px] text-white/80">Covered by Reels UI</span>
                </div>
              </>
            )}
            {natural &&
              overlays.map((o) => {
                const isSel = o.id === selectedId;
                return (
                  <div
                    key={o.id}
                    onPointerDown={beginDrag(o, "move")}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move px-0.5 ${
                      isSel ? "outline outline-1 outline-dashed outline-white" : ""
                    }`}
                    style={{ left: o.x * dispW, top: o.y * dispH, ...textStyle(o, dispW) }}
                  >
                    {o.text || " "}
                    {isSel && (
                      <div
                        onPointerDown={beginDrag(o, "resize")}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        className={`${handleCls} -bottom-1.5 -right-1.5 cursor-nwse-resize`}
                      />
                    )}
                  </div>
                );
              })}
          </div>

          <div className="flex-1 min-w-[220px] space-y-3">
            <button
              type="button"
              onClick={addText}
              disabled={!natural}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add text
            </button>

            {selected ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Text</label>
                  <textarea
                    ref={textareaRef}
                    value={selected.text}
                    onChange={(e) => patch(selected.id, { text: e.target.value })}
                    rows={3}
                    className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Font</label>
                  <select
                    value={selected.font}
                    onChange={(e) => patch(selected.id, { font: e.target.value as OverlayFont })}
                    className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-[13px]"
                  >
                    {(Object.keys(OVERLAY_FONTS) as OverlayFont[]).map((k) => (
                      <option key={k} value={k}>
                        {OVERLAY_FONTS[k].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Colour</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => patch(selected.id, { color: c })}
                        className={`w-6 h-6 rounded-full border ${
                          selected.color.toLowerCase() === c
                            ? "ring-2 ring-offset-1 ring-gray-900 border-gray-300"
                            : "border-gray-300"
                        }`}
                        style={{ background: c }}
                        aria-label={`Colour ${c}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={selected.color}
                      onChange={(e) => patch(selected.id, { color: e.target.value })}
                      className="w-7 h-7 p-0 border-0 bg-transparent cursor-pointer"
                      aria-label="Custom colour"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Size</label>
                  <input
                    type="range"
                    min={MIN_SIZE}
                    max={MAX_SIZE}
                    step={0.001}
                    value={selected.size}
                    onChange={(e) => patch(selected.id, { size: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(selected.id)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove this text
                </button>
              </div>
            ) : (
              <p className="text-[12px] text-gray-400">
                {overlays.length ? "Click a text box to edit it." : "No text yet."}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="text-[13px] px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!natural}
            onClick={() =>
              natural &&
              onSave(
                overlays.filter((o) => o.text.trim()),
                natural
              )
            }
            className="text-[13px] px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Save text
          </button>
        </div>
      </div>
    </div>
  );
}
