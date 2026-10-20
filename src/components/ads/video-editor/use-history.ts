"use client";

import { useCallback, useRef, useState } from "react";

/** How long a burst of typing counts as one undo step. */
const COALESCE_MS = 800;

/**
 * Undo/redo over immutable snapshots.
 * - `apply` makes one undoable step (split, delete, reorder…).
 * - `begin` + `preview` + `commit` make a gesture one step: `preview` updates
 *   live while dragging, `commit` records it on pointer-up.
 * - `applyCoalesced` merges rapid repeats (typing) into one step.
 */
export function useHistory<T>(initial: T) {
  const [present, setPresent] = useState(initial);
  const presentRef = useRef(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const gestureStart = useRef<T | null>(null);
  const lastCoalesce = useRef<{ key: string; at: number } | null>(null);
  const [, bump] = useState(0);

  const set = (next: T) => {
    presentRef.current = next;
    setPresent(next);
  };

  const apply = useCallback((update: (s: T) => T) => {
    const prev = presentRef.current;
    const next = update(prev);
    if (next === prev) return;
    past.current.push(prev);
    future.current = [];
    lastCoalesce.current = null;
    set(next);
  }, []);

  const applyCoalesced = useCallback((key: string, update: (s: T) => T) => {
    const now = Date.now();
    const last = lastCoalesce.current;
    if (last && last.key === key && now - last.at < COALESCE_MS) {
      last.at = now;
      set(update(presentRef.current));
      return;
    }
    const prev = presentRef.current;
    past.current.push(prev);
    future.current = [];
    lastCoalesce.current = { key, at: now };
    set(update(prev));
  }, []);

  const begin = useCallback(() => {
    gestureStart.current = presentRef.current;
  }, []);

  const preview = useCallback((update: (s: T) => T) => {
    set(update(presentRef.current));
  }, []);

  const commit = useCallback(() => {
    const start = gestureStart.current;
    gestureStart.current = null;
    if (start && start !== presentRef.current) {
      past.current.push(start);
      future.current = [];
      lastCoalesce.current = null;
      bump((n) => n + 1);
    }
  }, []);

  /** Replace the state and forget history (e.g. once the video's length is known). */
  const reset = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    gestureStart.current = null;
    lastCoalesce.current = null;
    set(next);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(presentRef.current);
    lastCoalesce.current = null;
    set(prev);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(presentRef.current);
    lastCoalesce.current = null;
    set(next);
  }, []);

  return {
    state: present,
    apply,
    applyCoalesced,
    begin,
    preview,
    commit,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
