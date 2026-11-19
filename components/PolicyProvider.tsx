"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Policy, StoredPolicy } from "@/lib/types";
import { api } from "@/lib/client";
import { PRESETS } from "@/lib/policies";

const STORAGE_KEY = "governance-lens:active-policy";

interface Ctx {
  /** Policies stored in the database (presets first). Empty until loaded. */
  policies: StoredPolicy[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  activeId: string;
  /** The saved policy that is selected. */
  saved: StoredPolicy | null;
  /** The saved policy plus any unsaved edits (what the live preview evaluates). */
  active: Policy | null;
  dirty: boolean;
  setActiveId: (id: string) => void;
  /** Edit the draft (custom policies only). Nothing is persisted until save(). */
  editDraft: (fn: (draft: Policy) => void) => void;
  discardDraft: () => void;
  save: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  duplicate: () => Promise<void>;
  remove: () => Promise<void>;
  createBlank: () => Promise<void>;
}

const PolicyContext = createContext<Ctx | null>(null);

export function PolicyProvider({ children }: { children: React.ReactNode }) {
  const [policies, setPolicies] = useState<StoredPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveIdState] = useState<string>(PRESETS[0].id);
  const [draft, setDraft] = useState<Policy | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await api<{ policies: StoredPolicy[] }>("/api/policies/");
      setPolicies(r.policies);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load policies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const s = window.localStorage.getItem(STORAGE_KEY);
      if (s) setActiveIdState(s);
    } catch {
      /* storage unavailable: selection just isn't remembered */
    }
    reload();
  }, [reload]);

  const saved = useMemo(() => policies.find((p) => p.id === activeId) ?? policies[0] ?? null, [policies, activeId]);
  // Switching policy (or reloading from the server) drops unsaved edits.
  useEffect(() => setDraft(null), [saved?.id]);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const active: Policy | null = saved ? draft ?? { id: saved.id, name: saved.name, tagline: saved.tagline, rules: saved.rules } : null;
  const dirty = !!draft && !!saved && JSON.stringify(draft.rules) !== JSON.stringify(saved.rules);

  const editDraft = useCallback(
    (fn: (d: Policy) => void) => {
      if (!saved || saved.isPreset) return;
      const base = draft ?? ({ id: saved.id, name: saved.name, tagline: saved.tagline, rules: saved.rules } as Policy);
      const next = structuredClone(base);
      fn(next);
      setDraft(next);
    },
    [saved, draft]
  );

  const save = useCallback(async () => {
    if (!saved || !draft) return;
    await api(`/api/policies/${saved.id}/`, { method: "PUT", body: { rules: draft.rules } });
    await reload();
    setDraft(null);
  }, [saved, draft, reload]);

  const rename = useCallback(
    async (name: string) => {
      if (!saved) return;
      await api(`/api/policies/${saved.id}/`, { method: "PUT", body: { name } });
      await reload();
    },
    [saved, reload]
  );

  const duplicate = useCallback(async () => {
    if (!saved) return;
    // Duplicate what is on screen (including unsaved edits) by saving it as a new policy.
    const src = draft ?? saved;
    const r = await api<{ policy: StoredPolicy }>("/api/policies/", { method: "POST", body: { name: `${saved.name} (copy)`, tagline: saved.tagline, rules: src.rules } });
    await reload();
    setActiveId(r.policy.id);
  }, [saved, draft, reload, setActiveId]);

  const remove = useCallback(async () => {
    if (!saved || saved.isPreset) return;
    await api(`/api/policies/${saved.id}/`, { method: "DELETE" });
    await reload();
    setActiveId(PRESETS[0].id);
  }, [saved, reload, setActiveId]);

  const createBlank = useCallback(async () => {
    const r = await api<{ policy: StoredPolicy }>("/api/policies/", { method: "POST", body: { name: "New policy", tagline: "Custom policy.", rules: PRESETS[0].rules } });
    await reload();
    setActiveId(r.policy.id);
  }, [reload, setActiveId]);

  const value: Ctx = { policies, loading, error, reload, activeId: saved?.id ?? activeId, saved, active, dirty, setActiveId, editDraft, discardDraft: () => setDraft(null), save, rename, duplicate, remove, createBlank };
  return <PolicyContext.Provider value={value}>{children}</PolicyContext.Provider>;
}

export function usePolicy(): Ctx {
  const c = useContext(PolicyContext);
  if (!c) throw new Error("usePolicy must be used inside PolicyProvider");
  return c;
}
