import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AuditFilter,
  AuditRow,
  ProxyCounter,
  ProxyIdentity,
  ProxyStatus,
} from "../../types";

// Centralized data hook for the Proxy tab. On mount and when the filter
// changes, four lookups run in parallel: status, identities, audit feed,
// counters. After the first successful load, the audit feed + counters
// re-poll every POLL_MS while the tab is mounted and the daemon isn't in
// fixture mode — fixture data is static so polling is a waste, and the
// "Live" indicator in the audit feed reads from `isPolling` to flag this.
//
// Failures bubble up as `error` so the pane can render an inline failure
// block instead of crashing.

interface ProxyData {
  status: ProxyStatus | null;
  identities: ProxyIdentity[];
  rows: AuditRow[];
  counters: ProxyCounter[];
  loading: boolean;
  error: string | null;
  isPolling: boolean;
  reload: () => void;
}

const DEFAULT_LIMIT = 1000;
export const POLL_MS = 2000;

export function useProxyData(filter: AuditFilter): ProxyData {
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [identities, setIdentities] = useState<ProxyIdentity[]>([]);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [counters, setCounters] = useState<ProxyCounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [tick, setTick] = useState(0);

  // Track the latest filter inside a ref so the polling closure always
  // reads the current filter without needing to re-bind the interval each
  // time the filter changes. The effect below sets the ref synchronously
  // on the same render where the filter changes, so there's no stale read.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function loadOnce(initial: boolean) {
      try {
        const [s, ids, ar, cs] = await Promise.all([
          invoke<ProxyStatus>("proxy_status"),
          invoke<ProxyIdentity[]>("list_identities"),
          invoke<AuditRow[]>("read_proxy_db", {
            filter: filterRef.current,
            cursor: null,
            limit: DEFAULT_LIMIT,
          }),
          invoke<ProxyCounter[]>("proxy_counters", {
            agentId: filterRef.current.agent_id ?? null,
            since: filterRef.current.since_ts ?? null,
          }),
        ]);
        if (cancelled) return s;
        setStatus(s);
        setIdentities(ids);
        setRows(ar);
        setCounters(cs);
        setError(null);
        return s;
      } catch (e) {
        if (cancelled) return null;
        setError(typeof e === "string" ? e : String(e));
        return null;
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
    }

    async function pollOnce() {
      try {
        const [ar, cs] = await Promise.all([
          invoke<AuditRow[]>("read_proxy_db", {
            filter: filterRef.current,
            cursor: null,
            limit: DEFAULT_LIMIT,
          }),
          invoke<ProxyCounter[]>("proxy_counters", {
            agentId: filterRef.current.agent_id ?? null,
            since: filterRef.current.since_ts ?? null,
          }),
        ]);
        if (cancelled) return;
        // Replace whole lists rather than appending. The virtualizer keeps
        // scroll position because it tracks scrollTop on the scroll container,
        // not on a row index — replacing the array doesn't reset that.
        setRows(ar);
        setCounters(cs);
      } catch {
        // Swallow polling errors to avoid flashing the inline error block
        // for transient hiccups; the initial-load path is the surface for
        // structural failures.
      }
    }

    setLoading(true);
    loadOnce(true).then((s) => {
      if (cancelled) return;
      const fixture = s?.fixture_mode ?? false;
      if (!fixture) {
        setIsPolling(true);
        intervalId = setInterval(pollOnce, POLL_MS);
      } else {
        setIsPolling(false);
      }
    });

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      setIsPolling(false);
    };
    // filterKey captures the full filter shape; eslint can't see through JSON.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return {
    status,
    identities,
    rows,
    counters,
    loading,
    error,
    isPolling,
    reload,
  };
}
