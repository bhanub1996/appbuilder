from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import Principal, current_principal, load_session_context
from app.config import settings
from app.core import audit, vault
from app.errors import Forbidden, NotFound
from app.gitapp import ops
from app.store import store

router = APIRouter(tags=["sessions"])


class OpenSessionIn(BaseModel):
    story_id: str


class ByokIn(BaseModel):
    provider: str = Field(pattern="^(openai|openai-mini|anthropic)$")
    api_key: str = Field(min_length=1, max_length=200)


def _serialize(session, stale: bool = False) -> dict:
    return {
        "session_id": session.id,
        "feature_branch": session.feature_branch,
        "expires_at": session.expires_at.isoformat(),
        "byok_configured": bool(session.byok_key_ref),
        "stale": stale,
    }


@router.post("/sessions")
async def open_session(body: OpenSessionIn, principal: Principal = Depends(current_principal)):
    story = await store.story(body.story_id)
    if not story:
        raise NotFound("story_not_found")
    if story.assignee_id and story.assignee_id != principal.id and principal.role != "admin":
        raise NotFound("story_not_found")

    existing = await store.active_session_for(principal.id, story.id)
    if existing:
        return _serialize(existing)

    repo = await store.repo(story.repo_id)
    branch = story.feature_branch or f"feature/{story.key.lower()}"

    if repo and repo.installation_id:
        await ops.create_branch(repo.installation_id, repo.full_name, story.base_branch, branch)

    story.feature_branch = branch
    if story.status == "assigned":
        story.status = "in_progress"

    session = await store.create_session(principal.id, story)
    await audit.record(
        action="session.open",
        outcome="ok",
        actor_id=principal.id,
        session_id=session.id,
        story_id=story.id,
        detail={"branch": branch, "scope_patterns": [g.pattern for g in story.scopes]},
    )
    return _serialize(session)


@router.post("/sessions/{session_id}/byok")
async def submit_byok(
    session_id: str, body: ByokIn, principal: Principal = Depends(current_principal)
):
    ctx = await load_session_context(session_id, principal)
    if ctx.session.developer_id != principal.id and principal.role != "admin":
        raise Forbidden()

    # The key must never outlive the session that justified it.
    remaining = int((ctx.session.expires_at - datetime.now(timezone.utc)).total_seconds())
    ttl = max(60, min(remaining, settings.session_ttl_seconds))
    ref = await vault.put_key(session_id, body.provider, body.api_key, ttl_seconds=ttl)

    ctx.session.byok_provider = body.provider
    ctx.session.byok_key_ref = ref
    await store.save_session(ctx.session)

    # Log that a key was registered, never any part of the key itself.
    await audit.record(
        action="byok.register",
        outcome="ok",
        actor_id=principal.id,
        session_id=session_id,
        detail={"provider": body.provider},
    )
    return {"ok": True}


@router.delete("/sessions/{session_id}", status_code=204)
async def close_session(session_id: str, principal: Principal = Depends(current_principal)):
    ctx = await load_session_context(session_id, principal)
    if ctx.session.byok_key_ref:
        await vault.drop_key(ctx.session.byok_key_ref)
        ctx.session.byok_key_ref = None
    ctx.session.status = "closed"
    await store.save_session(ctx.session)
    await audit.record(
        action="session.close", outcome="ok", actor_id=principal.id, session_id=session_id
    )


@router.post("/sessions/{session_id}/submit")
async def submit_story(session_id: str, principal: Principal = Depends(current_principal)):
    ctx = await load_session_context(session_id, principal)
    if not ctx.installation_id:
        raise Forbidden("github_app_not_installed")

    pr = await ops.open_pull_request(
        ctx.installation_id,
        ctx.repo_full_name,
        head=ctx.session.feature_branch,
        base=ctx.story.base_branch,
        title=f"{ctx.story.key}: {ctx.story.title}",
        body=(
            f"Story: {ctx.story.key}\n"
            f"Session: {ctx.session.id}\n"
            "Authored through the scoped workspace. Scope was limited to:\n"
            + "\n".join(f"- `{p}`" for p in ctx.resolver.patterns)
        ),
    )
    ctx.story.status = "submitted"
    await audit.record(
        action="story.submit",
        outcome="ok",
        actor_id=principal.id,
        session_id=session_id,
        story_id=ctx.story.id,
        detail={"pr": pr.get("number")},
    )
    return {"pull_request_url": pr.get("html_url", "")}
