import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CodeDiff, languageFor } from "@/components/zt/CodeEditor";

type Props = {
  path: string;
  original: string;
  proposed: string;
  onAccept: () => void;
  onReject: () => void;
};

export default function DiffModal({
  path,
  original,
  proposed,
  onAccept,
  onReject,
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm md:p-8"
    >
      <div className="flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-md border border-border bg-surface shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-sm font-semibold">
                Proposed change
              </h3>
              <span className="font-mono text-[10px] tracking-widest text-success uppercase">
                sanitized
              </span>
            </div>
            <code className="mt-0.5 block truncate text-xs text-muted-foreground">
              {path}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onReject}>
              <X className="size-3.5" />
              Discard
            </Button>
            <Button size="sm" onClick={onAccept}>
              <Check className="size-3.5" />
              Apply to editor
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <CodeDiff
            original={original}
            proposed={proposed}
            language={languageFor(path)}
          />
        </div>
        <footer className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Applying stages the change in your editor only. Nothing reaches your
          branch until you save.
        </footer>
      </div>
    </div>
  );
}
