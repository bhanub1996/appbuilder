import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpFromLine,
  Loader2,
  Lock,
  Save,
  ShieldPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AiPanel from "@/components/zt/AiPanel";
import CodeEditor, { type Stub } from "@/components/zt/CodeEditor";
import DiffModal from "@/components/zt/DiffModal";
import FileTree from "@/components/zt/FileTree";
import StoryPane from "@/components/zt/StoryPane";
import TopBar from "@/components/zt/TopBar";
import { AccessChip } from "@/components/zt/chips";
import { api, type SessionInfo, type StorySummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/work/$storyId")({
  head: () => ({
    meta: [
      { title: "Workspace · Scoped Workspace" },
      {
        name: "description",
        content:
          "Edit in a scoped virtual file system with AI assistance that never sees proprietary implementations.",
      },
      { property: "og:title", content: "Workspace · Scoped Workspace" },
      {
        property: "og:description",
        content:
          "A scoped editor: only in-scope files, skeletonized dependencies, and a sanitized model boundary.",
      },
    ],
  }),
  component: WorkspacePage,
});

type OpenFile = {
  path: string;
  content: string;
  access: string;
  sha: string;
};

function WorkspacePage() {
  const { storyId } = Route.useParams();
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) void navigate({ to: "/" });
  }, [ready, user, navigate]);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [file, setFile] = useState<OpenFile | null>(null);
  const [draft, setDraft] = useState("");
  const [stubs, setStubs] = useState<Stub[]>([]);
  const [saving, setSaving] = useState(false);
  const [diff, setDiff] = useState<{ path: string; proposed: string } | null>(
    null,
  );
  const [route, setRoute] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [elevateOpen, setElevateOpen] = useState(false);
  const [pattern, setPattern] = useState("");
  const [reason, setReason] = useState("");

  const storiesQuery = useQuery({
    queryKey: ["my-stories"],
    queryFn: () => api.myStories(),
    enabled: ready && !!user,
  });

  const story: StorySummary | undefined = useMemo(
    () => storiesQuery.data?.stories.find((s) => s.id === storyId),
    [storiesQuery.data, storyId],
  );

  // Open the ephemeral session for this story exactly once.
  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    api
      .openSession(storyId)
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch((err: any) => {
        if (!cancelled)
          setSessionError(err?.code ?? "Could not open a session for this story.");
      });
    return () => {
      cancelled = true;
    };
  }, [storyId, ready, user]);

  const treeQuery = useQuery({
    queryKey: ["tree", session?.session_id],
    queryFn: () => api.tree(session!.session_id),
    enabled: !!session,
  });

  useEffect(() => {
    if (!session) return;
    api
      .stubs(session.session_id)
      .then((r) => setStubs(r.stubs))
      .catch(() => setStubs([]));
  }, [session]);

  async function openFile(path: string) {
    if (!session) return;
    try {
      const f = await api.file(session.session_id, path);
      setFile(f);
      setDraft(f.content);
      setBlocked(null);
    } catch (err: any) {
      toast.error(err?.code ?? "That file is not in scope.");
    }
  }

  const dirty = !!file && draft !== file.content;
  const readOnly = !file || file.access !== "write";

  async function save() {
    if (!session || !file) return;
    setSaving(true);
    try {
      const { sha } = await api.save(
        session.session_id,
        file.path,
        draft,
        file.sha,
      );
      setFile({ ...file, content: draft, sha });
      toast.success("Committed to your feature branch");
    } catch (err: any) {
      toast.error(err?.code ?? "Save rejected");
    } finally {
      setSaving(false);
    }
  }

  if (sessionError) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopBar />
        <div className="grid-canvas flex flex-1 items-center justify-center p-8">
          <div className="max-w-sm text-center">
            <Lock className="mx-auto size-6 text-danger" />
            <p className="mt-3 font-display text-sm font-semibold">
              Session refused
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {sessionError}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-5"
              onClick={() => void navigate({ to: "/work" })}
            >
              Back to stories
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar>
        <div className="flex items-center gap-3">
          {file ? (
            <>
              <code className="truncate font-mono text-xs text-foreground/80">
                {file.path}
              </code>
              <AccessChip access={file.access === "write" ? "write" : "read"} />
              {dirty && (
                <span className="font-mono text-[10px] tracking-widest text-primary uppercase">
                  unsaved
                </span>
              )}
            </>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground">
              {session ? "session live" : "provisioning session…"}
            </span>
          )}
        </div>
      </TopBar>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* Left: story + tree */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-border bg-surface lg:flex">
          {story && session && (
            <StoryPane
              story={story}
              branch={session.feature_branch}
              stale={session.stale}
            />
          )}
          <div className="border-t border-border p-3">
            <div className="flex items-center justify-between px-1">
              <p className="label-caps">Scoped files</p>
              <span className="font-mono text-[10px] text-muted-foreground">
                {treeQuery.data?.file_count ?? 0}
              </span>
            </div>
            <div className="mt-2">
              {treeQuery.isPending ? (
                <p className="px-2 font-mono text-xs text-muted-foreground">
                  resolving vfs…
                </p>
              ) : (
                <FileTree
                  nodes={treeQuery.data?.tree ?? []}
                  activePath={file?.path ?? null}
                  onOpen={(p) => void openFile(p)}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setElevateOpen(true)}
              className="mt-3 flex w-full items-center gap-2 rounded-sm border border-dashed border-border px-2 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <ShieldPlus className="size-3.5" />
              Request access to another path
            </button>
          </div>
        </aside>

        {/* Center: editor */}
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-end gap-2 border-b border-border bg-surface/60 px-3">
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || readOnly || saving}
              onClick={() => void save()}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Save
            </Button>
            <Button
              size="sm"
              disabled={!session}
              onClick={async () => {
                if (!session) return;
                try {
                  const r = await api.submitStory(session.session_id);
                  toast.success("Pull request opened", {
                    description: r.pull_request_url,
                  });
                } catch (err: any) {
                  toast.error(err?.code ?? "Submit failed");
                }
              }}
            >
              <ArrowUpFromLine className="size-3.5" />
              Submit story
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <CodeEditor
              path={file?.path ?? null}
              value={draft}
              readOnly={readOnly}
              stubs={stubs}
              onChange={setDraft}
            />
          </div>
        </section>

        {/* Right: AI */}
        <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-surface lg:block">
          {session && (
            <AiPanel
              isFileOpen={!!file}
              isReadOnly={readOnly}
              byokConfigured={session.byok_configured}
              lastRoute={route}
              blocked={blocked}
              onConfigureByok={async (provider, key) => {
                await api.submitByok(session.session_id, provider, key);
                setSession({ ...session, byok_configured: true });
                toast.success("Key sealed for this session");
              }}
              onSubmit={async (instruction) => {
                if (!file) return;
                setBlocked(null);
                try {
                  const r = await api.aiEdit(
                    session.session_id,
                    file.path,
                    instruction,
                  );
                  setRoute(r.route);
                  if (r.blocked) {
                    setBlocked(r.blocked);
                    return;
                  }
                  setDiff({ path: file.path, proposed: r.proposed_content });
                } catch (err: any) {
                  toast.error(err?.code ?? "AI request failed");
                }
              }}
            />
          )}
        </aside>
      </div>

      {diff && file && (
        <DiffModal
          path={diff.path}
          original={draft}
          proposed={diff.proposed}
          onReject={() => setDiff(null)}
          onAccept={() => {
            setDraft(diff.proposed);
            setDiff(null);
          }}
        />
      )}

      <Dialog open={elevateOpen} onOpenChange={setElevateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request elevated scope</DialogTitle>
            <DialogDescription>
              An admin reviews every request. Approved access is time-boxed and
              written to the audit chain.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pattern" className="label-caps">
                Path pattern
              </Label>
              <Input
                id="pattern"
                className="font-mono text-xs"
                placeholder="src/billing/**"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason" className="label-caps">
                Justification
              </Label>
              <Textarea
                id="reason"
                rows={3}
                className="resize-none text-[13px]"
                placeholder="Why this story cannot be completed within the current scope…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setElevateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!session || !pattern.trim() || !reason.trim()}
              onClick={async () => {
                if (!session) return;
                try {
                  await api.requestElevation(
                    session.session_id,
                    pattern.trim(),
                    reason.trim(),
                  );
                  toast.success("Request sent for review");
                  setElevateOpen(false);
                  setPattern("");
                  setReason("");
                } catch (err: any) {
                  toast.error(err?.code ?? "Request failed");
                }
              }}
            >
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
