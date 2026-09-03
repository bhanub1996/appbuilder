import { ChevronDown, ChevronRight, FileCode2 } from "lucide-react";
import { useState } from "react";

import { AccessChip } from "@/components/zt/chips";
import type { TreeNode } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  nodes: TreeNode[];
  activePath: string | null;
  onOpen: (path: string) => void;
  depth?: number;
};

export default function FileTree({
  nodes,
  activePath,
  onOpen,
  depth = 0,
}: Props) {
  return (
    <ul className={cn("space-y-px", depth > 0 && "ml-2 border-l border-hairline pl-2")}>
      {nodes.map((node) =>
        node.type === "dir" ? (
          <TreeDir
            key={`${node.name}-${depth}`}
            node={node}
            activePath={activePath}
            onOpen={onOpen}
            depth={depth}
          />
        ) : (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onOpen(node.path)}
              title={node.path}
              className={cn(
                "group flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left font-mono text-xs transition-colors",
                activePath === node.path
                  ? "bg-primary/12 text-foreground shadow-[inset_2px_0_0_0_var(--color-primary)]"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              )}
            >
              <FileCode2
                className={cn(
                  "size-3.5 shrink-0",
                  activePath === node.path ? "text-primary" : "opacity-50",
                )}
              />
              <span className="flex-1 truncate">{node.name}</span>
              <AccessChip access={node.access} />
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function TreeDir({
  node,
  activePath,
  onOpen,
  depth,
}: {
  node: Extract<TreeNode, { type: "dir" }>;
  activePath: string | null;
  onOpen: (path: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left font-mono text-xs text-foreground/80 transition-colors hover:bg-surface-raised"
      >
        {open ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open && (
        <FileTree
          nodes={node.children}
          activePath={activePath}
          onOpen={onOpen}
          depth={depth + 1}
        />
      )}
    </li>
  );
}
