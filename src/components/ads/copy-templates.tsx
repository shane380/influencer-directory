"use client";

// Shared template library for the ad launcher copy fields.
// useTemplateLibrary() loads the whole library once; CollectionBar picks the
// active collection; TemplateActions renders the per-field ▾ picker + save
// popover; TemplateManageDialog handles collection rename/delete.

import { useCallback, useEffect, useRef, useState } from "react";
import { BookmarkPlus, ChevronDown, Pencil, Trash2 } from "lucide-react";
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

export interface TemplateLibrary {
  collections: AdTemplateCollection[];
  loading: boolean;
  selectedCollectionId: string | null;
  selectedCollection: AdTemplateCollection | null;
  selectCollection: (id: string | null) => void;
  templatesFor: (fieldType: TemplateFieldType) => AdTemplate[];
  /** All mutations resolve to an error message, or null on success. */
  saveTemplate: (input: {
    collectionId?: string;
    collectionName?: string;
    fieldType: TemplateFieldType;
    name: string;
    content: string;
  }) => Promise<string | null>;
  renameTemplate: (id: string, name: string) => Promise<string | null>;
  deleteTemplate: (id: string) => Promise<string | null>;
  createCollection: (name: string) => Promise<string | null>;
  renameCollection: (id: string, name: string) => Promise<string | null>;
  deleteCollection: (id: string) => Promise<string | null>;
}

export function useTemplateLibrary(): TemplateLibrary {
  const [collections, setCollections] = useState<AdTemplateCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

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
        // Fall back to the first collection if the stored one was deleted.
        const restored = cols.find((c) => c.id === stored)?.id ?? cols[0]?.id ?? null;
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

  const templatesFor = useCallback(
    (fieldType: TemplateFieldType) =>
      (collections.find((c) => c.id === selectedCollectionId)?.templates || []).filter(
        (t) => t.fieldType === fieldType
      ),
    [collections, selectedCollectionId]
  );

  const saveTemplate: TemplateLibrary["saveTemplate"] = useCallback(
    async (input) => {
      const res = await api("/api/ads/templates", "POST", input);
      if (!res.ok) return res.error;
      const { collection, template } = res.data as {
        collection: { id: string; name: string } | null;
        template: AdTemplate;
      };
      setCollections((prev) => {
        let next = prev;
        if (collection && !prev.some((c) => c.id === collection.id)) {
          next = [...prev, { ...collection, templates: [] }].sort(byName);
        }
        return next.map((c) =>
          c.id === template.collectionId
            ? {
                ...c,
                templates: c.templates.some((t) => t.id === template.id)
                  ? c.templates.map((t) => (t.id === template.id ? template : t))
                  : [...c.templates, template],
              }
            : c
        );
      });
      if (collection) selectCollection(collection.id);
      return null;
    },
    [selectCollection]
  );

  const renameTemplate: TemplateLibrary["renameTemplate"] = useCallback(
    async (id, name) => {
      const res = await api(`/api/ads/templates/${id}`, "PATCH", { name });
      if (!res.ok) return res.error;
      const template = res.data.template as AdTemplate;
      setCollections((prev) =>
        prev.map((c) =>
          c.id === template.collectionId
            ? { ...c, templates: c.templates.map((t) => (t.id === id ? template : t)) }
            : c
        )
      );
      return null;
    },
    []
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
    async (name) => {
      const res = await api("/api/ads/template-collections", "POST", { name });
      if (!res.ok) return res.error;
      const collection = res.data.collection as { id: string; name: string };
      setCollections((prev) =>
        [...prev, { ...collection, templates: [] }].sort(byName)
      );
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
        prev.map((c) => (c.id === id ? { ...c, name: res.data.collection.name } : c)).sort(byName)
      );
      return null;
    },
    []
  );

  const deleteCollection: TemplateLibrary["deleteCollection"] = useCallback(
    async (id) => {
      const res = await api(`/api/ads/template-collections/${id}`, "DELETE");
      if (!res.ok) return res.error;
      setCollections((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (selectedCollectionId === id) selectCollection(next[0]?.id ?? null);
        return next;
      });
      return null;
    },
    [selectedCollectionId, selectCollection]
  );

  return {
    collections,
    loading,
    selectedCollectionId,
    selectedCollection,
    selectCollection,
    templatesFor,
    saveTemplate,
    renameTemplate,
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

// ---------------------------------------------------------------------------
// Collection bar — sits where the old preset chips were.
// ---------------------------------------------------------------------------

export function CollectionBar({ lib }: { lib: TemplateLibrary }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const submitNew = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    const err = await lib.createCollection(name);
    setBusy(false);
    if (err) {
      setError(err);
    } else {
      setNewName("");
      setCreating(false);
      setError(null);
    }
  };

  const hasCollections = lib.collections.length > 0;

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-gray-400">Templates</span>
        {hasCollections && (
          <select
            value={lib.selectedCollectionId || ""}
            onChange={(e) => lib.selectCollection(e.target.value || null)}
            className="border border-gray-300 rounded-md px-2 py-1 text-[12.5px] bg-white max-w-[220px]"
          >
            {lib.collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {creating || !hasCollections ? (
          <span className="inline-flex items-center gap-1.5">
            <input
              autoFocus={creating}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
                if (e.key === "Escape" && hasCollections) {
                  setCreating(false);
                  setNewName("");
                  setError(null);
                }
              }}
              placeholder="New collection (e.g. Bluebell)"
              className="border border-gray-300 rounded-md px-2 py-1 text-[12.5px] w-48"
            />
            <button
              onClick={submitNew}
              disabled={!newName.trim() || busy}
              className="text-[12px] text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md px-2 py-1 disabled:opacity-40"
            >
              Create
            </button>
          </span>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="text-[12px] text-gray-400 hover:text-gray-700 border border-dashed border-gray-300 rounded-full px-2.5 py-0.5"
          >
            + New
          </button>
        )}
        {hasCollections && (
          <button
            onClick={() => setManageOpen(true)}
            className="text-[12px] text-gray-400 hover:text-gray-700 underline underline-offset-2"
          >
            Manage
          </button>
        )}
        {lib.loading && <span className="text-[11px] text-gray-300">Loading…</span>}
      </div>
      {!hasCollections && !lib.loading && (
        <p className="text-[11px] text-gray-400 mt-1">
          Create a collection to start saving reusable copy and landing pages.
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

  const templates = lib.templatesFor(fieldType);
  const plural = FIELD_PLURAL[fieldType];

  return (
    <div className="relative inline-flex items-center gap-0.5" ref={wrapRef}>
      <button
        type="button"
        title={`Insert a saved ${plural.replace(/s$/, "")}`}
        onClick={() => setMode((m) => (m === "list" ? "closed" : "list"))}
        className={`p-0.5 rounded hover:bg-gray-100 ${
          templates.length ? "text-gray-500 hover:text-gray-800" : "text-gray-300 hover:text-gray-500"
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const templates = lib.templatesFor(fieldType);
  const plural = FIELD_PLURAL[fieldType];

  const submitRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    const err = await lib.renameTemplate(id, name);
    if (err) {
      setError(err);
    } else {
      setRenamingId(null);
      setError(null);
    }
  };

  return (
    <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-64 overflow-y-auto">
      {!lib.selectedCollection ? (
        <p className="px-3 py-2 text-[12px] text-gray-400">
          Pick or create a collection above first.
        </p>
      ) : templates.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-gray-400">
          No saved {plural} in {lib.selectedCollection.name} yet.
        </p>
      ) : (
        templates.map((t) => (
          <div
            key={t.id}
            className="group flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
            onClick={() => renamingId !== t.id && onInsert(t.content)}
          >
            {renamingId === t.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  setError(null);
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename(t.id);
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setRenamingId(null);
                    setError(null);
                  }
                }}
                className="flex-1 border border-gray-300 rounded px-1.5 py-0.5 text-[12.5px]"
              />
            ) : (
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-medium text-gray-800 truncate">
                  {t.name}
                </span>
                <span className="block text-[11px] text-gray-400 truncate" title={t.content}>
                  {t.content}
                </span>
              </span>
            )}
            <span className="hidden group-hover:inline-flex items-center gap-1 shrink-0">
              <button
                type="button"
                title="Rename"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingId(t.id);
                  setRenameValue(t.name);
                  setError(null);
                }}
                className="p-0.5 text-gray-400 hover:text-gray-700"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  lib.deleteTemplate(t.id).then((err) => err && setError(err));
                }}
                className="p-0.5 text-gray-400 hover:text-red-600"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
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
  const [name, setName] = useState("");
  const [collectionId, setCollectionId] = useState(lib.selectedCollectionId || "");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creatingCollection = !lib.collections.length || collectionId === "__new";
  const targetCollection = lib.collections.find((c) => c.id === collectionId);
  const overwriting =
    !!targetCollection &&
    targetCollection.templates.some(
      (t) =>
        t.fieldType === fieldType &&
        t.name.toLowerCase() === name.trim().toLowerCase()
    );

  const submit = async () => {
    if (busy || !name.trim()) return;
    if (creatingCollection && !newCollectionName.trim()) {
      setError("Collection name is required");
      return;
    }
    setBusy(true);
    const err = await lib.saveTemplate({
      ...(creatingCollection
        ? { collectionName: newCollectionName.trim() }
        : { collectionId }),
      fieldType,
      name: name.trim(),
      content: value,
    });
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50">
      <p className="text-[11px] text-gray-400 mb-1.5">
        Save {FIELD_PLURAL[fieldType].replace(/s$/, "")} template
      </p>
      <input
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        placeholder='Name (e.g. "Bluebell collection page")'
        className="w-full border border-gray-300 rounded-md px-2 py-1 text-[12.5px] mb-2"
      />
      {lib.collections.length > 0 && (
        <select
          value={collectionId}
          onChange={(e) => {
            setCollectionId(e.target.value);
            setError(null);
          }}
          className="w-full border border-gray-300 rounded-md px-2 py-1 text-[12.5px] bg-white mb-2"
        >
          {lib.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__new">+ New collection…</option>
        </select>
      )}
      {creatingCollection && (
        <input
          value={newCollectionName}
          onChange={(e) => {
            setNewCollectionName(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder="New collection (e.g. Bluebell)"
          className="w-full border border-gray-300 rounded-md px-2 py-1 text-[12.5px] mb-2"
        />
      )}
      <p className="text-[11px] text-gray-400 truncate mb-2" title={value}>
        {value}
      </p>
      {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy || !name.trim() || !value.trim()}
        className="w-full bg-gray-900 text-white rounded-md py-1.5 text-[12.5px] hover:bg-gray-700 disabled:opacity-40"
      >
        {busy ? "Saving…" : overwriting ? "Overwrite" : "Save"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manage dialog — collection rename/delete (templates are managed in pickers).
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
  const [newName, setNewName] = useState("");
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

  const submitNew = async () => {
    const name = newName.trim();
    if (!name) return;
    const err = await lib.createCollection(name);
    if (err) setError(err);
    else {
      setNewName("");
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[420px] bg-white rounded-lg" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="text-base">Template collections</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submitNew()}
            placeholder="New collection name"
            className="flex-1 border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px]"
          />
          <button
            onClick={submitNew}
            disabled={!newName.trim()}
            className="text-[13px] border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {error && <p className="text-[12px] text-red-600 -mt-2">{error}</p>}
        <div className="max-h-72 overflow-y-auto -mt-1">
          {lib.collections.length === 0 && (
            <p className="text-[13px] text-gray-400 py-2">No collections yet.</p>
          )}
          {lib.collections.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0"
            >
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
              ) : deletingId === c.id ? (
                <span className="flex-1 text-[12.5px] text-gray-700">
                  Delete “{c.name}”
                  {c.templates.length > 0 && ` and its ${c.templates.length} template${c.templates.length === 1 ? "" : "s"}`}?
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
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
