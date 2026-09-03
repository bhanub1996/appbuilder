import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Check,
  FileLock2,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import TopBar from "@/components/zt/TopBar";
import { AccessChip, Chip, StatusChip } from "@/components/zt/chips";
import { adminApi, type AdminStory, type LlmConfig } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Control plane · Scoped Workspace" },
      {
        name: "description",
        content:
          "Scope stories, review elevation requests, configure the model route, and read the tamper-evident audit chain.",
      },
      { property: "og:title", content: "Control plane · Scoped Workspace" },
      {
        property: "og:description",
        content:
          "The admin surface for repository scoping, elevations, LLM routing, audit, and project context.",
      },
    ],
  }),
  component: AdminPage,
});

const TABS = [
  { id: "scopes", label: "Scopes" },
  { id: "elevations", label: "Elevations" },
  { id: "llm", label: "Model route" },
  { id: "audit", label: "Audit" },
  { id: "context", label: "Project context" },
];

function AdminPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) void navigate({ to: "/" });
  }, [ready, user, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <main className="grid-canvas flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <p className="label-caps">Control plane</p>
          <h1 className="mt-2 font-display text-xl font-semibold">
            Decide what the developer — and the model — may see
          </h1>

          <Tabs defaultValue="scopes" className="mt-8">
            <TabsList className="h-auto w-full justify-start gap-1 rounded-md border border-border bg-surface p-1">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="rounded-sm px-3 py-1.5 font-mono text-[11px] tracking-widest uppercase"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="scopes" className="mt-6">
              <ScopesTab />
            </TabsContent>
            <TabsContent value="elevations" className="mt-6">
              <ElevationsTab />
            </TabsContent>
            <TabsContent value="llm" className="mt-6">
              <LlmTab />
            </TabsContent>
            <TabsContent value="audit" className="mt-6">
              <AuditTab />
            </TabsContent>
            <TabsContent value="context" className="mt-6">
              <ContextTab />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

/* --------------------------------------------------------------- shared ui */

function Panel({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-sm border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> loading…
    </div>
  );
}

/* --------------------------------------------------------------- 1. scopes */

function ScopesTab() {
  const qc = useQueryClient();
  const stories = useQuery({
    queryKey: ["admin", "stories"],
    queryFn: () => adminApi.stories(),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<
    { path_glob: string; access_level: string }[]
  >([]);

  const story: AdminStory | undefined = stories.data?.stories.find(
    (s) => s.id === selected,
  );

  useEffect(() => {
    if (story) setRows(story.scopes);
  }, [story]);

  const save = useMutation({
    mutationFn: () => adminApi.saveScopes(selected!, rows),
    onSuccess: () => {
      toast.success("Scope saved — it applies to the next session");
      void qc.invalidateQueries({ queryKey: ["admin", "stories"] });
    },
    onError: (e: any) => toast.error(e?.code ?? "Save failed"),
  });

  const auto = useMutation({
    mutationFn: () => adminApi.autoScope(selected!),
    onSuccess: (res) => {
      setRows(
        Object.entries(res.scopes).map(([path_glob, access_level]) => ({
          path_glob,
          access_level,
        })),
      );
      toast.success("Suggested scope loaded", { description: res.reasoning });
    },
    onError: (e: any) => toast.error(e?.code ?? "Auto-scope failed"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Panel title="Stories" description="Pick one to edit its scope.">
        {stories.isPending ? (
          <Spinner />
        ) : (stories.data?.stories.length ?? 0) === 0 ? (
          <Empty>No stories yet.</Empty>
        ) : (
          <ul className="space-y-1">
            {stories.data!.stories.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelected(s.id)}
                  className={`w-full rounded-sm px-2 py-2 text-left transition-colors ${
                    selected === s.id
                      ? "bg-primary/12 shadow-[inset_2px_0_0_0_var(--color-primary)]"
                      : "hover:bg-surface-raised"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-primary">
                      {s.key}
                    </span>
                    <StatusChip status={s.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-foreground/85">
                    {s.title}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Path scope"
        description="Deny by default. Only these globs are projected into the developer's VFS."
        actions={
          selected ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={auto.isPending}
                onClick={() => auto.mutate()}
              >
                <Sparkles className="size-3.5" />
                Suggest
              </Button>
              <Button
                size="sm"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                Save scope
              </Button>
            </div>
          ) : null
        }
      >
        {!selected ? (
          <Empty>Select a story on the left.</Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="font-mono text-xs"
                  value={row.path_glob}
                  onChange={(e) =>
                    setRows(
                      rows.map((r, j) =>
                        j === i ? { ...r, path_glob: e.target.value } : r,
                      ),
                    )
                  }
                />
                <Select
                  value={row.access_level}
                  onValueChange={(v) =>
                    setRows(
                      rows.map((r, j) =>
                        j === i ? { ...r, access_level: v } : r,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">read</SelectItem>
                    <SelectItem value="write">write</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  className="text-muted-foreground transition-colors hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setRows([...rows, { path_glob: "", access_level: "read" }])
              }
            >
              <Plus className="size-3.5" />
              Add path
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ----------------------------------------------------------- 2. elevations */

function ElevationsTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "elevations"],
    queryFn: () => adminApi.elevations(),
  });
  const decide = useMutation({
    mutationFn: ({ id, d }: { id: string; d: "approve" | "deny" }) =>
      adminApi.decideElevation(id, d),
    onSuccess: () => {
      toast.success("Decision recorded");
      void qc.invalidateQueries({ queryKey: ["admin", "elevations"] });
    },
    onError: (e: any) => toast.error(e?.code ?? "Failed"),
  });

  return (
    <Panel
      title="Access requests"
      description="Every approval widens a developer's blast radius. Time-boxed by default."
    >
      {q.isPending ? (
        <Spinner />
      ) : (q.data?.elevations.length ?? 0) === 0 ? (
        <Empty>Nothing pending review.</Empty>
      ) : (
        <ul className="divide-y divide-hairline">
          {q.data!.elevations.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs text-primary">
                    {e.pattern}
                  </code>
                  <AccessChip access={e.access === "write" ? "write" : "read"} />
                  <StatusChip status={e.status} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {e.reason}
                </p>
              </div>
              {e.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decide.mutate({ id: e.id, d: "deny" })}
                  >
                    <X className="size-3.5" />
                    Deny
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => decide.mutate({ id: e.id, d: "approve" })}
                  >
                    <Check className="size-3.5" />
                    Approve 8h
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ 3. llm */

function LlmTab() {
  const q = useQuery({
    queryKey: ["admin", "llm"],
    queryFn: () => adminApi.llmConfig(),
  });
  const [form, setForm] = useState<Omit<LlmConfig, "has_api_key"> | null>(null);
  useEffect(() => {
    if (q.data) {
      const { has_api_key: _ignored, ...rest } = q.data;
      setForm(rest);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => adminApi.saveLlmConfig(form!),
    onSuccess: () => toast.success("Route saved"),
    onError: (e: any) => toast.error(e?.code ?? "Save failed"),
  });
  const test = useMutation({
    mutationFn: () => adminApi.testLlmConfig(form!),
    onSuccess: (r) =>
      r.ok
        ? toast.success(r.message ?? "Provider reachable")
        : toast.error(r.error ?? "Provider unreachable"),
    onError: (e: any) => toast.error(e?.code ?? "Test failed"),
  });

  if (q.isPending || !form)
    return (
      <Panel title="Model route">
        <Spinner />
      </Panel>
    );

  return (
    <Panel
      title="Model route"
      description="The org-level fallback used when a developer has no BYOK key. All traffic still passes the sanitizer."
      actions={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={test.isPending}
            onClick={() => test.mutate()}
          >
            Test
          </Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Provider">
          <Input
            className="font-mono text-xs"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
          />
        </Field>
        <Field label="Model">
          <Input
            className="font-mono text-xs"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
        </Field>
        <Field label="Base URL">
          <Input
            className="font-mono text-xs"
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
          />
        </Field>
        <Field label={q.data?.has_api_key ? "API key (stored)" : "API key"}>
          <Input
            type="password"
            className="font-mono text-xs"
            placeholder={q.data?.has_api_key ? "•••••••• stored" : "sk-…"}
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
          />
        </Field>
      </div>
      <p className="mt-4 flex gap-2 border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted-foreground">
        <FileLock2 className="mt-px size-3.5 shrink-0" />
        Keys are envelope-encrypted at rest and never echoed back to this
        console.
      </p>
    </Panel>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="label-caps">{label}</Label>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- 4. audit */

function AuditTab() {
  const q = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => adminApi.audit(100),
  });

  return (
    <Panel
      title="Audit chain"
      description="Hash-linked, append-only. Every scope decision, prompt, and sanitizer verdict lands here."
    >
      {q.isPending ? (
        <Spinner />
      ) : (q.data?.events.length ?? 0) === 0 ? (
        <Empty>No events recorded.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-2 pr-4 font-normal tracking-widest uppercase">
                  at
                </th>
                <th className="py-2 pr-4 font-normal tracking-widest uppercase">
                  action
                </th>
                <th className="py-2 pr-4 font-normal tracking-widest uppercase">
                  target
                </th>
                <th className="py-2 pr-4 font-normal tracking-widest uppercase">
                  outcome
                </th>
                <th className="py-2 font-normal tracking-widest uppercase">
                  hash
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {q.data!.events.map((e) => (
                <tr key={e.hash}>
                  <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                    {new Date(e.at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-foreground">{e.action}</td>
                  <td className="max-w-[240px] truncate py-2 pr-4 text-muted-foreground">
                    {e.target ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <Chip
                      tone={
                        e.outcome === "denied" || e.outcome === "blocked"
                          ? "danger"
                          : "success"
                      }
                    >
                      {e.outcome}
                    </Chip>
                  </td>
                  <td className="py-2 text-muted-foreground/70">
                    {e.hash.slice(0, 12)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------- 5. context */

function ContextTab() {
  const repos = useQuery({
    queryKey: ["admin", "repos"],
    queryFn: () => adminApi.repos(),
  });
  const [repoId, setRepoId] = useState<string | null>(null);
  const effectiveRepo = repoId ?? repos.data?.repos[0]?.id ?? null;

  const ctx = useQuery({
    queryKey: ["admin", "context", effectiveRepo],
    queryFn: () => adminApi.repoContext(effectiveRepo!),
    enabled: !!effectiveRepo,
  });

  const [form, setForm] = useState({
    description: "",
    architecture: "",
    tech_stack: "",
    setup_instructions: "",
    env_mapping: "",
  });
  useEffect(() => {
    if (ctx.data) {
      const { repo_id: _r, ...rest } = ctx.data;
      setForm(rest);
    }
  }, [ctx.data]);

  const save = useMutation({
    mutationFn: () => adminApi.saveRepoContext(effectiveRepo!, form),
    onSuccess: () => toast.success("Context saved"),
    onError: (e: any) => toast.error(e?.code ?? "Save failed"),
  });

  return (
    <Panel
      title="Project context"
      description="Prepended to every prompt so the model can be useful without ever reading proprietary source."
      actions={
        <div className="flex gap-2">
          <Select
            value={effectiveRepo ?? ""}
            onValueChange={(v) => setRepoId(v)}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Repository" />
            </SelectTrigger>
            <SelectContent>
              {(repos.data?.repos ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!effectiveRepo || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </div>
      }
    >
      {!effectiveRepo ? (
        <Empty>Connect a repository first.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Description">
            <Textarea
              rows={4}
              className="resize-none text-[13px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Architecture">
            <Textarea
              rows={4}
              className="resize-none text-[13px]"
              value={form.architecture}
              onChange={(e) =>
                setForm({ ...form, architecture: e.target.value })
              }
            />
          </Field>
          <Field label="Tech stack">
            <Textarea
              rows={4}
              className="resize-none text-[13px]"
              value={form.tech_stack}
              onChange={(e) => setForm({ ...form, tech_stack: e.target.value })}
            />
          </Field>
          <Field label="Setup instructions">
            <Textarea
              rows={4}
              className="resize-none text-[13px]"
              value={form.setup_instructions}
              onChange={(e) =>
                setForm({ ...form, setup_instructions: e.target.value })
              }
            />
          </Field>
          <Field label="Environment mapping">
            <Textarea
              rows={3}
              className="resize-none font-mono text-xs"
              value={form.env_mapping}
              onChange={(e) => setForm({ ...form, env_mapping: e.target.value })}
            />
          </Field>
        </div>
      )}
    </Panel>
  );
}
