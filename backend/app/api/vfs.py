from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.ai import skeleton
from app.api.deps import Principal, current_principal, load_session_context
from app.core import audit
from app.errors import Forbidden, NotFound
from app.gitapp import ops
from app.store import store
from app.vfs.resolver import normalize
from app.vfs.tree import build_tree

router = APIRouter(tags=["vfs"])


class SaveIn(BaseModel):
    path: str
    content: str
    base_sha: str | None = None


@router.get("/vfs/{session_id}/tree")
async def get_tree(session_id: str, principal: Principal = Depends(current_principal)):
    ctx = await load_session_context(session_id, principal)

    if ctx.installation_id and settings.github_app_id:
        try:
            all_paths = await ops.list_paths(
                ctx.installation_id, ctx.repo_full_name, ctx.session.feature_branch
            )
        except Exception:
            all_paths = _demo_paths()
    else:
        all_paths = _demo_paths()

    # all_paths is the FULL repo listing and must never be returned as-is.
    tree = build_tree(ctx.resolver, all_paths)
    await audit.record(
        action="vfs.read",
        outcome="ok",
        actor_id=principal.id,
        session_id=session_id,
        target="tree",
    )
    return {"tree": tree, "file_count": sum(1 for p in all_paths if ctx.resolver.can_read(p))}


@router.get("/vfs/{session_id}/file")
async def get_file(
    session_id: str, path: str = Query(...), principal: Principal = Depends(current_principal)
):
    ctx = await load_session_context(session_id, principal)
    level = ctx.resolver.access_level(path)
    if level is None:
        await audit.deny(
            target=path, need="read", session_id=session_id, actor_id=principal.id
        )
        # 404, not 403: a 403 confirms the file exists.
        raise NotFound("file_not_found")

    if ctx.installation_id:
        data = await ops.read_file(
            ctx.installation_id, ctx.repo_full_name, ctx.session.feature_branch, path
        )
    else:
        data = {"path": path, "content": _demo_content(path), "sha": "demo", "size": 0}

    await audit.record(
        action="vfs.read", outcome="ok", actor_id=principal.id, session_id=session_id, target=path
    )
    return {**data, "access": level}


@router.get("/vfs/{session_id}/stubs")
async def get_stubs(session_id: str, principal: Principal = Depends(current_principal)):
    """Type stubs for Monaco IntelliSense.

    Without these the editor shows red squiggles on every out-of-scope import
    and the tool feels broken. This is the single biggest adoption lever in the
    whole system, and it is also a deliberate, bounded disclosure: signatures
    only, and nothing classified above INTERNAL.
    """
    ctx = await load_session_context(session_id, principal)
    stubs = []
    for path, source in _demo_dependencies().items():
        label = ctx.classification.label_for(normalize(path))
        body = skeleton.skeletonize(
            path, source, skeleton.level_for(label, is_target=False)
        )
        if body is None:
            continue
        stubs.append({"name": f"file:///{path}.d.ts", "contents": body})
    return {"stubs": stubs}


@router.put("/vfs/{session_id}/file")
async def save_file(
    session_id: str, body: SaveIn, principal: Principal = Depends(current_principal)
):
    ctx = await load_session_context(session_id, principal)
    if not ctx.resolver.can_write(body.path):
        await audit.deny(
            target=body.path, need="write", session_id=session_id, actor_id=principal.id
        )
        raise Forbidden("not_writable")

    if not ctx.installation_id:
        return {"sha": "demo"}

    result = await ops.write_file(
        ctx.installation_id,
        ctx.repo_full_name,
        ctx.session.feature_branch,
        body.path,
        body.content,
        body.base_sha,
        message=f"{ctx.story.key}: update {body.path}",
        author_email=f"{principal.id}@users.noreply.ztdev",
        trailers={
            "Story": ctx.story.key,
            "Author-Developer": principal.id,
            "Session": session_id,
            "AI-Assist": "unknown",
        },
    )
    await audit.record(
        action="git.commit",
        outcome="ok",
        actor_id=principal.id,
        session_id=session_id,
        story_id=ctx.story.id,
        target=body.path,
        detail={"commit": result.get("commit", {}).get("sha")},
    )
    return {"sha": result.get("content", {}).get("sha", "")}


# --- demo fixtures: used only when no GitHub App is installed ---------------


def _demo_paths() -> list[str]:
    return [
        "frontend/src/pages/Login.tsx",
        "frontend/src/pages/Signup.tsx",
        "frontend/src/components/Field.tsx",
        "frontend/src/api/authClient.ts",
        "frontend/src/styles.css",
        "backend/billing/charge.py",
        "backend/auth/tokens.py",
        "infra/prod.tf",
        "keys/server.pem",
        "docs/architecture.md",
    ]


def _demo_dependencies() -> dict[str, str]:
    return {
        "frontend/src/api/authClient.ts": (
            "export type SignInOptions = { persist?: boolean };\n"
            "export async function signIn(email: string, password: string, "
            "opts?: SignInOptions) {\n"
            "  const res = await fetch('/api/auth/login', { method: 'POST' });\n"
            "  return res.json();\n"
            "}\n"
        ),
        "backend/billing/charge.py": (
            "def charge_card(card_id: str, cents: int, idempotency_key: str):\n"
            "    secret = os.environ['STRIPE_SECRET']\n"
            "    return stripe.Charge.create(secret, card_id, cents)\n"
        ),
    }


def _demo_content(path: str) -> str:
    deps = _demo_dependencies()
    if path in deps:
        return deps[path]
    if path.endswith("Login.tsx"):
        return (
            "import { useState } from 'react';\n"
            "import { signIn } from '../api/authClient';\n\n"
            "export default function Login() {\n"
            "  const [email, setEmail] = useState('');\n"
            "  const [password, setPassword] = useState('');\n\n"
            "  return (\n"
            "    <form onSubmit={() => signIn(email, password)}>\n"
            "      <input value={email} onChange={(e) => setEmail(e.target.value)} />\n"
            "      <input type=\"password\" value={password}\n"
            "        onChange={(e) => setPassword(e.target.value)} />\n"
            "      <button type=\"submit\">Sign in</button>\n"
            "    </form>\n"
            "  );\n"
            "}\n"
        )
    return f"// {path}\n"


_ = store  # keep the import meaningful for the Postgres implementation
