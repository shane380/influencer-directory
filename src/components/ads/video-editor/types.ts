import type { TextOverlay, VideoClip } from "@/types/meta-ads";

/** Everything the editor can undo: the cut, the text, and mute. */
export interface EditorDoc {
  clips: VideoClip[];
  overlays: TextOverlay[];
  muted: boolean;
}

export type DocUpdate = (doc: EditorDoc) => EditorDoc;

/** A filmstrip frame: source time and an image URL. */
export interface Thumb {
  t: number;
  url: string;
}

/** What the IG previews need to play an edited video the way it will ship. */
export interface PreviewEdit {
  clips: VideoClip[] | null;
  muted: boolean;
  /** Text layer for a given output time */
  overlay?: (time: number) => React.ReactNode;
}
