"use client";

// Shared template library for the ad launcher copy fields.
// Templates live in nestable folders ("Between Hours" › "Whitelisting") and
// have no name of their own — the saved copy is the template.
// useTemplateLibrary() loads the whole library once; CollectionBar picks the
// active folder; TemplateActions renders the per-field ▾ picker + save
// popover; TemplateManageDialog handles folder create/rename/delete.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, ChevronDown, Folder, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  AdTemplate,
  AdTemplateCollection,
  TemplateFieldType,
} from "@/types/meta-ads";

const COLLECTION_KEY = "adsLauncher.templateCollection.v1";

const FIELD_PLURAL: Record<TemplateFieldType, string> = {
  primaryText: "primary texts",
  headline: "headlines",
  description: "descriptions",
  link: "landing pages",
};

async function api(
  path: string,
  method: string,
  body?: unknown
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Request failed" };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error — try again" };
  }
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** A folder positioned in the tree: depth 0 = top level. */
export interface FolderNode {
  collection: AdTemplateCollection;
  depth: number;
  /** "Between Hours › Whitelisting" */
  path: string;
}

/**
 * Depth-first, name-sorted flattening of the folder tree. A folder whose
 * parent is missing (shouldn't happen — FK cascades) is shown at top level.
 */
function flattenFolders(collections: AdTemplateCollection[]): FolderNode[] {
  const ids = new Set(collections.map((c) => c.id));
  const childrenOf = new Map<string | null, AdTemplateCollection[]>();
  for (const c of collections) {
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    const list = childrenOf.get(key) || [];
    list.push(c);
    childrenOf.set(key, list);
  }
  const out: FolderNode[] = [];
  const visit = (parentId: string | null, depth: number, prefix: string, seen: Set<string>) => {
    for (const c of (childrenOf.get(parentId) || []).slice().sort(byName)) {
      if (seen.has(c.id)) continue; // cycle guard
      seen.add(c.id);
      const path = prefix ? `${prefix} › ${c.name}` : c.name;
      out.push({ collection: c, depth, path });
      visit(c.id, depth + 1, path, seen);
    }
  };
  visit(null, 0, "", new Set());
  return out;
}

export interface TemplateGroup {
  collection: AdTemplateCollection;
  /** Folder path relative to the selected folder ("" for the folder itself). */
  label: string;
  templates: AdTemplate[];
}

export interface TemplateLibrary {
  collections: AdTemplateCollection[];
  /** Folders in display order with depth + full path. */
  folders: FolderNode[];
  loading: boolean;
  selectedCollectionId: string | null;
  selectedCollection: AdTemplateCollection | null;
  selectCollection: (id: string | null) => void;
  /** Full path ("Between Hours › Whitelisting") for a folder id. */
  pathOf: (id: string) => string;
  /** Ids of a folder and everything nested under it. */
  subtreeIds: (id: string) => string[];
  /** Saved copy for a field in the selected folder and its subfolders, grouped by folder. */
  templatesFor: (fieldType: TemplateFieldType) => TemplateGroup[];
  /** All mutations resolve to an error message, or null on success. */
  saveTemplate: (input: {
    collectionId?: string;
    collectionName?: string;
    parentId?: string | null;
    fieldType: TemplateFieldType;
    content: string;
  }) => Promise<string | null>;
  deleteTemplate: (id: string) => Promise<string | null>;
  createCollection: (name: string, parentId: string | null) => Promise<string | null>;
  renameCollection: (id: string, name: string) => Promise<string | null>;
  deleteCollection: (id: string) => Promise<string | null>;
}

export function useTemplateLibrary(): TemplateLibrary {
  const [collections, setCollections] = useState<AdTemplateCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  const folders = useMemo(() => flattenFolders(collections), [collections]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api("/api/ads/templates", "GET");
      if (cancelled) return;
      if (res.ok) {
        const cols: AdTemplateCollection[] = res.data.collections || [];
        setCollections(cols);
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(COLLECTION_KEY);
        } catch {}
        // Fall back to the first folder if the stored one was deleted.
        const restored =
          cols.find((c) => c.id === stored)?.id ?? flattenFolders(cols)[0]?.collection.id ?? null;
        setSelectedCollectionId(restored);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectCollection = useCallback((id: string | null) => {
    setSelectedCollectionId(id);
    try {
      if (id) localStorage.setItem(COLLECTION_KEY, id);
      else localStorage.removeItem(COLLECTION_KEY);
    } catch {}
  }, []);

  const selectedCollection =
    collections.find((c) => c.id === selectedCollectionId) || null;

  const pathOf = useCallback(
    (id: string) => folders.find((f) => f.collection.id === id)?.path || "",
    [folders]
  );

  const subtreeIds = useCallback(
    (id: string) => {
      const start = folders.findIndex((f) => f.collection.id === id);
      if (start < 0) return [id];
      const depth = folders[start].depth;
      const out = [id];
      for (let i = start + 1; i < folders.length && folders[i].depth > depth; i++) {
        out.push(folders[i].collection.id);
      }
      return out;
    },
    [folders]
  );

  const templatesFor = useCallback(
    (fieldType: TemplateFieldType): TemplateGroup[] => {
      if (!selectedCollectionId) return [];
      const start = folders.findIndex((f) => f.collection.id === selectedCollectionId);
      if (start < 0) return [];
      const root = folders[start];
      const groups: TemplateGroup[] = [];
      for (let i = start; i < folders.length; i++) {
        const f = folders[i];
        if (i > start && f.depth <= root.depth) break;
        const templates = f.collection.templates.filter((t) => t.fieldType === fieldType);
        if (!templates.length) continue;
        groups.push({
          collection: f.collection,
          label: i === start ? "" : f.path.slice(root.path.length + 3),
          templates,
        });
      }
      return groups;
    },
    [folders, selectedCollectionId]
  );

  const saveTemplate: TemplateLibrary["saveTemplate"] = useCallback(
    async (input) => {
      const res = await api("/api/ads/templates", "POST", input);
      if (!res.ok) return res.error;
      const { collection, template } = res.data as {
        collection: { id: string; name: string; parentId: string | null } | null;
        template: AdTemplate;
      };
      setCollections((prev) => {
        let next = prev;
        if (collection && !prev.some((c) => c.id === collection.id)) {
          next = [...prev, { ...collection, templates: [] }];
        }
        return next.map((c) =>
          c.id === template.collectionId && !c.templates.some((t) => t.id === template.id)
            ? { ...c, templates: [...c.templates, template] }
            : c
        );
      });
      if (collection) selectCollection(collection.id);
      return null;
    },
    [selectCollection]
  );

  const deleteTemplate: TemplateLibrary["deleteTemplate"] = useCallback(async (id) => {
    const res = await api(`/api/ads/templates/${id}`, "DELETE");
    if (!res.ok) return res.error;
    setCollections((prev) =>
      prev.map((c) => ({ ...c, templates: c.templates.filter((t) => t.id !== id) }))
    );
    return null;
  }, []);

  const createCollection: TemplateLibrary["createCollection"] = useCallback(
    async (name, parentId) => {
      const res = await api("/api/ads/template-collections", "POST", { name, parentId });
      if (!res.ok) return res.error;
      const collection = res.data.collection as {
        id: string;
        name: string;
        parentId: string | null;
      };
      setCollections((prev) => [...prev, { ...collection, templates: [] }]);
      selectCollection(collection.id);
      return null;
    },
    [selectCollection]
  );

  const renameCollection: TemplateLibrary["renameCollection"] = useCallback(
    async (id, name) => {
      const res = await api(`/api/ads/template-collections/${id}`, "PATCH", { name });
      if (!res.ok) return res.error;
      setCollections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name: res.data.collection.name } : c))
      );
      return null;
    },
    []
  );

  const deleteCollection: TemplateLibrary["deleteCollection"] = useCallback(
    async (id) => {
      const res = await api(`/api/ads/template-collections/${id}`, "DELETE");
      if (!res.ok) return res.error;
      const removed = new Set(subtreeIds(id));
      const parentId = collections.find((c) => c.id === id)?.parentId ?? null;
      setCollections((prev) => {
        const next = prev.filter((c) => !removed.has(c.id));
        if (selectedCollectionId && removed.has(selectedCollectionId)) {
          selectCollection(parentId ?? flattenFolders(next)[0]?.collection.id ?? null);
        }
        return next;
      });
      return null;
    },
    [collections, subtreeIds, selectedCollectionId, selectCollection]
  );

  return {
    collections,
    folders,
    loading,
    selectedCollectionId,
    selectedCollection,
    selectCollection,
    pathOf,
    subtreeIds,
    templatesFor,
    saveTemplate,
    deleteTemplate,
    createCollection,
    renameCollection,
    deleteCollection,
  };
}

/** Closes a popover on outside mousedown or Escape. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onDismiss: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onDismiss, active]);
}

/** Option label indented by depth so the native select reads as a tree. */
const indent = (f: FolderNode) =>
  f.depth ? `${" ".repeat(f.depth * 3)}↳ ${f.collection.name}` : f.collection.name;

const NEW_FOLDER = "__new";
const TOP_LEVEL = "__top";

/** Native select over the folder tree, with optional "+ New folder…" / "Top level" rows. */
function FolderSelect({
  folders,
  value,
  onChange,
  allowNew,
  allowTopLevel,
  excludeIds,
  className,
  autoFocus,
}: {
  folders: FolderNode[];
  value: string;
  onChange: (v: string) => void;
  allowNew?: boolean;
  allowTopLevel?: boolean;
  excludeIds?: Set<string>;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <select
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ||
        "border border-gray-300 rounded-md px-2 py-1 text-[12.5px] bg-white max-w-[240px]"
      }
    >
      {allowTopLevel && <option value={TOP_LEVEL}>Top level</option>}
      {folders
        .filter((f) => !excludeIds?.has(f.collection.id))
        .map((f) => (
          <option key={f.collection.id} value={f.collection.id} title={f.path}>
            {indent(f)}
          </option>
        ))}
      {allowNew && <option value={NEW_FOLDER}>+ New folder…</option>}
    </select>
  );
}

/** Name + parent picker for a new folder. Calls onCreate(name, parentId|null). */
function NewFolderFields({
  lib,
  defaultParentId,
  onCreate,
  onCancel,
  busy,
  compact,
}: {
  lib: TemplateLibrary;
  defaultParentId: string | null;
  onCreate: (name: string, parentId: string | null) => void;
  onCancel?: () => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState(defaultParentId || TOP_LEVEL);
  const submit = () => {
    const n = name.trim();
    if (!n || busy) return;
    onCreate(n, parent === TOP_LEVEL ? null : parent);
  };
  const inputCls = compact
    ? "border border-gray-300 rounded-md px-2 py-1 text-[12.5px]"
    : "border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]";
  return (
    <div className={compact ? "flex flex-col gap-1.5" : "flex flex-col gap-2"}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape" && onCancel) onCancel();
        }}
        placeholder="Folder name (e.g. Whitelisting)"
        className={`${inputCls} w-full`}
      />
      <label className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <span className="shrink-0">Inside</span>
        <FolderSelect
          folders={lib.folders}
          value={parent}
          onChange={setParent}
          allowTopLevel
          className={`${inputCls} flex-1 min-w-0 bg-white`}
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || busy}
          className={
            compact
              ? "text-[12px] text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md px-2 py-1 disabled:opacity-40"
              : "text-[13px] border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
          }
        >
          {busy ? "Creating…" : "Create folder"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-[12px] text-gray-400 hover:text-gray-700"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Folder bar — sits where the old preset chips were.
// ---------------------------------------------------------------------------

export function CollectionBar({ lib }: { lib: TemplateLibrary }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const hasFolders = lib.folders.length > 0;

  const create = async (name: string, parentId: string | null) => {
    setBusy(true);
    const err = await lib.createCollection(name, parentId);
    setBusy(false);
    if (err) setError(err);
    else {
      setCreating(false);
      setError(null);
    }
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-gray-400 inline-flex items-center gap-1">
          <Folder className="h-3 w-3" /> Templates
        </span>
        {hasFolders && (
          <FolderSelect
            folders={lib.folders}
            value={lib.selectedCollectionId || ""}
            onChange={(v) => lib.selectCollection(v || null)}
          />
        )}
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="text-[12px] text-gray-400 hover:text-gray-700 border border-dashed border-gray-300 rounded-full px-2.5 py-0.5"
          >
            + New folder
          </button>
        )}
        {hasFolders && (
          <button
            onClick={() => setManageOpen(true)}
            className="text-[12px] text-gray-400 hover:text-gray-700 underline underline-offset-2"
          >
            Manage
          </button>
        )}
        {lib.loading && <span className="text-[11px] text-gray-300">Loading…</span>}
      </div>
      {creating && (
        <div className="mt-2 max-w-[320px]">
          <NewFolderFields
            lib={lib}
            defaultParentId={lib.selectedCollectionId}
            onCreate={create}
            onCancel={() => {
              setCreating(false);
              setError(null);
            }}
            busy={busy}
            compact
          />
        </div>
      )}
      {!hasFolders && !lib.loading && !creating && (
        <p className="text-[11px] text-gray-400 mt-1">
          Create a folder (e.g. “Between Hours”) to start saving reusable copy and landing pages.
        </p>
      )}
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      <TemplateManageDialog lib={lib} open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-field picker + save popover.
// ---------------------------------------------------------------------------

type PanelMode = "closed" | "list" | "save";

export function TemplateActions({
  lib,
  fieldType,
  value,
  onInsert,
}: {
  lib: TemplateLibrary;
  fieldType: TemplateFieldType;
  value: string;
  onInsert: (content: string) => void;
}) {
  const [mode, setMode] = useState<PanelMode>("closed");
  const wrapRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setMode("closed"), []);
  useDismiss(wrapRef, close, mode !== "closed");

  const hasAny = lib.templatesFor(fieldType).length > 0;
  const plural = FIELD_PLURAL[fieldType];

  return (
    <div className="relative inline-flex items-center gap-0.5" ref={wrapRef}>
      <button
        type="button"
        title={`Insert a saved ${plural.replace(/s$/, "")}`}
        onClick={() => setMode((m) => (m === "list" ? "closed" : "list"))}
        className={`p-0.5 rounded hover:bg-gray-100 ${
          hasAny ? "text-gray-500 hover:text-gray-800" : "text-gray-300 hover:text-gray-500"
        }`}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Save current value to the library"
        disabled={!value.trim()}
        onClick={() => setMode((m) => (m === "save" ? "closed" : "save"))}
        className="p-0.5 rounded text-gray-400 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <BookmarkPlus className="h-3.5 w-3.5" />
      </button>

      {mode === "list" && (
        <ListPanel
          lib={lib}
          fieldType={fieldType}
          value={value}
          onInsert={(content) => {
            onInsert(content);
            close();
          }}
          onSwitchToSave={() => setMode("save")}
        />
      )}
      {mode === "save" && (
        <SavePanel lib={lib} fieldType={fieldType} value={value} onDone={close} />
      )}
    </div>
  );
}

function ListPanel({
  lib,
  fieldType,
  value,
  onInsert,
  onSwitchToSave,
}: {
  lib: TemplateLibrary;
  fieldType: TemplateFieldType;
  value: string;
  onInsert: (content: string) => void;
  onSwitchToSave: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const groups = lib.templatesFor(fieldType);
  const plural = FIELD_PLURAL[fieldType];
  const multiline = fieldType === "primaryText";

  return (
    <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-72 overflow-y-auto">
      {!lib.selectedCollection ? (
        <p className="px-3 py-2 text-[12px] text-gray-400">
          Pick or create a folder above first.
        </p>
      ) : groups.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-gray-400">
          No saved {plural} in {lib.selectedCollection.name} yet.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.collection.id}>
            {(g.label || groups.length > 1) && (
              <p className="px-3 pt-1.5 pb-0.5 text-[10.5px] uppercase tracking-wide text-gray-400 inline-flex items-center gap-1">
                <Folder className="h-3 w-3" />
                {g.label || lib.selectedCollection?.name}
              </p>
            )}
            {g.templates.map((t) => (
              <div
                key={t.id}
                className="group flex items-start gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                onClick={() => onInsert(t.content)}
                title={t.content}
              >
                <span
                  className={`flex-1 min-w-0 text-[12.5px] text-gray-800 ${
                    multiline ? "line-clamp-2 whitespace-pre-line" : "truncate"
                  }`}
                >
                  {t.content}
                </span>
                <button
                  type="button"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    lib.deleteTemplate(t.id).then((err) => err && setError(err));
                  }}
                  className="hidden group-hover:inline-flex p-0.5 text-gray-400 hover:text-red-600 shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ))
      )}
      {error && <p className="px-3 py-1 text-[11px] text-red-600">{error}</p>}
      <div className="border-t border-gray-100 mt-1 pt-1">
        <button
          type="button"
          disabled={!value.trim()}
          onClick={onSwitchToSave}
          className="w-full text-left px-3 py-1.5 text-[12px] text-gray-500 hover:text-gray-800 hover:bg-gray-50 disabled:opacity-40"
        >
          + Save current…
        </button>
      </div>
    </div>
  );
}

function SavePanel({
  lib,
  fieldType,
  value,
  onDone,
}: {
  lib: TemplateLibrary;
  fieldType: TemplateFieldType;
  value: string;
  onDone: () => void;
}) {
  const [folderId, setFolderId] = useState(lib.selectedCollectionId || NEW_FOLDER);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creatingFolder = !lib.folders.length || folderId === NEW_FOLDER;
  const target = lib.collections.find((c) => c.id === folderId);
  const content = value.trim();
  const alreadySaved =
    !!target &&
    target.templates.some((t) => t.fieldType === fieldType && t.content.trim() === content);

  const save = async (input: { collectionId?: string; collectionName?: string; parentId?: string | null }) => {
    if (busy || !content) return;
    setBusy(true);
    const err = await lib.saveTemplate({ ...input, fieldType, content });
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  return (
    <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50">
      <p className="text-[11px] text-gray-400 mb-1.5">
        Save this {FIELD_PLURAL[fieldType].replace(/s$/, "")} to
      </p>
      {lib.folders.length > 0 && (
        <FolderSelect
          folders={lib.folders}
          value={folderId}
          onChange={(v) => {
            setFolderId(v);
            setError(null);
          }}
          allowNew
          autoFocus
          className="w-full border border-gray-300 rounded-md px-2 py-1 text-[12.5px] bg-white mb-2"
        />
      )}
      {creatingFolder ? (
        <div className="mb-2">
          <NewFolderFields
            lib={lib}
            defaultParentId={lib.selectedCollectionId}
            onCreate={(name, parentId) => save({ collectionName: name, parentId })}
            busy={busy}
            compact
          />
        </div>
      ) : null}
      <p
        className={`text-[11px] text-gray-500 mb-2 border border-gray-100 bg-gray-50 rounded px-2 py-1 ${
          fieldType === "primaryText" ? "line-clamp-3 whitespace-pre-line" : "truncate"
        }`}
        title={value}
      >
        {value}
      </p>
      {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}
      {!creatingFolder && (
        <button
          type="button"
          onClick={() => save({ collectionId: folderId })}
          disabled={busy || !content || alreadySaved}
          className="w-full bg-gray-900 text-white rounded-md py-1.5 text-[12.5px] hover:bg-gray-700 disabled:opacity-40"
        >
          {busy ? "Saving…" : alreadySaved ? "Already saved here" : "Save"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manage dialog — folder create/rename/delete (templates are managed in pickers).
// ---------------------------------------------------------------------------

function TemplateManageDialog({
  lib,
  open,
  onClose,
}: {
  lib: TemplateLibrary;
  open: boolean;
  onClose: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    const err = await lib.renameCollection(id, name);
    if (err) setError(err);
    else {
      setRenamingId(null);
      setError(null);
    }
  };

  const create = async (name: string, parentId: string | null) => {
    setBusy(true);
    const err = await lib.createCollection(name, parentId);
    setBusy(false);
    if (err) setError(err);
    else {
      setAdding(false);
      setError(null);
    }
  };

  /** Templates inside a folder and all of its subfolders. */
  const subtreeCount = (id: string) => {
    const ids = new Set(lib.subtreeIds(id));
    return {
      folders: ids.size - 1,
      templates: lib.collections
        .filter((c) => ids.has(c.id))
        .reduce((n, c) => n + c.templates.length, 0),
    };
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[440px] bg-white rounded-lg" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="text-base">Template folders</DialogTitle>
        </DialogHeader>
        {adding ? (
          <NewFolderFields
            lib={lib}
            defaultParentId={lib.selectedCollectionId}
            onCreate={create}
            onCancel={() => {
              setAdding(false);
              setError(null);
            }}
            busy={busy}
          />
        ) : (
          <button
            onClick={() => {
              setAdding(true);
              setError(null);
            }}
            className="self-start text-[13px] border border-dashed border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50"
          >
            + New folder
          </button>
        )}
        {error && <p className="text-[12px] text-red-600 -mt-2">{error}</p>}
        <div className="max-h-72 overflow-y-auto -mt-1">
          {lib.folders.length === 0 && (
            <p className="text-[13px] text-gray-400 py-2">No folders yet.</p>
          )}
          {lib.folders.map((f) => {
            const c = f.collection;
            const counts = deletingId === c.id ? subtreeCount(c.id) : null;
            return (
              <div
                key={c.id}
                className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0"
                style={{ paddingLeft: f.depth * 18 }}
              >
                <Folder className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                {renamingId === c.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => {
                      setRenameValue(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(c.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-[13px]"
                  />
                ) : deletingId === c.id && counts ? (
                  <span className="flex-1 text-[12.5px] text-gray-700">
                    Delete “{c.name}”
                    {counts.folders > 0 &&
                      `, its ${counts.folders} subfolder${counts.folders === 1 ? "" : "s"}`}
                    {counts.templates > 0 &&
                      ` and ${counts.templates} saved piece${counts.templates === 1 ? "" : "s"}`}
                    ?
                  </span>
                ) : (
                  <span className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-[13px] text-gray-800 truncate">{c.name}</span>
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {c.templates.length} saved
                    </span>
                  </span>
                )}
                {deletingId === c.id ? (
                  <span className="inline-flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() =>
                        lib.deleteCollection(c.id).then((err) => {
                          if (err) setError(err);
                          setDeletingId(null);
                        })
                      }
                      className="text-[12px] text-white bg-red-600 hover:bg-red-700 rounded px-2 py-1"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="text-[12px] text-gray-500 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 shrink-0">
                    <button
                      title="Rename"
                      onClick={() => {
                        setRenamingId(c.id);
                        setRenameValue(c.name);
                        setDeletingId(null);
                        setError(null);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      title="Delete"
                      onClick={() => {
                        setDeletingId(c.id);
                        setRenamingId(null);
                        setError(null);
                      }}
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
