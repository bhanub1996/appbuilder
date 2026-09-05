import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Boxes,
  EyeOff,
  KeyRound,
  Scissors,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in · Zero-Trust Dev Workspace" },
      {
        name: "description",
        content:
          "Scoped AI development workspace: developers see only the files their story needs, and proprietary code never reaches the model provider.",
      },
      { property: "og:title", content: "Sign in · Zero-Trust Dev Workspace" },
      {
        property: "og:description",
        content:
          "Scoped AI development workspace: deny-by-default file access, skeletonized dependencies, and sanitized model egress.",
      },
    ],
  }),
  component: SignInPage,
});

const PILLARS = [
  {
    icon: EyeOff,
    title: "Deny-by-default tree",
    body: "The VFS resolver projects only the paths your story declares. Everything else was never sent — not hidden, not filtered client-side.",
  },
  {
    icon: Scissors,
    title: "Skeletonized dependencies",
    body: "Imported modules reach the model as signatures only. Function bodies with proprietary logic are stripped before egress.",
  },
  {
    icon: ShieldCheck,
    title: "Deterministic sanitizer",
    body: "Every model response is inspected server-side before it can touch your editor. Out-of-scope writes are rejected, not warned about.",
  },
  {
    icon: KeyRound,
    title: "BYOK vault with TTL",
    body: "Your provider key is envelope-encrypted, held for the session lifetime only, and never returned to the browser.",
  },
];

function SignInPage() {
  const { signIn, user, ready } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) {
      void navigate({ to: user.role === "admin" ? "/admin" : "/work" });
    }
  }, [ready, user, navigate]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const submittedEmail = (formData.get("email") || email) as string;

    if (!submittedEmail) return;

    setBusy(true);
    setError(null);
    try {
      const u = await signIn(submittedEmail);
      await navigate({ to: u.role === "admin" ? "/admin" : "/work" });
    } catch {
      setError("Sign-in failed. Check the address and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Form side */}
      <div className="flex items-center justify-center px-6 py-14 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-sm border border-primary/50 bg-primary/12">
              <Boxes className="size-4 text-primary" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold tracking-tight">
                Scoped Workspace
              </p>
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                zero-trust build
              </p>
            </div>
          </div>

          <h1 className="mt-10 font-display text-2xl leading-tight font-semibold">
            Open the story assigned to you
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            You will see exactly the files that story requires — no repository
            browse, no directory listing, no exceptions.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="label-caps">
                Work email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="font-mono text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={busy}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Opening session…" : "Continue"}
            </Button>
          </form>

          <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-muted-foreground">
            This is the stub email login. Replace it with your OIDC provider
            before any pilot — see{" "}
            <code className="text-foreground/70">docs/DEPLOYMENT.md</code>.
          </p>
        </div>
      </div>

      {/* Explanation side */}
      <aside className="grid-canvas relative hidden border-l border-border bg-surface/40 lg:block">
        <div className="flex h-full flex-col justify-center px-12 py-16 xl:px-16">
          <p className="label-caps">The boundary</p>
          <h2 className="mt-3 max-w-md font-display text-xl leading-snug font-semibold">
            The AI and your repository never meet on this machine.
          </h2>

          <ul className="mt-9 max-w-lg space-y-6">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-surface">
                  <Icon className="size-4 text-primary" />
                </div>
                <div>
                  <p className="font-display text-sm font-semibold text-foreground">
                    {title}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-12 font-mono text-[11px] text-muted-foreground">
            developer ─┬─ scoped vfs ─── repository
            <br />
            {"           └─ sanitizer ──── model provider"}
          </p>
        </div>
      </aside>
    </main>
  );
}
