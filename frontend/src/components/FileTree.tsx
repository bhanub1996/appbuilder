import { useState } from "react";

import type { TreeNode } from "../api/client";

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
    <ul className="tree" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {nodes.map((node) =>
        node.type === "dir" ? (
          <TreeDir
            key={node.name + depth}
            node={node}
            activePath={activePath}
            onOpen={onOpen}
            depth={depth}
          />
        ) : (
          <li key={node.path}>
            <button
              className={`tree-file ${activePath === node.path ? "is-active" : ""}`}
              onClick={() => onOpen(node.path)}
              title={node.path}
            >
              <span className="tree-label">{node.name}</span>
              {node.access === "read" && (
                <span className="badge badge-read">read</span>
              )}
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
      <button className="tree-dir" onClick={() => setOpen((v) => !v)}>
        <span className="chevron">{open ? "\u25be" : "\u25b8"}</span>
        {node.name}
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
