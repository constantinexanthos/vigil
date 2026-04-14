// Typed wrappers around Tauri invoke calls.

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI__) {
    return Promise.reject(new Error("Tauri not available"));
  }
  return window.__TAURI__.core.invoke<T>(cmd, args);
}

export interface SessionResponse {
  id: string;
  agent: string;
  start_time: string;
  end_time: string;
  files: string[];
  event_count: number;
  confidence_score: number;
  repo_path: string | null;
}

export interface FileDiffResponse {
  file_path: string;
  diff: string;
}

export function getSessions(hours?: number): Promise<SessionResponse[]> {
  return invoke("get_sessions", { hours: hours ?? null });
}

export function getSessionDiffs(sessionId: string): Promise<FileDiffResponse[]> {
  return invoke("get_session_diffs", { session_id: sessionId });
}

export function rollbackFiles(files: string[], repoPath: string): Promise<string[]> {
  return invoke("rollback_files", { files, repo_path: repoPath });
}

export function getActiveAgents(): Promise<string[]> {
  return invoke("get_active_agents");
}

export function getEventCount(): Promise<number> {
  return invoke("get_event_count");
}
