import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../state/auth";

type AdminStory = {
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

type Elevation = {
  id: string;
  session_id: string;
  pattern: string;
  access: string;
  reason: string;
  status: string;
  expires_at: string | null;
};

type AuditEvent = {
  at: string;
  action: string;
  actor_id: string | null;
  target: string | null;
  outcome: string;
  hash: string;
  detail: Record<string, unknown>;
};

type User = {
  id: string;
  email: string;
  role: string;
};

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/admin${path}`, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem("at") ?? ""}` },
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

async function adminPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/admin${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionStorage.getItem("at") ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/admin${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionStorage.getItem("at") ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

async function patchElevation(id: string, decision: "approve" | "deny", ttlHours = 8) {
  const res = await fetch(`${BASE}/elevations/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionStorage.getItem("at") ?? ""}`,
    },
    body: JSON.stringify({ decision, ttl_hours: ttlHours }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function AdminPanel() {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<"scopes" | "elevations" | "audit" | "llm">("scopes");

  // Repos & Stories
  const [repos, setRepos] = useState<
    { id: string; full_name: string; installation_id: number; default_base_branch: string }[]
  >([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [stories, setStories] = useState<AdminStory[]>([]);
  const [selected, setSelected] = useState<AdminStory | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [scopes, setScopes] = useState<Record<string, "read" | "write" | undefined>>({});
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  // Users
  const [users, setUsers] = useState<User[]>([]);

  // Elevations & Audit
  const [elevations, setElevations] = useState<Elevation[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  // Onboarding modal/form
  const [showOnboard, setShowOnboard] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInstallationId, setNewInstallationId] = useState("");
  const [newBaseBranch, setNewBaseBranch] = useState("main");
  const [newToken, setNewToken] = useState("");

  // Create Story form
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [storyKey, setStoryKey] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [storyBrief, setStoryBrief] = useState("");
  const [storyCriteria, setStoryCriteria] = useState("");
  const [storyAssignee, setStoryAssignee] = useState("");

  // LLM Config state
  const [llmProvider, setLlmProvider] = useState("openai");
  const [llmBaseUrl, setLlmBaseUrl] = useState("https://api.openai.com/v1");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("gpt-4o-mini");
  const [llmIsActive, setLlmIsActive] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [savingLlm, setSavingLlm] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  // Auto-Scoping state
  const [autoScoping, setAutoScoping] = useState(false);
  const [scopeReasoning, setScopeReasoning] = useState<string | null>(null);

  const refreshRepos = () => {
    adminGet<{ repos: any[] }>("/repos")
      .then((r) => {
        setRepos(r.repos);
        if (r.repos.length > 0 && !selectedRepoId) {
          setSelectedRepoId(r.repos[0].id);
        }
      })
      .catch(() => setNotice("Failed to load repositories."));
  };

  const refreshStories = () => {
    adminGet<{ stories: AdminStory[] }>("/stories")
      .then((r) => {
        if (selectedRepoId) {
          setStories(r.stories.filter((s) => s.repo_id === selectedRepoId));
        } else {
          setStories(r.stories);
        }
      })
      .catch(() => setNotice("Failed to load stories."));
  };

  const refreshElevations = () => {
    adminGet<{ elevations: Elevation[] }>("/elevations")
      .then((r) => setElevations(r.elevations))
      .catch(() => {});
  };

  const refreshAudit = () => {
    adminGet<{ events: AuditEvent[] }>("/audit?limit=50")
      .then((r) => setAuditEvents(r.events))
      .catch(() => {});
  };

  const refreshLlmConfig = () => {
    adminGet<{
      provider: string;
      base_url: string;
      api_key: string;
      has_api_key: boolean;
      model: string;
      is_active: boolean;
    }>("/llm-config")
      .then((cfg) => {
        setLlmProvider(cfg.provider);
        setLlmBaseUrl(cfg.base_url);
        setLlmModel(cfg.model);
        setLlmIsActive(cfg.is_active);
        setHasApiKey(cfg.has_api_key);
        setLlmApiKey(cfg.api_key);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshRepos();
    refreshLlmConfig();
    adminGet<{ users: User[] }>("/users")
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedRepoId) return;

    setSelected(null);
    setPaths([]);
    setScopes({});
    setScopeReasoning(null);

    refreshStories();

    adminGet<{ paths: string[] }>(`/repos/${selectedRepoId}/paths`)
      .then((r) => setPaths(r.paths))
      .catch(() => setNotice("Failed to load repository paths."));
  }, [selectedRepoId]);

  useEffect(() => {
    if (activeTab === "elevations") refreshElevations();
    if (activeTab === "audit") refreshAudit();
    if (activeTab === "llm") refreshLlmConfig();
  }, [activeTab]);

  useEffect(() => {
    if (!selected) return;
    const next: Record<string, "read" | "write"> = {};
    for (const s of selected.scopes)
      next[s.path_glob] = s.access_level as "read" | "write";
    setScopes(next);
    setScopeReasoning(null);
  }, [selected]);

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newRepo = await adminPost<{
        id: string;
        full_name: string;
        installation_id: number;
        default_base_branch: string;
      }>("/repos", {
        full_name: newName,
        installation_id: parseInt(newInstallationId, 10) || 0,
        default_base_branch: newBaseBranch || "main",
        token: newToken,
      });
      setRepos([...repos, newRepo]);
      setSelectedRepoId(newRepo.id);
      setNewName("");
      setNewInstallationId("");
      setNewBaseBranch("main");
      setNewToken("");
      setShowOnboard(false);
      setNotice("Project successfully onboarded!");
    } catch {
      setNotice("Failed to onboard repository.");
    }
  };

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepoId) {
      setNotice("Please select a project first.");
      return;
    }
    try {
      const criteriaList = storyCriteria
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean);

      const created = await adminPost<AdminStory>("/stories", {
        repo_id: selectedRepoId,
        key: storyKey.toUpperCase(),
        title: storyTitle,
        developer_brief: storyBrief,
        acceptance_criteria: criteriaList,
        base_branch: "main",
        assignee_id: storyAssignee || null,
      });

      setStories([...stories, created]);
      setSelected(created);
      setStoryKey("");
      setStoryTitle("");
      setStoryBrief("");
      setStoryCriteria("");
      setStoryAssignee("");
      setShowCreateStory(false);
      setNotice(`Story ${created.key} created! Click '🤖 Auto-Scope with AI' or manually assign scoped paths below.`);
    } catch {
      setNotice("Failed to create user story.");
    }
  };

  const handleElevationDecision = async (id: string, decision: "approve" | "deny") => {
    try {
      await patchElevation(id, decision);
      refreshElevations();
      setNotice(`Elevation request ${decision}d.`);
    } catch {
      setNotice(`Failed to ${decision} elevation.`);
    }
  };

  const handleSaveLlmConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLlm(true);
    try {
      await adminPost("/llm-config", {
        provider: llmProvider,
        base_url: llmBaseUrl,
        api_key: llmApiKey,
        model: llmModel,
        is_active: llmIsActive,
      });
      setNotice("Application LLM Configuration saved successfully!");
      refreshLlmConfig();
    } catch {
      setNotice("Failed to save LLM configuration.");
    } finally {
      setSavingLlm(false);
    }
  };

  const handleTestLlmConfig = async () => {
    setTestingLlm(true);
    setTestResult(null);
    try {
      const res = await adminPost<{ ok: boolean; message?: string; error?: string }>("/llm-config/test", {
        provider: llmProvider,
        base_url: llmBaseUrl,
        api_key: llmApiKey,
        model: llmModel,
        is_active: llmIsActive,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.message || "Failed to reach LLM endpoint." });
    } finally {
      setTestingLlm(false);
    }
  };

  const handleAutoScope = async () => {
    if (!selected) return;
    setAutoScoping(true);
    setScopeReasoning(null);
    try {
      const res = await adminPost<{
        scopes: Record<string, "read" | "write">;
        reasoning: string;
      }>(`/stories/${selected.id}/auto-scope`, {});

      setScopes(res.scopes || {});
      setScopeReasoning(res.reasoning || "Auto-scoped based on zero-trust policy.");
      setNotice(`🤖 AI Auto-Scope identified ${Object.keys(res.scopes || {}).length} required file permissions!`);
    } catch {
      setNotice("Failed to auto-scope story.");
    } finally {
      setAutoScoping(false);
    }
  };

  const visible = paths.filter((p) =>
    p.toLowerCase().includes(filter.toLowerCase()),
  );
  const grantedCount = Object.values(scopes).filter(Boolean).length;

  return (
    <div className="admin">
      <header className="topbar">
        <div className="topbar-left">
          <strong>Admin Console</strong>
          <div className="row-gap" style={{ marginLeft: "20px" }}>
            <button
              className={activeTab === "scopes" ? "small" : "ghost small"}
              onClick={() => setActiveTab("scopes")}
            >
              Stories & Scoping
            </button>
            <button
              className={activeTab === "elevations" ? "small" : "ghost small"}
              onClick={() => setActiveTab("elevations")}
            >
              Elevations {elevations.filter((e) => e.status === "pending").length > 0 && `(${elevations.filter((e) => e.status === "pending").length})`}
            </button>
            <button
              className={activeTab === "llm" ? "small" : "ghost small"}
              onClick={() => setActiveTab("llm")}
            >
              🤖 LLM Setup
            </button>
            <button
              className={activeTab === "audit" ? "small" : "ghost small"}
              onClick={() => setActiveTab("audit")}
            >
              Audit Explorer
            </button>
          </div>
        </div>

        <div className="row-gap">
          <Link to="/work" style={{ textDecoration: "none" }}>
            <button className="ghost small">Developer Workspace →</button>
          </Link>
          <button className="ghost small" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {notice && (
        <div className="notice" onClick={() => setNotice(null)}>
          {notice} <span style={{ float: "right", opacity: 0.6 }}>✕</span>
        </div>
      )}

      {activeTab === "scopes" && (
        <div className="admin-grid">
          <aside className="sidebar">
            <div style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <h4 className="sidebar-title" style={{ margin: 0 }}>Project</h4>
                <button
                  className="ghost small"
                  onClick={() => {
                    setShowOnboard(!showOnboard);
                    setShowCreateStory(false);
                  }}
                >
                  {showOnboard ? "Cancel" : "+ Add"}
                </button>
              </div>

              <select
                value={selectedRepoId}
                onChange={(e) => setSelectedRepoId(e.target.value)}
                style={{ margin: "4px 0" }}
              >
                <option value="">Select Project</option>
                {repos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name}
                  </option>
                ))}
              </select>

              {showOnboard && (
                <form
                  onSubmit={handleOnboard}
                  style={{
                    marginTop: "10px",
                    padding: "10px",
                    background: "var(--canvas)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                  }}
                >
                  <label>Repo (owner/repo)
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. bhanub1996/navyadhatri"
                      required
                    />
                  </label>
                  <label>Installation ID (or 0 for public)
                    <input
                      type="number"
                      value={newInstallationId}
                      onChange={(e) => setNewInstallationId(e.target.value)}
                      placeholder="e.g. 0"
                    />
                  </label>
                  <label>Base Branch
                    <input
                      value={newBaseBranch}
                      onChange={(e) => setNewBaseBranch(e.target.value)}
                      placeholder="main"
                    />
                  </label>
                  <label>GitHub Token (optional, for private repos)
                    <input
                      type="password"
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value)}
                      placeholder="ghp_... or github_pat_..."
                    />
                  </label>
                  <button type="submit" style={{ width: "100%", marginTop: "6px" }}>
                    Save Project
                  </button>
                </form>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h4 className="sidebar-title" style={{ margin: 0 }}>User Stories</h4>
              <button
                className="ghost small"
                disabled={!selectedRepoId}
                onClick={() => {
                  setShowCreateStory(!showCreateStory);
                  setShowOnboard(false);
                }}
              >
                {showCreateStory ? "Cancel" : "+ Create"}
              </button>
            </div>

            {showCreateStory && (
              <form
                onSubmit={handleCreateStory}
                style={{
                  marginBottom: "16px",
                  padding: "12px",
                  background: "var(--canvas)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                }}
              >
                <h3 style={{ margin: "0 0 8px" }}>New User Story</h3>
                <label>Story Key
                  <input
                    value={storyKey}
                    onChange={(e) => setStoryKey(e.target.value)}
                    placeholder="e.g. NAV-101"
                    required
                  />
                </label>
                <label>Story Title
                  <input
                    value={storyTitle}
                    onChange={(e) => setStoryTitle(e.target.value)}
                    placeholder="e.g. Implement order checkout"
                    required
                  />
                </label>
                <label>Developer Brief
                  <textarea
                    rows={2}
                    value={storyBrief}
                    onChange={(e) => setStoryBrief(e.target.value)}
                    placeholder="Instructions for the developer..."
                  />
                </label>
                <label>Acceptance Criteria (one per line)
                  <textarea
                    rows={2}
                    value={storyCriteria}
                    onChange={(e) => setStoryCriteria(e.target.value)}
                    placeholder="Criteria 1&#10;Criteria 2"
                  />
                </label>
                <label>Assignee
                  <select
                    value={storyAssignee}
                    onChange={(e) => setStoryAssignee(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email} ({u.role})
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" style={{ width: "100%", marginTop: "8px" }}>
                  Create Story
                </button>
              </form>
            )}

            <ul className="story-list">
              {stories.length === 0 ? (
                <li className="muted small">No stories yet for this project.</li>
              ) : (
                stories.map((s) => (
                  <li key={s.id}>
                    <button
                      className={selected?.id === s.id ? "is-active" : ""}
                      onClick={() => {
                        setSelected(s);
                        setShowCreateStory(false);
                      }}
                    >
                      <span className="story-key">{s.key}</span>
                      <span>{s.title}</span>
                      <span className="badge">{s.status}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </aside>

          <main className="panel">
            {!selected ? (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <h2>No Story Selected</h2>
                <p className="muted">
                  Select a user story from the left, or click <strong>+ Create</strong> to define a new one.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2>{selected.key}: {selected.title}</h2>
                    {selected.developer_brief && (
                      <p style={{ margin: "4px 0 8px", color: "var(--text)" }}>{selected.developer_brief}</p>
                    )}
                    <p className="muted">
                      Grant the narrowest file permissions that make this story completable. Every extra path is permanent exposure for the life of the branch.
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="badge" style={{ fontSize: "12px", padding: "4px 8px" }}>
                      Branch: {selected.feature_branch || "feature/" + selected.key.toLowerCase()}
                    </span>
                  </div>
                </div>

                {scopeReasoning && (
                  <div style={{ marginTop: "10px", padding: "10px 14px", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "6px", fontSize: "13px" }}>
                    <strong>🤖 AI Auto-Scope Analysis:</strong> {scopeReasoning}
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px", marginTop: "12px", alignItems: "center" }}>
                  <input
                    placeholder="Filter repository paths..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={{ flex: 1, margin: 0 }}
                  />
                  <button
                    className="ghost small"
                    disabled={autoScoping}
                    onClick={handleAutoScope}
                    style={{ whiteSpace: "nowrap", border: "1px solid var(--accent)", color: "var(--accent)" }}
                  >
                    {autoScoping ? "Analyzing Story..." : "🤖 Auto-Scope with AI"}
                  </button>
                </div>

                <div className="scope-table" style={{ marginTop: "10px" }}>
                  {visible.length === 0 ? (
                    <div style={{ padding: "16px", textAlign: "center" }} className="muted">
                      No matching paths found in this repository.
                    </div>
                  ) : (
                    visible.map((path) => (
                      <div className="scope-row" key={path}>
                        <code>{path}</code>
                        <div className="row-gap">
                          {(["read", "write"] as const).map((level) => (
                            <label key={level} className="radio">
                              <input
                                type="radio"
                                name={path}
                                checked={scopes[path] === level}
                                onChange={() =>
                                  setScopes({ ...scopes, [path]: level })
                                }
                              />
                              {level}
                            </label>
                          ))}
                          <button
                            className="ghost small"
                            onClick={() =>
                              setScopes({ ...scopes, [path]: undefined })
                            }
                          >
                            none
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="sticky-actions">
                  <span className="muted">{grantedCount} paths granted in scope</span>
                  <div className="row-gap">
                    <button
                      className="ghost"
                      disabled={autoScoping}
                      onClick={handleAutoScope}
                    >
                      {autoScoping ? "Analyzing..." : "🤖 Auto-Scope with AI"}
                    </button>
                    <button
                      onClick={async () => {
                        const payload = Object.entries(scopes)
                          .filter(([, level]) => !!level)
                          .map(([path_glob, access_level]) => ({
                            path_glob,
                            access_level,
                          }));
                        await adminPut(`/stories/${selected.id}/scopes`, {
                          scopes: payload,
                        });
                        setNotice("Scope saved! Developer sessions pick this up immediately.");
                      }}
                    >
                      Save Scope
                    </button>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      )}

      {activeTab === "llm" && (
        <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto", overflowY: "auto" }}>
          <h2>Application-Level LLM Configuration</h2>
          <p className="muted">
            Configure the internal intelligence engine (Local vLLM / Ollama or Cloud API) used for internal platform automation, such as <strong>Zero-Trust Auto-Scoping</strong> and triage.
          </p>

          <form onSubmit={handleSaveLlmConfig} style={{ marginTop: "20px", background: "var(--canvas)", border: "1px solid var(--border)", borderRadius: "8px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>Model Provider</h3>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={llmIsActive}
                  onChange={(e) => setLlmIsActive(e.target.checked)}
                />
                <span>Enable Internal LLM</span>
              </label>
            </div>

            <label>Provider Type
              <select
                value={llmProvider}
                onChange={(e) => {
                  const val = e.target.value;
                  setLlmProvider(val);
                  if (val === "openai") {
                    setLlmBaseUrl("https://api.openai.com/v1");
                    setLlmModel("gpt-4o-mini");
                  } else if (val === "anthropic") {
                    setLlmBaseUrl("https://api.anthropic.com");
                    setLlmModel("claude-3-5-haiku-20241022");
                  } else if (val === "local") {
                    setLlmBaseUrl("http://localhost:11434/v1");
                    setLlmModel("qwen2.5-coder-32b-instruct");
                  }
                }}
              >
                <option value="openai">OpenAI (Official)</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="local">Local / Self-Hosted (Ollama / vLLM / LM Studio)</option>
                <option value="custom">Custom OpenAI-Compatible (Groq / OpenRouter / Together)</option>
              </select>
            </label>

            <label>Base URL
              <input
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
                placeholder="e.g. https://api.openai.com/v1 or http://localhost:11434/v1"
                required
              />
            </label>

            <label>Model Identifier
              <input
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder="e.g. gpt-4o-mini, claude-3-5-haiku-20241022, qwen2.5-coder-32b-instruct"
                required
              />
            </label>

            <label>API Key {hasApiKey && <span style={{ color: "var(--accent)", fontSize: "11px" }}>(Currently saved)</span>}
              <input
                type="password"
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                placeholder={hasApiKey ? "Leave unchanged to keep current key" : "Paste API key (optional for local Ollama)"}
                autoComplete="off"
              />
            </label>

            {testResult && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "10px 14px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  background: testResult.ok ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: `1px solid ${testResult.ok ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                  color: testResult.ok ? "#22c55e" : "#ef4444",
                }}
              >
                {testResult.ok ? "✅ " + testResult.message : "❌ " + (testResult.error || "Connection failed")}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="ghost"
                disabled={testingLlm}
                onClick={handleTestLlmConfig}
              >
                {testingLlm ? "Testing Connection..." : "Test Connection"}
              </button>
              <button type="submit" disabled={savingLlm}>
                {savingLlm ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "elevations" && (
        <div style={{ padding: "20px", overflowY: "auto" }}>
          <h2>Access Elevation Console</h2>
          <p className="muted">
            Developers can request temporary elevated access to specific folders or files. Grants are automatically revoked after TTL.
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px", background: "var(--canvas)", border: "1px solid var(--border)", borderRadius: "6px" }}>
            <thead>
              <tr style={{ background: "var(--surface)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px" }}>Requested Path</th>
                <th style={{ padding: "10px" }}>Access</th>
                <th style={{ padding: "10px" }}>Reason</th>
                <th style={{ padding: "10px" }}>Status</th>
                <th style={{ padding: "10px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {elevations.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "20px", textAlign: "center" }} className="muted">
                    No elevation requests recorded.
                  </td>
                </tr>
              ) : (
                elevations.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px" }}><code>{e.pattern}</code></td>
                    <td style={{ padding: "10px" }}><span className="badge">{e.access}</span></td>
                    <td style={{ padding: "10px" }}>{e.reason}</td>
                    <td style={{ padding: "10px" }}>
                      <span className={`badge ${e.status === "approved" ? "badge-read" : ""}`}>
                        {e.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      {e.status === "pending" && (
                        <div className="row-gap">
                          <button className="small" onClick={() => handleElevationDecision(e.id, "approve")}>
                            Approve (8h)
                          </button>
                          <button className="ghost small" onClick={() => handleElevationDecision(e.id, "deny")}>
                            Deny
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "audit" && (
        <div style={{ padding: "20px", overflowY: "auto" }}>
          <h2>Cryptographic Audit Explorer</h2>
          <p className="muted">
            Append-only, SHA-256 hash-chained record of all zero-trust events and AI prompt context disclosures.
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px", background: "var(--canvas)", border: "1px solid var(--border)", borderRadius: "6px" }}>
            <thead>
              <tr style={{ background: "var(--surface)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px" }}>Timestamp</th>
                <th style={{ padding: "10px" }}>Action</th>
                <th style={{ padding: "10px" }}>Target</th>
                <th style={{ padding: "10px" }}>Outcome</th>
                <th style={{ padding: "10px" }}>Hash</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "20px", textAlign: "center" }} className="muted">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                auditEvents.map((evt, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px", fontSize: "12px" }}>{new Date(evt.at).toLocaleString()}</td>
                    <td style={{ padding: "10px" }}><span className="badge">{evt.action}</span></td>
                    <td style={{ padding: "10px" }}><code>{evt.target || "-"}</code></td>
                    <td style={{ padding: "10px" }}>
                      <span className={`badge ${evt.outcome === "ok" ? "badge-read" : ""}`}>
                        {evt.outcome}
                      </span>
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--mono)", fontSize: "11px", color: "var(--text-muted)" }}>
                      {evt.hash ? evt.hash.substring(0, 16) + "..." : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
