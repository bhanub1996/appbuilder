import hashlib
import hmac

from fastapi import APIRouter, Header, Request

from app.config import settings
from app.core import audit
from app.errors import Unauthorized
from app.store import store

router = APIRouter(tags=["webhooks"])


def _verify(body: bytes, signature: str) -> None:
    if not settings.github_webhook_secret:
        raise Unauthorized("webhook_secret_not_configured")
    expected = "sha256=" + hmac.new(
        settings.github_webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature or ""):
        raise Unauthorized("bad_signature")


@router.post("/webhooks/github")
async def github_webhook(
    request: Request,
    x_hub_signature_256: str = Header(default=""),
    x_github_event: str = Header(default=""),
):
    raw = await request.body()
    _verify(raw, x_hub_signature_256)
    payload = await request.json()

    if x_github_event == "push":
        await _on_push(payload)
    elif x_github_event == "pull_request":
        await audit.record(
            action="github.pull_request",
            outcome=payload.get("action", ""),
            target=str(payload.get("number", "")),
        )

    return {"ok": True}


async def _on_push(payload: dict) -> None:
    """Staleness invalidation.

    If another PR merged a file that an active session depends on, that session's
    cached signatures are wrong. Generating code against a stale API contract
    produces confident, broken output -- so mark the session stale and force a
    context refresh before its next AI request.

    Reindexing itself is NOT done here. Vercel functions are request-scoped and
    tree-sitter parsing of a large repo will not finish inside the limit. This
    handler enqueues; the external indexer does the work.
    """
    changed: set[str] = set()
    for commit in payload.get("commits", []):
        for key in ("added", "modified", "removed"):
            changed.update(commit.get(key, []))

    if not changed:
        return

    touched = 0
    for session in store.sessions.values():
        if session.status != "active":
            continue
        grants = await store.grants_for_session(session)
        patterns = [g.pattern for g in grants]
        from fnmatch import fnmatch

        if any(fnmatch(path, pattern) for path in changed for pattern in patterns):
            session.status = "stale"
            touched += 1

    await audit.record(
        action="index.invalidate",
        outcome="ok",
        detail={"changed_files": len(changed), "sessions_marked_stale": touched},
    )
