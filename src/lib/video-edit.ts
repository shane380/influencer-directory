/**
 * Pure timeline maths for edited videos, shared by the editor, the launcher
 * previews and the renderer. "Source" time is seconds in the uploaded file;
 * "output" time is seconds in the edited video (clips back to back, in order).
 */

import type { TextOverlay, VideoClip, VideoEdit } from "@/types/meta-ads";

/** Shortest clip the editor allows, in seconds. */
export const MIN_CLIP = 0.2;

export const clipLength = (c: VideoClip) => Math.max(0, c.end - c.start);

export function outputDuration(clips: VideoClip[]): number {
  return clips.reduce((sum, c) => sum + clipLength(c), 0);
}

/** Output-time start of each clip. */
export function clipOffsets(clips: VideoClip[]): number[] {
  const out: number[] = [];
  let t = 0;
  for (const c of clips) {
    out.push(t);
    t += clipLength(c);
  }
  return out;
}

/**
 * Which clip plays at output time `t`, and the matching source time. Times at
 * or past the end land on the last frame of the last clip.
 */
export function mapOutputTime(
  clips: VideoClip[],
  t: number
): { index: number; sourceTime: number } | null {
  if (!clips.length) return null;
  let offset = 0;
  for (let i = 0; i < clips.length; i++) {
    const len = clipLength(clips[i]);
    if (t < offset + len || i === clips.length - 1) {
      const within = Math.min(Math.max(0, t - offset), len);
      return { index: i, sourceTime: clips[i].start + within };
    }
    offset += len;
  }
  return null;
}

/** True when text is on screen at output time `t`. */
export function overlayVisible(o: TextOverlay, t: number): boolean {
  return t >= (o.start ?? 0) && t < (o.end ?? Infinity);
}

/** An edit that changes nothing — a single full-length clip, not muted. */
export function isTrivialEdit(edit: VideoEdit | null | undefined, sourceDuration: number): boolean {
  if (!edit) return true;
  if (edit.muted) return false;
  if (edit.clips.length !== 1) return false;
  const [c] = edit.clips;
  return c.start <= 0.01 && c.end >= sourceDuration - 0.01;
}

let clipCounter = 0;
export const newClipId = () => `clip-${Date.now()}-${clipCounter++}`;

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
