"""Scoped tree projection.

Out-of-scope siblings are omitted entirely, never sent-and-hidden. A hidden node
is a leaked node: the developer can read it in the network tab.
"""

from app.vfs.resolver import VfsResolver


def build_tree(resolver: VfsResolver, repo_paths: list[str]) -> list[dict]:
    visible = {}
    for path in repo_paths:
        level = resolver.access_level(path)
        if level is None:
            continue
        visible[path] = level

    root: dict = {}
    for path, level in sorted(visible.items()):
        parts = path.split("/")
        cursor = root
        for part in parts[:-1]:
            cursor = cursor.setdefault(part, {"__dir__": True, "children": {}})["children"]
        cursor[parts[-1]] = {"__dir__": False, "path": path, "access": level}

    def to_list(node: dict) -> list[dict]:
        out = []
        for name, value in sorted(node.items(), key=lambda kv: (not kv[1]["__dir__"], kv[0])):
            if value["__dir__"]:
                out.append({"type": "dir", "name": name, "children": to_list(value["children"])})
            else:
                out.append(
                    {
                        "type": "file",
                        "name": name,
                        "path": value["path"],
                        "access": value["access"],
                    }
                )
        return out

    return to_list(root)
