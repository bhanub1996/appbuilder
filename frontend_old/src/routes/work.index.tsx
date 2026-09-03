import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Inbox, Loader2 } from "lucide-react";
import { useEffect } from "react";

import TopBar from "@/components/zt/TopBar";
import { StatusChip } from "@/components/zt/chips";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/work/")({
  head: () => ({
    meta: [
      { title: "Your stories · Scoped Workspace" },
      {
        name: "description",
        content:
          "Every story you are assigned, each with its own scoped virtual file system and ephemeral session.",
      },
      { property: "og:title", content: "Your stories · Scoped Workspace" },
      {
        property: "og:description",
        content:
          "Open a story to get a scoped VFS, a feature branch, and a sanitized AI session.",
      },
    ],
  }),
  component: StoryListPage,
});

function StoryListPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) void navigate({ to: "/" });
  }, [ready, user, navigate]);

  const { data, isPending, error } = useQuery({
    queryKey: ["my-stories"],
    queryFn: () => api.myStories(),
    enabled: ready && !!user,
  });

  const stories = data?.stories ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <main className="grid-canvas flex-1 px-6 py-12">
        <div className="mx-auto w-full max-w-3xl">
          <p className="label-caps">Assigned work</p>
          <h1 className="mt-2 font-display text-xl font-semibold">
            Pick a story to open a scoped session
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Opening a story provisions a feature branch and a virtual file
            system containing only the paths that story declares.
          </p>

          <div className="mt-8 space-y-2">
            {isPending && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading assignments…
              </div>
            )}

            {error && (
              <div className="rounded-md border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
                Could not reach the workspace API. Confirm the backend is
                running and <code>VITE_API_BASE</code> points at it.
              </div>
            )}

            {!isPending && !error && stories.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-surface/50 p-12 text-center">
                <Inbox className="size-6 text-muted-foreground/60" />
                <p className="font-display text-sm font-medium">
                  No stories assigned
                </p>
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                  An admin has to scope and assign a story before it becomes
                  visible here.
                </p>
              </div>
            )}

            {stories.map((story) => (
              <button
                key={story.id}
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/work/$storyId",
                    params: { storyId: story.id },
                  })
                }
                className="group flex w-full items-start gap-4 rounded-md border border-border bg-surface p-4 text-left transition-colors hover:border-primary/50 hover:bg-surface-raised"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] tracking-widest text-primary">
                      {story.key}
                    </span>
                    <StatusChip status={story.status} />
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {story.title}
                  </p>
                  {story.developer_brief && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {story.developer_brief}
                    </p>
                  )}
                </div>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
