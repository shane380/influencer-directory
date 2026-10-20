"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { OverlayFont, TextOverlay, VideoEdit } from "@/types/meta-ads";
import { OVERLAY_FONTS } from "@/lib/video-overlay-render";
import {
  MIN_CLIP,
  formatTime,
  isTrivialEdit,
  mapOutputTime,
  newClipId,
  outputDuration,
  overlayVisible,
} from "@/lib/video-edit";
import { Timeline } from "./timeline";
import { overlayTextStyle } from "./text-overlay-layer";
import { useEditedPlayback } from "./use-edited-playback";
import { useHistory } from "./use-history";
import type { DocUpdate, EditorDoc, Thumb } from "./types";

export { TextOverlayLayer } from "./text-overlay-layer";
export { useEditedPlayback } from "./use-edited-playback";

const COLORS = ["#ffffff", "#000000", "#f5e6d3", "#c8a27a", "#e11d48", "#facc15"];
/** Font size limits as a fraction of frame width */
const MIN_SIZE = 0.025;
const MAX_SIZE = 0.3;
/** Reels UI covers roughly the top 14% and bottom 35% of a 9:16 frame. */
const SAFE_TOP = 0.14;
const SAFE_BOTTOM = 0.35;
/**
 * iPhone screen width in CSS px. The editor shows the video at the size it's
 * actually seen on a phone (a 9:16 Reel fills the screen, a 1:1 feed post spans
 * its width), so text size reads true. Shrinks only if the window is too short.
 */
const PHONE_W = 390;
/** Vertical room the dialog's header, padding and buttons need. */
const DIALOG_CHROME_H = 190;
/** Text snaps to a guide within this many px. */
const SNAP_PX = 6;
/** Filmstrip frames generated per video. */
const THUMB_COUNT = 48;

let overlayCounter = 0;
export const newOverlayId = () => `txt-${Date.now()}-${overlayCounter++}`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface VideoEditorResult {
  overlays: TextOverlay[];
  /** null when the cut is untouched (full length, not muted) */
  edit: VideoEdit | null;
  frame: { w: number; h: number };
  sourceDuration: number;
}

interface Props {
  videoUrl: string;
  initialOverlays: TextOverlay[];
  initialEdit: VideoEdit | null;
  /** Show Reels safe-zone guides (stories & reels slot) */
  vertical: boolean;
  onCancel: () => void;
  onSave: (result: VideoEditorResult) => void;
}

/**
 * Trim, split, reorder and mute the video; add text that can be dragged,
 * resized and timed. Everything is stored as a spec — the render happens on
 * submit, at full resolution.
 */
export function VideoEditor({
  videoUrl,
  initialOverlays,
  initialEdit,
  vertical,
  onCancel,
  onSave,
}: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [sourceDuration, setSourceDuration] = useState(0);
  const history = useHistory<EditorDoc>({
    clips: initialEdit?.clips ?? [],
    overlays: initialOverlays,
    muted: !!initialEdit?.muted,
  });
  const doc = history.state;
  const [selectedTextId, setSelectedTextId] = useState<string | null>(
    initialOverlays[0]?.id ?? null
  );
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  const videoRef = useRef<HTMLVideoElement>(null);
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
    /** move: half the text box height, as a fraction of frame height */
    halfH: number;
  } | null>(null);

  const playback = useEditedPlayback(videoRef, doc.clips.length ? doc.clips : null, {
    loop: false,
  });
  const total = doc.clips.length ? outputDuration(doc.clips) : sourceDuration;

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
  const isNineSixteen = !!natural && Math.abs(aspect / (9 / 16) - 1) < 0.05;

  const onMetadata = (v: HTMLVideoElement) => {
    if (v.videoWidth && v.videoHeight) setNatural({ w: v.videoWidth, h: v.videoHeight });
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    setSourceDuration(dur);
    // A fresh video starts as one clip covering the whole thing.
    if (!doc.clips.length && dur > 0) {
      history.reset({ ...doc, clips: [{ id: newClipId(), start: 0, end: round(dur) }] });
    }
  };

  // Filmstrip: decode a few dozen small frames once, off the playback element.
  useEffect(() => {
    if (!sourceDuration || !natural) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      try {
        const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import("mediabunny");
        const blob = await (await fetch(videoUrl)).blob();
        const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track || cancelled) return;
        const h = 96;
        const sink = new CanvasSink(track, {
          width: Math.round(h * (natural.w / natural.h)),
          height: h,
          fit: "cover",
          poolSize: 0,
        });
        const times = Array.from(
          { length: THUMB_COUNT },
          (_, i) => ((i + 0.5) / THUMB_COUNT) * sourceDuration
        );
        const out: Thumb[] = [];
        let i = 0;
        for await (const wc of sink.canvasesAtTimestamps(times)) {
          if (cancelled) return;
          const t = times[i++];
          if (!wc) continue;
          const c = wc.canvas;
          const b =
            c instanceof OffscreenCanvas
              ? await c.convertToBlob({ type: "image/jpeg", quality: 0.7 })
              : await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.7));
          if (!b) continue;
          const url = URL.createObjectURL(b);
          urls.push(url);
          out.push({ t, url });
          if (out.length % 8 === 0) setThumbs([...out]);
        }
        if (!cancelled) setThumbs(out);
      } catch {
        // No filmstrip (e.g. the file can't be fetched cross-origin) — the
        // timeline still works with plain blocks.
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [videoUrl, sourceDuration, natural]);

  const selected = doc.overlays.find((o) => o.id === selectedTextId) || null;

  const updateText = useCallback(
    (id: string, p: Partial<TextOverlay>, coalesceKey?: string) => {
      const update: DocUpdate = (d) => ({
        ...d,
        overlays: d.overlays.map((o) => (o.id === id ? { ...o, ...p } : o)),
      });
      if (coalesceKey) history.applyCoalesced(`${coalesceKey}:${id}`, update);
      else history.apply(update);
    },
    [history]
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
    history.apply((d) => ({ ...d, overlays: [...d.overlays, o] }));
    setSelectedTextId(o.id);
    setSelectedClipId(null);
    requestAnimationFrame(() => textareaRef.current?.select());
  };

  const removeText = useCallback(
    (id: string) => {
      history.apply((d) => ({ ...d, overlays: d.overlays.filter((o) => o.id !== id) }));
      setSelectedTextId(null);
    },
    [history]
  );

  const splitAtPlayhead = useCallback(() => {
    const hit = mapOutputTime(doc.clips, playback.time);
    if (!hit) return;
    const c = doc.clips[hit.index];
    const at = round(hit.sourceTime);
    if (at - c.start < MIN_CLIP || c.end - at < MIN_CLIP) return;
    const right = { id: newClipId(), start: at, end: c.end };
    history.apply((d) => ({
      ...d,
      clips: [
        ...d.clips.slice(0, hit.index),
        { ...c, end: at },
        right,
        ...d.clips.slice(hit.index + 1),
      ],
    }));
    setSelectedClipId(right.id);
    setSelectedTextId(null);
  }, [doc.clips, playback.time, history]);

  const deleteClip = useCallback(
    (id: string) => {
      if (doc.clips.length <= 1) return;
      history.apply((d) => ({ ...d, clips: d.clips.filter((c) => c.id !== id) }));
      setSelectedClipId(null);
    },
    [doc.clips.length, history]
  );

  const canSplit = (() => {
    const hit = mapOutputTime(doc.clips, playback.time);
    if (!hit) return false;
    const c = doc.clips[hit.index];
    return hit.sourceTime - c.start >= MIN_CLIP && c.end - hit.sourceTime >= MIN_CLIP;
  })();

  // ---- Text dragging on the video, with snap guides ----

  const beginDrag = (o: TextOverlay, mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedTextId(o.id);
    setSelectedClipId(null);
    const rect = frameRef.current?.getBoundingClientRect();
    const cx = (rect?.left ?? 0) + o.x * dispW;
    const cy = (rect?.top ?? 0) + o.y * dispH;
    const boxH = (e.currentTarget as HTMLElement).closest("[data-text-box]")?.getBoundingClientRect().height ?? 0;
    history.begin();
    dragRef.current = {
      id: o.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      start: o,
      startDist: Math.max(4, Math.hypot(e.clientX - cx, e.clientY - cy)),
      halfH: boxH / 2 / dispH,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "move") {
      let x = clamp(d.start.x + (e.clientX - d.startX) / dispW, 0, 1);
      let y = clamp(d.start.y + (e.clientY - d.startY) / dispH, 0, 1);
      let gx: number | null = null;
      let gy: number | null = null;
      if (Math.abs(x - 0.5) * dispW < SNAP_PX) {
        x = 0.5;
        gx = 0.5;
      }
      // Centre line, plus (on 9:16) keeping the text's edge on a safe-zone line.
      const yCands: { centre: number; line: number }[] = [{ centre: 0.5, line: 0.5 }];
      if (vertical && isNineSixteen) {
        yCands.push({ centre: SAFE_TOP + d.halfH, line: SAFE_TOP });
        yCands.push({ centre: 1 - SAFE_BOTTOM - d.halfH, line: 1 - SAFE_BOTTOM });
      }
      for (const c of yCands) {
        if (Math.abs(y - c.centre) * dispH < SNAP_PX) {
          y = c.centre;
          gy = c.line;
          break;
        }
      }
      setGuides({ x: gx, y: gy });
      history.preview((doc) => ({
        ...doc,
        overlays: doc.overlays.map((o) => (o.id === d.id ? { ...o, x, y } : o)),
      }));
    } else {
      const rect = frameRef.current?.getBoundingClientRect();
      const cx = (rect?.left ?? 0) + d.start.x * dispW;
      const cy = (rect?.top ?? 0) + d.start.y * dispH;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      const size = clamp((d.start.size * dist) / d.startDist, MIN_SIZE, MAX_SIZE);
      history.preview((doc) => ({
        ...doc,
        overlays: doc.overlays.map((o) => (o.id === d.id ? { ...o, size } : o)),
      }));
    }
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setGuides({ x: null, y: null });
    history.commit();
  };

  // ---- Keyboard: undo/redo, delete, escape ----

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (typing) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedTextId) removeText(selectedTextId);
        else if (selectedClipId) deleteClip(selectedClipId);
      }
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, selectedTextId, selectedClipId, removeText, deleteClip, onCancel]);

  const save = () => {
    if (!natural || !sourceDuration) return;
    const edit: VideoEdit = { clips: doc.clips, ...(doc.muted ? { muted: true } : {}) };
    onSave({
      overlays: doc.overlays.filter((o) => o.text.trim()),
      edit: isTrivialEdit(edit, sourceDuration) ? null : edit,
      frame: natural,
      sourceDuration,
    });
  };

  const handleCls = "absolute w-3 h-3 bg-white border border-gray-500 rounded-[2px] shadow-sm";
  const btn =
    "inline-flex items-center gap-1 text-[12px] border border-gray-300 rounded-md px-2 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-5 max-w-[1100px] w-full max-h-[98vh] overflow-auto">
        <p className="text-sm font-semibold text-gray-900">Edit video</p>
        <p className="text-[12px] text-gray-500 mb-4">
          Trim, split and reorder clips; drag text to move it, drag its corner to resize. It&apos;s
          all rendered at full quality when you submit.
        </p>

        <div className="flex gap-5 flex-wrap">
          {/* Phone-size preview */}
          <div
            ref={frameRef}
            onPointerDown={() => setSelectedTextId(null)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="relative overflow-hidden rounded-lg bg-gray-900 select-none touch-none flex-shrink-0"
            style={{ width: dispW, height: dispH }}
          >
            <video
              ref={videoRef}
              src={videoUrl}
              className="absolute inset-0 w-full h-full"
              muted={doc.muted}
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => onMetadata(e.currentTarget)}
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
            {guides.x !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-fuchsia-500 pointer-events-none z-10"
                style={{ left: guides.x * dispW }}
              />
            )}
            {guides.y !== null && (
              <div
                className="absolute left-0 right-0 h-px bg-fuchsia-500 pointer-events-none z-10"
                style={{ top: guides.y * dispH }}
              />
            )}
            {natural &&
              doc.overlays.map((o) => {
                const isSel = o.id === selectedTextId;
                const visible = overlayVisible(o, playback.time);
                // Hidden text stays grabbable (faded) while it's selected.
                if (!visible && !isSel) return null;
                return (
                  <div
                    key={o.id}
                    data-text-box
                    onPointerDown={beginDrag(o, "move")}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move px-0.5 ${
                      isSel ? "outline outline-1 outline-dashed outline-white" : ""
                    } ${visible ? "" : "opacity-40"}`}
                    style={{ left: o.x * dispW, top: o.y * dispH, ...overlayTextStyle(o, dispW) }}
                  >
                    {o.text || " "}
                    {isSel && (
                      <div
                        onPointerDown={beginDrag(o, "resize")}
                        className={`${handleCls} -bottom-1.5 -right-1.5 cursor-nwse-resize`}
                      />
                    )}
                  </div>
                );
              })}
          </div>

          <div className="flex-1 min-w-[320px] space-y-3">
            {/* Transport */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={playback.toggle}
                disabled={!natural}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40"
                aria-label={playback.playing ? "Pause" : "Play"}
              >
                {playback.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
              </button>
              <span className="text-[12px] tabular-nums text-gray-600 w-[92px]">
                {formatTime(playback.time)} / {formatTime(total)}
              </span>
              <button type="button" onClick={splitAtPlayhead} disabled={!canSplit} className={btn} title="Split the clip at the playhead">
                <Scissors className="h-3.5 w-3.5" /> Split
              </button>
              <button
                type="button"
                onClick={() => selectedClipId && deleteClip(selectedClipId)}
                disabled={!selectedClipId || doc.clips.length <= 1}
                className={btn}
                title="Delete the selected clip"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clip
              </button>
              <button
                type="button"
                onClick={() => history.apply((d) => ({ ...d, muted: !d.muted }))}
                className={btn}
                title={doc.muted ? "Unmute" : "Mute the whole video"}
              >
                {doc.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {doc.muted ? "Muted" : "Sound"}
              </button>
              <div className="flex-1" />
              <button type="button" onClick={history.undo} disabled={!history.canUndo} className={btn} title="Undo (⌘Z)">
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={history.redo} disabled={!history.canRedo} className={btn} title="Redo (⌘⇧Z)">
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {natural && sourceDuration > 0 && doc.clips.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-2 bg-gray-50/60">
                <Timeline
                  doc={doc}
                  sourceDuration={sourceDuration}
                  time={playback.time}
                  thumbs={thumbs}
                  aspect={aspect}
                  selectedClipId={selectedClipId}
                  selectedTextId={selectedTextId}
                  onSelectClip={setSelectedClipId}
                  onSelectText={setSelectedTextId}
                  onSeek={playback.seek}
                  onBegin={history.begin}
                  onPreview={history.preview}
                  onCommit={history.commit}
                  onApply={history.apply}
                />
              </div>
            )}

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
                    onChange={(e) => updateText(selected.id, { text: e.target.value }, "text")}
                    rows={2}
                    className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-[130px]">
                    <label className="text-xs text-gray-500 block mb-1">Font</label>
                    <select
                      value={selected.font}
                      onChange={(e) => updateText(selected.id, { font: e.target.value as OverlayFont })}
                      className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-[13px]"
                    >
                      {(Object.keys(OVERLAY_FONTS) as OverlayFont[]).map((k) => (
                        <option key={k} value={k}>
                          {OVERLAY_FONTS[k].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[130px]">
                    <label className="text-xs text-gray-500 block mb-1">Size</label>
                    <input
                      type="range"
                      min={MIN_SIZE}
                      max={MAX_SIZE}
                      step={0.001}
                      value={selected.size}
                      onChange={(e) => updateText(selected.id, { size: Number(e.target.value) }, "size")}
                      className="w-full mt-2"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Colour</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateText(selected.id, { color: c })}
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
                      onChange={(e) => updateText(selected.id, { color: e.target.value }, "color")}
                      className="w-7 h-7 p-0 border-0 bg-transparent cursor-pointer"
                      aria-label="Custom colour"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    On screen{" "}
                    <span className="tabular-nums">
                      {selected.start === undefined && selected.end === undefined
                        ? "for the whole video"
                        : `${formatTime(selected.start ?? 0)} – ${formatTime(Math.min(selected.end ?? total, total))}`}
                    </span>
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      className={btn}
                      onClick={() =>
                        updateText(selected.id, {
                          start: round(Math.min(playback.time, (selected.end ?? total) - MIN_CLIP)),
                        })
                      }
                    >
                      Start at playhead
                    </button>
                    <button
                      type="button"
                      className={btn}
                      onClick={() =>
                        updateText(selected.id, {
                          end: round(Math.max(playback.time, (selected.start ?? 0) + MIN_CLIP)),
                        })
                      }
                    >
                      End at playhead
                    </button>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => updateText(selected.id, { start: undefined, end: undefined })}
                    >
                      Whole video
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeText(selected.id)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove this text
                </button>
              </div>
            ) : (
              <p className="text-[12px] text-gray-400">
                {doc.overlays.length
                  ? "Click a text box (or its bar on the timeline) to edit it."
                  : "No text yet."}
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
            disabled={!natural || !sourceDuration}
            onClick={save}
            className="text-[13px] px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const round = (t: number) => Math.round(t * 1000) / 1000;
