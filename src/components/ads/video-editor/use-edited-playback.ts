"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoClip } from "@/types/meta-ads";
import { clipOffsets, mapOutputTime, outputDuration } from "@/lib/video-edit";

/** How close to a clip's end counts as "reached it" — about a frame. */
const END_EPSILON = 0.03;

/**
 * Plays an edit through a single <video>: when the current clip reaches its
 * end, the element seeks to the next clip's start. The preview can hitch for a
 * frame at a cut; the render itself is exact. With no clips the video plays
 * as-is. Returns the playhead in output seconds.
 */
export function useEditedPlayback(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  clips: VideoClip[] | null | undefined,
  {
    loop = true,
    enabled = true,
  }: {
    loop?: boolean;
    /** When false the hook stays idle — no per-frame updates for plain videos. */
    enabled?: boolean;
  } = {}
) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const indexRef = useRef(0);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const timeRef = useRef(0);

  const duration = clips?.length ? outputDuration(clips) : null;

  const seek = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      const cs = clipsRef.current;
      if (!cs?.length) {
        v.currentTime = Math.max(0, t);
        timeRef.current = t;
        setTime(t);
        return;
      }
      const total = outputDuration(cs);
      const clamped = Math.min(Math.max(0, t), Math.max(0, total - 0.001));
      const hit = mapOutputTime(cs, clamped);
      if (!hit) return;
      indexRef.current = hit.index;
      v.currentTime = hit.sourceTime;
      timeRef.current = clamped;
      setTime(clamped);
    },
    [videoRef]
  );

  // Re-anchor the element whenever the clips change (trim, split, reorder).
  const clipsKey = JSON.stringify(clips ?? null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !enabled) return;
    const anchor = () => seek(timeRef.current);
    if (v.readyState >= 1) anchor();
    else v.addEventListener("loadedmetadata", anchor, { once: true });
    return () => v.removeEventListener("loadedmetadata", anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipsKey, seek, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = videoRef.current;
      if (!v) return;
      const cs = clipsRef.current;
      if (!cs?.length) {
        if (Math.abs(v.currentTime - timeRef.current) > 0.001) {
          timeRef.current = v.currentTime;
          setTime(v.currentTime);
        }
        return;
      }
      let i = Math.min(indexRef.current, cs.length - 1);
      const clip = cs[i];
      // A clip that runs to the end of the file stops the element ("ended")
      // rather than playing past clip.end, so treat that as reaching the end.
      if ((!v.paused || v.ended) && v.currentTime >= clip.end - END_EPSILON) {
        const resume = v.ended;
        if (i < cs.length - 1 || loop) {
          i = i < cs.length - 1 ? i + 1 : 0;
          indexRef.current = i;
          v.currentTime = cs[i].start;
          if (resume) void v.play();
        } else {
          v.pause();
        }
      }
      const c = cs[i];
      const within = Math.min(Math.max(0, v.currentTime - c.start), c.end - c.start);
      const t = clipOffsets(cs)[i] + within;
      if (Math.abs(t - timeRef.current) > 0.001) {
        timeRef.current = t;
        setTime(t);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, loop, enabled]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => setPlaying(!v.paused);
    v.addEventListener("play", sync);
    v.addEventListener("pause", sync);
    sync();
    return () => {
      v.removeEventListener("play", sync);
      v.removeEventListener("pause", sync);
    };
  }, [videoRef]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // Restart from the top when parked at the very end.
      if (duration !== null && timeRef.current >= duration - END_EPSILON * 2) seek(0);
      void v.play();
    } else v.pause();
  }, [videoRef, duration, seek]);

  return { time, playing, duration, seek, toggle };
}
