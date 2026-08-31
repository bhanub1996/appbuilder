import { useEffect, useState } from "react";

import { useAuth } from "../state/auth";

type AdminStory = {
  id: string;
  key: string;
  title: string;
  status: string;
  feature_branch: string | null;
  scopes: { path_glob: string; access_level: string }[];
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

export default function AdminPanel() {
  const { signOut } = useAuth();
  const [repos, setRepos] = useState<
    { id: string; full_name: string; installation_id: number; default_base_branch: string }[]
  >([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [stories, setStories] = useState<AdminStory[]>([]);
  const [selected, setSelected] = useState<AdminStory | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [scopes, setScopes] = useState<
    Record<string, "read" | "write" | undefined>
  >({});
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  // Onboarding form state
  const [showOnboard, setShowOnboard] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInstallationId, setNewInstallationId] = useState("");
  const [newBaseBranch, setNewBaseBranch] = useState("dev");

  // Load repositories on mount
  useEffect(() => {
    adminGet<{ repos: any[] }>("/repos")
      .then((r) => {
        setRepos(r.repos);
        if (r.repos.length > 0) {
          setSelectedRepoId(r.repos[0].id);
        }
      })
      .catch(() => setNotice("Failed to load repositories."));
  }, []);

  // Reload stories and paths when active repo changes
  useEffect(() => {
    if (!selectedRepoId) return;

    setSelected(null);
    setPaths([]);
    setScopes({});

    adminGet<{ stories: AdminStory[] }>("/stories")
      .then((r) => {
        setStories(r.stories.filter((s: any) => s.repo_id === selectedRepoId));
      })
      .catch(() => setNotice("Failed to load stories."));

    adminGet<{ paths: string[] }>(`/repos/${selectedRepoId}/paths`)
      .then((r) => setPaths(r.paths))
      .catch(() => setNotice("Failed to load repository paths."));
  }, [selectedRepoId]);

  useEffect(() => {
    if (!selected) return;
    const next: Record<string, "read" | "write"> = {};
    for (const s of selected.scopes)
      next[s.path_glob] = s.access_level as "read" | "write";
    setScopes(next);
  }, [selected]);

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${BASE}/admin/repos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("at") ?? ""}`,
        },
        body: JSON.stringify({
          full_name: newName,
          installation_id: parseInt(newInstallationId, 10),
          default_base_branch: newBaseBranch,
        }),
      });
      if (!res.ok) throw new Error();
      const newRepo = await res.json();
      setRepos([...repos, newRepo]);
      setSelectedRepoId(newRepo.id);
      setNewName("");
      setNewInstallationId("");
      setNewBaseBranch("dev");
      setShowOnboard(false);
      setNotice("Project successfully onboarded!");
    } catch {
      setNotice("Failed to onboard repository.");
    }
  };

  const visible = paths.filter((p) =>
    p.toLowerCase().includes(filter.toLowerCase()),
  );
  const grantedCount = Object.values(scopes).filter(Boolean).length;

  return (
    <div className="admin">
      <header className="topbar">
        <strong>Admin</strong>
        <div className="row-gap">
          <span className="muted">Scope review</span>
          <button className="ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {notice && <div className="notice" onClick={() => setNotice(null)}>{notice}</div>}

      <div className="admin-grid">
        <aside className="sidebar">
          <div style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid var(--border)" }}>
            <h4 className="sidebar-title" style={{ marginTop: 0 }}>Project</h4>
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

            <button
              className="ghost small"
              onClick={() => setShowOnboard(!showOnboard)}
              style={{ width: "100%", marginTop: "8px" }}
            >
              {showOnboard ? "Cancel" : "+ Onboard Project"}
            </button>

            {showOnboard && (
              <form
                onSubmit={handleOnboard}
                style={{
                  marginTop: "12px",
                  padding: "10px",
                  background: "var(--canvas)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                }}
              >
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ display: "block", marginBottom: "4px" }}>Repository Name (owner/repo)</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. acme/web-app"
                    required
                    style={{ margin: 0 }}
                  />
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ display: "block", marginBottom: "4px" }}>Installation ID</label>
                  <input
                    type="number"
                    value={newInstallationId}
                    onChange={(e) => setNewInstallationId(e.target.value)}
                    placeholder="e.g. 123456"
                    required
                    style={{ margin: 0 }}
                  />
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ display: "block", marginBottom: "4px" }}>Default Base Branch</label>
                  <input
                    value={newBaseBranch}
                    onChange={(e) => setNewBaseBranch(e.target.value)}
                    placeholder="e.g. dev"
                    required
                    style={{ margin: 0 }}
                  />
                </div>
                <button type="submit" style={{ width: "100%", marginTop: "8px" }}>
                  Save Project
                </button>
              </form>
            )}
          </div>

          <h4 className="sidebar-title">Stories</h4>
          <ul className="story-list">
            {stories.map((s) => (
              <li key={s.id}>
                <button
                  className={selected?.id === s.id ? "is-active" : ""}
                  onClick={() => setSelected(s)}
                >
                  <span className="story-key">{s.key}</span>
                  <span>{s.title}</span>
                  <span className="badge">{s.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="panel">
          {!selected ? (
            <p className="muted">Select a story to define its scope.</p>
          ) : (
            <>
              <h2>{selected.title}</h2>
              <p className="muted">
                Grant the narrowest set that makes the story completable. Every
                extra path is permanent exposure for the life of the branch.
              </p>

              <input
                placeholder="Filter paths"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />

              <div className="scope-table">
                {visible.map((path) => (
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
                ))}
              </div>

              <div className="sticky-actions">
                <span className="muted">{grantedCount} paths granted</span>
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
                    setNotice(
                      "Scope saved. Active sessions pick this up on their next request.",
                    );
                  }}
                >
                  Save scope
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
