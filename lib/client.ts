"use client";
import { useCallback, useEffect, useState } from "react";

export class ClientError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

/** JSON fetch against our own API; throws ClientError with the server's code + message. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: init?.method ?? "GET", headers: init?.body ? { "content-type": "application/json" } : undefined, body: init?.body ? JSON.stringify(init.body) : undefined, cache: "no-store" });
  } catch {
    throw new ClientError("network", "Could not reach the server. Check your connection and try again.", 0);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ClientError(json?.error?.code ?? "error", json?.error?.message ?? `Request failed (HTTP ${res.status}).`, res.status);
  return json as T;
}

export interface Loadable<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useApi<T>(path: string | null): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path, tick]);
  return { data, error, loading, reload: useCallback(() => setTick((t) => t + 1), []) };
}
