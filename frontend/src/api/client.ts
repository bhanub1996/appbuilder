const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export function setAccessToken(token: string | null) {
  if (token) sessionStorage.setItem("at", token);
  else sessionStorage.removeItem("at");
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem("at");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 204) return undefined as T;

  if (res.status === 401 && !path.includes("/auth/login")) {
    setAccessToken(null);
    throw new ApiError(401, "Your session expired. Please sign in again.");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? body.detail ?? "request_failed");
  }
  return body as T;
}

export type TreeNode =
  | { type: "dir"; name: string; children: TreeNode[] }
  | { type: "file"; name: string; path: string; access: "read" | "write" };

export type StorySummary = {
  id: string;
  key: string;
  title: string;
  status: string;
  developer_brief: string;
  acceptance_criteria: string[];
};

export type SessionInfo = {
  session_id: string;
  feature_branch: string;
  expires_at: string;
  byok_configured: boolean;
  stale: boolean;
};

export const api = {
  login: (email: string) =>
    request<{
      access_token: string;
      user: { id: string; email: string; role: string };
    }>("/auth/login", { method: "POST", body: JSON.stringify({ email }) }),

  myStories: () => request<{ stories: StorySummary[] }>("/me/assignments"),

  openSession: (storyId: string) =>
    request<SessionInfo>("/sessions", {
      method: "POST",
      body: JSON.stringify({ story_id: storyId }),
    }),

  submitByok: (sessionId: string, provider: string, apiKey: string) =>
    request<{ ok: true }>(`/sessions/${sessionId}/byok`, {
      method: "POST",
      body: JSON.stringify({ provider, api_key: apiKey }),
    }),

  tree: (sessionId: string) =>
    request<{ tree: TreeNode[]; file_count: number }>(`/vfs/${sessionId}/tree`),

  file: (sessionId: string, path: string) =>
    request<{ path: string; content: string; access: string; sha: string }>(
      `/vfs/${sessionId}/file?path=${encodeURIComponent(path)}`,
    ),

  stubs: (sessionId: string) =>
    request<{ stubs: { name: string; contents: string }[] }>(
      `/vfs/${sessionId}/stubs`,
    ),

  save: (sessionId: string, path: string, content: string, baseSha: string) =>
    request<{ sha: string }>(`/vfs/${sessionId}/file`, {
      method: "PUT",
      body: JSON.stringify({ path, content, base_sha: baseSha }),
    }),

  aiEdit: (
    sessionId: string,
    path: string,
    instruction: string,
    selection?: string,
  ) =>
    request<{
      diff: string;
      proposed_content: string;
      route: string;
      blocked?: string;
    }>(`/ai/${sessionId}/edit`, {
      method: "POST",
      body: JSON.stringify({ path, instruction, selection }),
    }),

  requestElevation: (sessionId: string, pattern: string, reason: string) =>
    request<{ id: string; status: string }>("/elevations", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        path_glob: pattern,
        reason,
      }),
    }),

  submitStory: (sessionId: string) =>
    request<{ pull_request_url: string }>(`/sessions/${sessionId}/submit`, {
      method: "POST",
    }),

  getLlmConfig: () =>
    request<{
      provider: string;
      base_url: string;
      api_key: string;
      has_api_key: boolean;
      model: string;
      is_active: boolean;
    }>("/admin/llm-config"),

  updateLlmConfig: (config: {
    provider: string;
    base_url: string;
    api_key: string;
    model: string;
    is_active: boolean;
  }) =>
    request<{ ok: boolean }>("/admin/llm-config", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  testLlmConfig: (config: {
    provider: string;
    base_url: string;
    api_key: string;
    model: string;
    is_active: boolean;
  }) =>
    request<{ ok: boolean; message?: string; error?: string }>("/admin/llm-config/test", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  autoScopeStory: (storyId: string) =>
    request<{
      scopes: Record<string, "read" | "write">;
      reasoning: string;
    }>(`/admin/stories/${storyId}/auto-scope`, {
      method: "POST",
    }),
};
