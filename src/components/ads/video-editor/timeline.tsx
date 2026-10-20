"use client";

import { useEffect, useRef, useState } from "react";
import type { TextOverlay } from "@/types/meta-ads";
import { MIN_CLIP, clipLength, clipOffsets, outputDuration } from "@/lib/video-edit";
import type { DocUpdate, EditorDoc, Thumb } from "./types";

const RULER_H = 18;
const CLIP_H = 48;
const TEXT_H = 20;
const HANDLE_W = 8;
/** Snap distance for text bar edges, in px. */
const SNAP_PX = 6;
/** Below this a pointer-down/up is a click, not a drag. */
const CLICK_PX = 4;

type Gesture =
  | { kind: "seek" }
  | { kind: "trim"; id: string; side: "start" | "end"; x0: number; start0: number; end0: number; pps: number }
  | { kind: "move"; id: string; x0: number; dx: number; target: number; pps: number }
  | {
      kind: "text";
      id: string;
      mode: "move" | "start" | "end";
      x0: number;
      start0: number;
      end0: number;
      pps: number;
    };

interface Props {
  doc: EditorDoc;
  sourceDuration: number;
  time: number;
  thumbs: Thumb[];
  /** Video width / height, for filmstrip tile width */
  aspect: number;
  selectedClipId: string | null;
  selectedTextId: string | null;
  onSelectClip: (id: string | null) => void;
  onSelectText: (id: string | null) => void;
  onSeek: (t: number) => void;
  onBegin: () => void;
  onPreview: (update: DocUpdate) => void;
  onCommit: () => void;
  onApply: (update: DocUpdate) => void;
}

/**
 * CapCut-style timeline: clips back to back (trim by the edge handles, drag to
 * reorder), one bar per text (drag to move, drag an end to change in/out), and
 * a playhead you can scrub from the ruler.
 */
export function Timeline({
  doc,
  sourceDuration,
  time,
  thumbs,
  aspect,
  selectedClipId,
  selectedTextId,
  onSelectClip,
  onSelectText,
  onSeek,
  onBegin,
  onPreview,
  onCommit,
  onApply,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [gesture, setGesture] = useState<Gesture | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { clips, overlays } = doc;
  const total = Math.max(0.1, outputDuration(clips));
  // Scale is frozen while trimming so the clip under the cursor doesn't
  // stretch away from it as the total length changes.
  const pps = gesture && "pps" in gesture ? gesture.pps : width / total;
  const offsets = clipOffsets(clips);

  const xToTime = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    return Math.min(total, Math.max(0, (clientX - (rect?.left ?? 0)) / pps));
  };

  /** Insertion index for a dragged clip whose centre is at output time `t`. */
  const insertionIndex = (dragIndex: number, centreT: number) => {
    let idx = 0;
    clips.forEach((c, i) => {
      if (i === dragIndex) return;
      if (centreT > offsets[i] + clipLength(c) / 2) idx++;
    });
    return idx;
  };

  const snapTime = (t: number, exclude?: string) => {
    const cands = [0, total, time, ...offsets, ...overlays.filter((o) => o.id !== exclude).flatMap((o) => [o.start ?? 0, o.end ?? total])];
    let best = t;
    let bestD = SNAP_PX / pps;
    for (const c of cands) {
      const d = Math.abs(c - t);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  };

  const capture = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const g = gesture;
    if (!g) return;
    if (g.kind === "seek") {
      onSeek(xToTime(e.clientX));
    } else if (g.kind === "trim") {
      const dt = (e.clientX - g.x0) / g.pps;
      onPreview((d) => ({
        ...d,
        clips: d.clips.map((c) =>
          c.id !== g.id
            ? c
            : g.side === "start"
              ? { ...c, start: round(Math.min(Math.max(0, g.start0 + dt), g.end0 - MIN_CLIP)) }
              : { ...c, end: round(Math.max(Math.min(sourceDuration, g.end0 + dt), g.start0 + MIN_CLIP)) }
        ),
      }));
    } else if (g.kind === "move") {
      const dx = e.clientX - g.x0;
      const i = clips.findIndex((c) => c.id === g.id);
      const centre = offsets[i] + clipLength(clips[i]) / 2 + dx / g.pps;
      setGesture({ ...g, dx, target: insertionIndex(i, centre) });
    } else if (g.kind === "text") {
      const dt = (e.clientX - g.x0) / g.pps;
      onPreview((d) => ({
        ...d,
        overlays: d.overlays.map((o) => {
          if (o.id !== g.id) return o;
          if (g.mode === "move") {
            const len = g.end0 - g.start0;
            let s = Math.min(Math.max(0, g.start0 + dt), total - len);
            const snappedS = snapTime(s, o.id);
            const snappedE = snapTime(s + len, o.id);
            if (snappedS !== s) s = snappedS;
            else if (snappedE !== s + len) s = snappedE - len;
            return { ...o, start: round(s), end: round(s + len) };
          }
          if (g.mode === "start") {
            const s = snapTime(Math.min(Math.max(0, g.start0 + dt), g.end0 - MIN_CLIP), o.id);
            return { ...o, start: round(s), end: g.end0 };
          }
          const en = snapTime(Math.max(Math.min(total, g.end0 + dt), g.start0 + MIN_CLIP), o.id);
          return { ...o, start: g.start0, end: round(en) };
        }),
      }));
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const g = gesture;
    setGesture(null);
    if (!g) return;
    if (g.kind === "move") {
      if (Math.abs(e.clientX - g.x0) < CLICK_PX) {
        onSelectClip(g.id);
        return;
      }
      const from = clips.findIndex((c) => c.id === g.id);
      if (from !== g.target) {
        onApply((d) => {
          const next = [...d.clips];
          const [moved] = next.splice(from, 1);
          next.splice(g.target, 0, moved);
          return { ...d, clips: next };
        });
      }
      onSelectClip(g.id);
    } else if (g.kind === "trim" || g.kind === "text") {
      if (g.kind === "text") {
        // Full-length text goes back to "whole video" so later cuts keep it full length.
        onPreview((d) => ({
          ...d,
          overlays: d.overlays.map((o) =>
            o.id === g.id && (o.start ?? 0) <= 0.01 && (o.end ?? total) >= total - 0.01
              ? { ...o, start: undefined, end: undefined }
              : o
          ),
        }));
      }
      onCommit();
    }
  };

  const tileW = Math.max(16, CLIP_H * aspect);
  const thumbAt = (t: number) => {
    if (!thumbs.length) return null;
    let best = thumbs[0];
    for (const th of thumbs) if (Math.abs(th.t - t) < Math.abs(best.t - t)) best = th;
    return best.url;
  };

  const step = total > 40 ? 10 : total > 15 ? 5 : total > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= total + 0.001; t += step) ticks.push(t);

  const height = RULER_H + CLIP_H + 6 + overlays.length * (TEXT_H + 3);
  const dragging = gesture?.kind === "move" ? gesture : null;

  return (
    <div
      ref={wrapRef}
      className="relative select-none touch-none"
      style={{ height }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* Ruler — click or drag to scrub */}
      <div
        className="absolute inset-x-0 top-0 cursor-pointer border-b border-gray-200"
        style={{ height: RULER_H }}
        onPointerDown={(e) => {
          capture(e);
          setGesture({ kind: "seek" });
          onSeek(xToTime(e.clientX));
        }}
      >
        {ticks.map((t) => (
          <div key={t} className="absolute top-0 h-full" style={{ left: t * pps }}>
            <div className="w-px h-1.5 bg-gray-300" />
            <span className="absolute top-1.5 left-0.5 text-[9px] text-gray-400">{Math.round(t)}s</span>
          </div>
        ))}
      </div>

      {/* Clips */}
      <div className="absolute inset-x-0" style={{ top: RULER_H + 2, height: CLIP_H }}>
        {clips.map((c, i) => {
          const len = clipLength(c);
          const w = Math.max(2, len * pps);
          const sel = c.id === selectedClipId;
          const isDragged = dragging?.id === c.id;
          const tiles = Math.ceil(w / tileW);
          return (
            <div
              key={c.id}
              onPointerDown={(e) => {
                capture(e);
                onSelectText(null);
                setGesture({ kind: "move", id: c.id, x0: e.clientX, dx: 0, target: i, pps });
              }}
              className={`absolute top-0 h-full rounded-md overflow-hidden bg-gray-700 cursor-grab ${
                sel ? "ring-2 ring-amber-400 z-10" : "ring-1 ring-black/20"
              } ${isDragged ? "opacity-80 z-20 shadow-lg cursor-grabbing" : ""}`}
              style={{
                left: offsets[i] * pps + 1,
                width: w - 2,
                transform: isDragged ? `translateX(${dragging!.dx}px)` : undefined,
              }}
            >
              <div className="flex h-full pointer-events-none">
                {Array.from({ length: tiles }).map((_, k) => {
                  const url = thumbAt(c.start + ((k + 0.5) * tileW) / pps);
                  return url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={k} src={url} alt="" className="h-full object-cover flex-shrink-0" style={{ width: tileW }} />
                  ) : (
                    <div key={k} className="h-full flex-shrink-0 border-r border-gray-600" style={{ width: tileW }} />
                  );
                })}
              </div>
              <span className="absolute bottom-0.5 left-1 text-[9px] text-white/90 bg-black/50 rounded px-1 pointer-events-none">
                {len.toFixed(1)}s
              </span>
              {sel &&
                (["start", "end"] as const).map((side) => (
                  <div
                    key={side}
                    onPointerDown={(e) => {
                      capture(e);
                      onBegin();
                      setGesture({ kind: "trim", id: c.id, side, x0: e.clientX, start0: c.start, end0: c.end, pps });
                    }}
                    className={`absolute top-0 h-full bg-amber-400 cursor-ew-resize flex items-center justify-center ${
                      side === "start" ? "left-0 rounded-l-md" : "right-0 rounded-r-md"
                    }`}
                    style={{ width: HANDLE_W }}
                  >
                    <div className="w-0.5 h-4 bg-amber-800/60 rounded" />
                  </div>
                ))}
            </div>
          );
        })}
        {dragging && (
          <div
            className="absolute -top-1 w-0.5 bg-amber-500 z-30"
            style={{
              height: CLIP_H + 8,
              left:
                (dragging.target >= clips.length
                  ? total
                  : (() => {
                      const others = clips.filter((c) => c.id !== dragging.id);
                      return outputDuration(others.slice(0, dragging.target));
                    })()) * pps,
            }}
          />
        )}
      </div>

      {/* Text bars */}
      {overlays.map((o: TextOverlay, r) => {
        const s = o.start ?? 0;
        const en = Math.min(o.end ?? total, total);
        const sel = o.id === selectedTextId;
        const startGesture = (mode: "move" | "start" | "end") => (e: React.PointerEvent) => {
          capture(e);
          onSelectText(o.id);
          onSelectClip(null);
          onBegin();
          setGesture({ kind: "text", id: o.id, mode, x0: e.clientX, start0: s, end0: en, pps });
        };
        return (
          <div
            key={o.id}
            onPointerDown={startGesture("move")}
            className={`absolute rounded text-[10px] px-2 truncate cursor-grab flex items-center ${
              sel ? "bg-violet-500 text-white ring-2 ring-violet-300" : "bg-violet-200 text-violet-900"
            }`}
            style={{
              top: RULER_H + CLIP_H + 6 + r * (TEXT_H + 3),
              height: TEXT_H,
              left: s * pps,
              width: Math.max(12, (en - s) * pps),
            }}
          >
            <span className="truncate pointer-events-none">{o.text.split("\n")[0] || "Text"}</span>
            {(["start", "end"] as const).map((side) => (
              <div
                key={side}
                onPointerDown={startGesture(side)}
                className={`absolute top-0 h-full w-2 cursor-ew-resize ${side === "start" ? "left-0" : "right-0"}`}
              />
            ))}
          </div>
        );
      })}

      {/* Playhead */}
      <div
        className="absolute top-0 w-0.5 bg-red-500 pointer-events-none z-40"
        style={{ left: Math.min(time, total) * pps, height }}
      >
        <div className="absolute -top-0.5 -left-[5px] w-3 h-3 bg-red-500 rounded-sm rotate-45" />
      </div>
    </div>
  );
}

const round = (t: number) => Math.round(t * 1000) / 1000;
