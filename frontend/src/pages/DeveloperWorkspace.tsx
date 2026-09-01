import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  api,
  ApiError,
  type SessionInfo,
  type StorySummary,
  type TreeNode,
} from "../api/client";
import AiPanel from "../components/AiPanel";
import DiffModal from "../components/DiffModal";
import FileTree from "../components/FileTree";
import StoryPane from "../components/StoryPane";
import VfsEditor from "../components/VfsEditor";
import { useAuth } from "../state/auth";

type OpenFile = {
  path: string;
  content: string;
  sha: string;
  access: "read" | "write" | string;
};

export default function DeveloperWorkspace() {
  const { signOut } = useAuth();

  const [stories, setStories] = useState<StorySummary[]>([]);
  const [story, setStory] = useState<StorySummary | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [stubs, setStubs] = useState<{ name: string; contents: string }[]>([]);
  const [file, setFile] = useState<OpenFile | null>(null);
  const [draft, setDraft] = useState("");
  const [proposal, setProposal] = useState<{ content: string } | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => !!file && draft !== file.content, [file, draft]);
  const readOnly = file?.access !== "write";

  useEffect(() => {
    api
      .myStories()
      .then((r) => {
        setStories(r.stories);
        if (r.stories.length === 1) setStory(r.stories[0]);
      })
      .catch(() => setNotice("Could not load your assignments."));
  }, []);

  useEffect(() => {
    if (!story) return;
    api
      .openSession(story.id)
      .then(setSession)
      .catch(() => setNotice("Could not open a session for this story."));
  }, [story]);

  useEffect(() => {
    if (!session) return;
    api
      .tree(session.session_id)
      .then((r) => setTree(r.tree))
      .catch(() => setTree([]));
    api
      .stubs(session.session_id)
      .then((r) => setStubs(r.stubs))
      .catch(() => setStubs([]));
  }, [session]);

  const openFile = useCallback(
    async (path: string) => {
      if (!session) return;
      if (dirty && !confirm("Discard unsaved changes?")) return;
      try {
        const data = await api.file(session.session_id, path);
        setFile(data as OpenFile);
        setDraft(data.content);
        setBlocked(null);
      } catch (e) {
        // A 404 here means out of scope OR nonexistent. We cannot tell, by design.
        setNotice(
          e instanceof ApiError
            ? "That file is not available in this story."
            : "Failed.",
        );
      }
    },
    [session, dirty],
  );

  async function onSave() {
    if (!session || !file) return;
    setSaving(true);
    try {
      const res = await api.save(
        session.session_id,
        file.path,
        draft,
        file.sha,
      );
      setFile({ ...file, content: draft, sha: res.sha || file.sha });
      setNotice("Committed to your branch.");
    } catch (e) {
      setNotice(
        e instanceof ApiError && e.code === "stale_base_sha"
          ? "Someone else changed this file. Reopen it and reapply your edit."
          : "Save failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onAiEdit(instruction: string) {
    if (!session || !file) return;
    setBlocked(null);
    try {
      const res = await api.aiEdit(session.session_id, file.path, instruction);
      setRoute(res.route);
      setProposal({ content: res.proposed_content });
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 422) {
        setBlocked(e.code);
      } else {
        const msg = e instanceof ApiError ? e.code || e.message : e.message || String(e);
        setNotice(`The model request failed: ${msg}`);
      }
    }
  }

  if (!story) {
    return (
      <div className="auth-shell">
        <div className="card">
          <h1>Your stories</h1>
          {stories.length === 0 && (
            <p className="muted">Nothing assigned to you yet.</p>
          )}
          <ul className="story-list">
            {stories.map((s) => (
              <li key={s.id}>
                <button onClick={() => setStory(s)}>
                  <span className="story-key">{s.key}</span>
                  <span>{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left">
          <strong>Scoped Workspace</strong>
          <span className="muted">{story.key}</span>
          {file && <code className="path-chip">{file.path}</code>}
          {readOnly && file && (
            <span className="badge badge-read">read only</span>
          )}
        </div>
        <div className="row-gap">
          <button
            className="ghost"
            disabled={!dirty || readOnly || saving}
            onClick={onSave}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            disabled={!session}
            onClick={async () => {
              if (!session) return;
              const res = await api.submitStory(session.session_id);
              setNotice(`Pull request opened: ${res.pull_request_url}`);
            }}
          >
            Submit story
          </button>
          <Link to="/admin" style={{ textDecoration: "none" }}>
            <button className="ghost">Admin Console →</button>
          </Link>
          <button className="ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {notice && (
        <div className="notice" onClick={() => setNotice(null)} role="status">
          {notice}
        </div>
      )}

      <div className="workspace-grid">
        <aside className="sidebar">
          <h4 className="sidebar-title">Files in scope</h4>
          {tree.length === 0 ? (
            <div style={{ padding: "8px 0" }}>
              <p className="muted small">No files scoped to this story yet.</p>
              <Link to="/admin" style={{ fontSize: "11px", color: "var(--accent)" }}>
                Go to Admin to scope files →
              </Link>
            </div>
          ) : (
            <FileTree
              nodes={tree}
              activePath={file?.path ?? null}
              onOpen={openFile}
            />
          )}
          <p className="fine-print">
            Only files this story needs are listed. Everything else is not
            hidden -- it was never sent.
          </p>
          <button
            className="ghost small"
            onClick={async () => {
              if (!session) return;
              const pattern = prompt(
                "Which path do you need? (glob, e.g. frontend/src/hooks/*)",
              );
              if (!pattern) return;
              const reason = prompt(
                "Why do you need it? An admin will read this.",
              );
              if (!reason || reason.length < 10) {
                setNotice("A real reason is required.");
                return;
              }
              await api.requestElevation(session.session_id, pattern, reason);
              setNotice("Request sent for review.");
            }}
          >
            Request more access
          </button>
        </aside>

        <main className="editor-pane">
          <VfsEditor
            path={file?.path ?? null}
            value={draft}
            readOnly={readOnly}
            stubs={stubs}
            onChange={setDraft}
          />
        </main>

        <aside className="rightbar">
          <StoryPane
            story={story}
            branch={session?.feature_branch ?? "..."}
            stale={session?.stale ?? false}
          />
          <AiPanel
            isFileOpen={!!file}
            isReadOnly={readOnly}
            byokConfigured={session?.byok_configured ?? false}
            lastRoute={route}
            blocked={blocked}
            onConfigureByok={async (provider, key) => {
              if (!session) return;
              await api.submitByok(session.session_id, provider, key);
              setSession({ ...session, byok_configured: true });
            }}
            onSubmit={onAiEdit}
          />
        </aside>
      </div>

      {proposal && file && (
        <DiffModal
          path={file.path}
          original={draft}
          proposed={proposal.content}
          onAccept={() => {
            setDraft(proposal.content);
            setProposal(null);
          }}
          onReject={() => setProposal(null)}
        />
      )}
    </div>
  );
}
