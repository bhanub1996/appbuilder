import { AlertTriangle, GitBranch } from "lucide-react";

import { StatusChip } from "@/components/zt/chips";
import type { StorySummary } from "@/lib/api";

export default function StoryPane({
  story,
  branch,
  stale,
}: {
  story: StorySummary;
  branch: string;
  stale: boolean;
}) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs tracking-widest text-primary">
            {story.key}
          </span>
          <StatusChip status={story.status} />
        </div>
        <h2 className="mt-1.5 text-base leading-snug font-semibold text-foreground">
          {story.title}
        </h2>
      </div>

      {story.developer_brief && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {story.developer_brief}
        </p>
      )}

      {story.acceptance_criteria.length > 0 && (
        <div>
          <p className="label-caps">Acceptance criteria</p>
          <ul className="mt-2 space-y-1.5">
            {story.acceptance_criteria.map((c) => (
              <li
                key={c}
                className="flex gap-2 text-[13px] leading-relaxed text-foreground/85"
              >
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-hairline pt-3 font-mono text-[11px] text-muted-foreground">
        <GitBranch className="size-3.5" />
        <span className="truncate">{branch}</span>
      </div>

      {stale && (
        <div className="flex gap-2 rounded-sm border border-primary/40 bg-primary/10 p-3 text-xs leading-relaxed text-primary">
          <AlertTriangle className="mt-px size-4 shrink-0" />
          <span>
            A dependency changed on the base branch. Refresh context before your
            next AI request.
          </span>
        </div>
      )}
    </div>
  );
}
