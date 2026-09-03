import { Link, useNavigate } from "@tanstack/react-router";
import { Boxes, LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth";

export default function TopBar({ children }: { children?: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      <Link to="/work" className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-xs border border-primary/50 bg-primary/12">
          <Boxes className="size-3.5 text-primary" />
        </div>
        <span className="font-display text-[13px] font-semibold tracking-tight">
          Scoped Workspace
        </span>
      </Link>

      <div className="min-w-0 flex-1">{children}</div>

      {user?.role === "admin" && (
        <Link
          to="/admin"
          className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase transition-colors hover:text-primary"
        >
          admin
        </Link>
      )}

      {user && (
        <div className="flex items-center gap-3 border-l border-hairline pl-4">
          <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
            {user.email}
          </span>
          <button
            type="button"
            title="Sign out"
            onClick={() => {
              signOut();
              void navigate({ to: "/" });
            }}
            className="text-muted-foreground transition-colors hover:text-danger"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      )}
    </header>
  );
}
