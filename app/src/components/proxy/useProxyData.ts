import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AuditFilter,
  AuditRow,
  ProxyCounter,
  ProxyIdentity,
  ProxyStatus,
} from "../../types";

// Centralized data hook for the Proxy tab. Three lookups happen in parallel
// on mount and when the filter changes: identities (rare), audit feed (often),
// counters (per-agent rollup). Failures bubble up as `error` so the pane can
// render an inline failure block instead of crashing — Tauri commands return
// Err on malformed DBs (panics are caught upstream and turned into rejections).

interface ProxyData {
  status: ProxyStatus | null;
  identities: ProxyIdentity[];
  rows: AuditRow[];
  counters: ProxyCounter[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const DEFAULT_LIMIT = 1000;

export function useProxyData(filter: AuditFilter): ProxyData {
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [identities, setIdentities] = useState<ProxyIdentity[]>([]);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [counters, setCounters] = useState<ProxyCounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Memoize a stable filter key so the effect only refires when filter content
  // actually changes — the parent passes a new object literal on every render.
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      invoke<ProxyStatus>("proxy_status"),
      invoke<ProxyIdentity[]>("list_identities"),
      invoke<AuditRow[]>("read_proxy_db", {
        filter,
        cursor: null,
        limit: DEFAULT_LIMIT,
      }),
      invoke<ProxyCounter[]>("proxy_counters", {
        agentId: filter.agent_id ?? null,
        since: filter.since_ts ?? null,
      }),
    ])
      .then(([s, ids, ar, cs]) => {
        if (cancelled) return;
        setStatus(s);
        setIdentities(ids);
        setRows(ar);
        setCounters(cs);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(typeof e === "string" ? e : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // filterKey captures the full filter shape; eslint can't see through JSON.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { status, identities, rows, counters, loading, error, reload };
}
