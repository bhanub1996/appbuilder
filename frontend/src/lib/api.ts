/**
 * Client for the zero-trust FastAPI backend.
 * Endpoint shapes are unchanged from the original frontend — this only wraps
 * them with typing and a single error class.
 */

const BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const TOKEN_KEY = "at";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
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

  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (body as any).error ?? (body as any).detail ?? "request_failed",
    );
  }
  return body as T;
}

/* ------------------------------------------------------------------ types */

export type AccessLevel = "read" | "write";

export type TreeNode =
  | { type: "dir"; name: string; children: TreeNode[] }
  | { type: "file"; name: string; path: string; access: AccessLevel };

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

export type AuthUser = { id: string; email: string; role: string };

export type Repo = {
  id: string;
  full_name: string;
  installation_id: number;
  default_base_branch: string;
};

export type AdminStory = {
  id: string;
  key: string;
  title: string;
  status: string;
  repo_id: string;
  developer_brief?: string;
  acceptance_criteria?: string[];
  assignee_id: string | null;
  feature_branch: string | null;
  scopes: { path_glob: string; access_level: string }[];
};

export type Elevation = {
  id: string;
  session_id: string;
  pattern: string;
  access: string;
  reason: string;
  status: string;
  expires_at: string | null;
};

export type AuditEvent = {
  at: string;
  action: string;
  actor_id: string | null;
  target: string | null;
  outcome: string;
  hash: string;
  detail: Record<string, unknown>;
};

export type LlmConfig = {
  provider: string;
  base_url: string;
  api_key: string;
  has_api_key: boolean;
  model: string;
  is_active: boolean;
};

export type ProjectContext = {
  repo_id: string;
  description: string;
  architecture: string;
  tech_stack: string;
  setup_instructions: string;
  env_mapping: string;
};

/* ----------------------------------------------------------- developer api */

export const api = {
  login: (email: string) =>
    request<{ access_token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

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
};

/* --------------------------------------------------------------- admin api */

export const adminApi = {
  repos: () => request<{ repos: Repo[] }>("/admin/repos"),

  createRepo: (body: {
    full_name: string;
    installation_id: number;
    default_base_branch: string;
    token: string;
  }) => request<Repo>("/admin/repos", { method: "POST", body: JSON.stringify(body) }),

  repoPaths: (repoId: string) =>
    request<{ paths: string[] }>(`/admin/repos/${repoId}/paths`),

  repoContext: (repoId: string) =>
    request<ProjectContext>(`/admin/repos/${repoId}/context`),

  saveRepoContext: (repoId: string, body: Omit<ProjectContext, "repo_id">) =>
    request<{ ok: boolean }>(`/admin/repos/${repoId}/context`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  stories: () => request<{ stories: AdminStory[] }>("/admin/stories"),

  createStory: (body: {
    repo_id: string;
    key: string;
    title: string;
    developer_brief: string;
    acceptance_criteria: string[];
    base_branch: string;
    assignee_id: string | null;
  }) =>
    request<AdminStory>("/admin/stories", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  saveScopes: (
    storyId: string,
    scopes: { path_glob: string; access_level: string }[],
  ) =>
    request<{ ok: boolean }>(`/admin/stories/${storyId}/scopes`, {
      method: "PUT",
      body: JSON.stringify({ scopes }),
    }),

  autoScope: (storyId: string) =>
    request<{ scopes: Record<string, AccessLevel>; reasoning: string }>(
      `/admin/stories/${storyId}/auto-scope`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  users: () => request<{ users: AuthUser[] }>("/admin/users"),

  elevations: () => request<{ elevations: Elevation[] }>("/admin/elevations"),

  decideElevation: (
    id: string,
    decision: "approve" | "deny",
    ttlHours = 8,
  ) =>
    request<{ ok: boolean }>(`/elevations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ decision, ttl_hours: ttlHours }),
    }),

  audit: (limit = 50) =>
    request<{ events: AuditEvent[] }>(`/admin/audit?limit=${limit}`),

  llmConfig: () => request<LlmConfig>("/admin/llm-config"),

  saveLlmConfig: (body: Omit<LlmConfig, "has_api_key">) =>
    request<{ ok: boolean }>("/admin/llm-config", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  testLlmConfig: (body: Omit<LlmConfig, "has_api_key">) =>
    request<{ ok: boolean; message?: string; error?: string }>(
      "/admin/llm-config/test",
      { method: "POST", body: JSON.stringify(body) },
    ),
};
