from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import Principal, require_admin
from app.config import settings
from app.core import audit
from app.errors import NotFound
from app.gitapp import ops
from app.models import AppLlmConfig, Grant, ProjectContext
from app.store import store

router = APIRouter(prefix="/admin", tags=["admin"])


class RepoIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    installation_id: int = 0
    default_base_branch: str = "main"
    token: str = ""


@router.get("/repos")
async def list_repos(admin: Principal = Depends(require_admin)):
    repos = await store.repos_list()
    return {
        "repos": [
            {
                "id": r.id,
                "full_name": r.full_name,
                "installation_id": r.installation_id,
                "default_base_branch": r.default_base_branch,
            }
            for r in repos
        ]
    }


@router.post("/repos")
async def onboard_repo(body: RepoIn, admin: Principal = Depends(require_admin)):
    repo = await store.create_repo(
        full_name=body.full_name,
        installation_id=body.installation_id,
        default_base_branch=body.default_base_branch,
        token=body.token,
    )
    await audit.record(
        action="repo.onboard",
        outcome="ok",
        actor_id=admin.id,
        detail={
            "repo_id": repo.id,
            "full_name": repo.full_name,
            "installation_id": repo.installation_id,
        },
    )
    return {
        "id": repo.id,
        "full_name": repo.full_name,
        "installation_id": repo.installation_id,
        "default_base_branch": repo.default_base_branch,
    }


class ProjectContextIn(BaseModel):
    description: str = ""
    architecture: str = ""
    tech_stack: str = ""
    setup_instructions: str = ""
    env_mapping: str = ""


@router.get("/repos/{repo_id}/context")
async def get_project_context(repo_id: str, admin: Principal = Depends(require_admin)):
    repo = await store.repo(repo_id)
    if not repo:
        raise NotFound("repo_not_found")
    ctx = await store.get_project_context(repo_id)
    return {
        "repo_id": ctx.repo_id,
        "description": ctx.description,
        "architecture": ctx.architecture,
        "tech_stack": ctx.tech_stack,
        "setup_instructions": ctx.setup_instructions,
        "env_mapping": ctx.env_mapping,
    }


@router.put("/repos/{repo_id}/context")
async def update_project_context(repo_id: str, body: ProjectContextIn, admin: Principal = Depends(require_admin)):
    repo = await store.repo(repo_id)
    if not repo:
        raise NotFound("repo_not_found")
    
    ctx = ProjectContext(
        repo_id=repo_id,
        description=body.description,
        architecture=body.architecture,
        tech_stack=body.tech_stack,
        setup_instructions=body.setup_instructions,
        env_mapping=body.env_mapping,
    )
    await store.save_project_context(ctx)
    await audit.record(
        action="project_context.update",
        outcome="ok",
        actor_id=admin.id,
        detail={"repo_id": repo_id},
    )
    return {"ok": True}


class ScopeIn(BaseModel):
    path_glob: str = Field(min_length=1, max_length=300)
    access_level: str = Field(pattern="^(read|write)$")


class ScopesIn(BaseModel):
    scopes: list[ScopeIn]


@router.get("/repos/{repo_id}/paths")
async def repo_paths(repo_id: str, ref: str | None = None, admin: Principal = Depends(require_admin)):
    """Full repo listing. Admin-only by construction -- this is the endpoint the
    scope picker uses, and the one thing a developer must never reach."""
    repo = await store.repo(repo_id)
    if not repo:
        raise NotFound()
    target_ref = ref or repo.default_base_branch or "main"
    try:
        return {"paths": await ops.list_paths(repo.installation_id, repo.full_name, target_ref, token=repo.token)}
    except Exception:
        from app.api.vfs import _demo_paths

        return {"paths": _demo_paths()}


class StoryCreateIn(BaseModel):
    repo_id: str
    key: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=1, max_length=200)
    developer_brief: str = ""
    internal_notes: str = ""
    acceptance_criteria: list[str] = Field(default_factory=list)
    base_branch: str = "main"
    assignee_id: str | None = None


@router.get("/stories")
async def list_stories(admin: Principal = Depends(require_admin)):
    return {
        "stories": [
            {
                "id": s.id,
                "key": s.key,
                "title": s.title,
                "status": s.status,
                "repo_id": s.repo_id,
                "assignee_id": s.assignee_id,
                "feature_branch": s.feature_branch,
                "scopes": [
                    {"path_glob": g.pattern, "access_level": g.access} for g in s.scopes
                ],
            }
            for s in store.stories.values()
        ]
    }


@router.post("/stories")
async def create_story(body: StoryCreateIn, admin: Principal = Depends(require_admin)):
    story = await store.create_story(
        repo_id=body.repo_id,
        key=body.key,
        title=body.title,
        developer_brief=body.developer_brief,
        internal_notes=body.internal_notes,
        acceptance_criteria=body.acceptance_criteria,
        base_branch=body.base_branch,
        assignee_id=body.assignee_id,
    )
    await audit.record(
        action="story.create",
        outcome="ok",
        actor_id=admin.id,
        story_id=story.id,
        detail={"key": story.key, "repo_id": story.repo_id},
    )
    return {
        "id": story.id,
        "key": story.key,
        "title": story.title,
        "status": story.status,
        "repo_id": story.repo_id,
        "assignee_id": story.assignee_id,
        "feature_branch": story.feature_branch,
        "scopes": [],
    }


@router.get("/users")
async def list_users(admin: Principal = Depends(require_admin)):
    users = await store.users_list()
    return {"users": users}


@router.get("/elevations")
async def list_elevations(admin: Principal = Depends(require_admin)):
    elevations = await store.list_elevations()
    return {
        "elevations": [
            {
                "id": e.id,
                "session_id": e.session_id,
                "pattern": e.pattern,
                "access": e.access,
                "reason": e.reason,
                "status": e.status,
                "expires_at": e.expires_at.isoformat() if e.expires_at else None,
            }
            for e in elevations
        ]
    }


@router.put("/stories/{story_id}/scopes")
async def set_scopes(
    story_id: str, body: ScopesIn, admin: Principal = Depends(require_admin)
):
    story = await store.story(story_id)
    if not story:
        raise NotFound()
    story.scopes = [
        Grant(s.path_glob, s.access_level, "story_scope") for s in body.scopes
    ]
    await audit.record(
        action="scope.change",
        outcome="ok",
        actor_id=admin.id,
        story_id=story_id,
        detail={"scopes": [(s.path_glob, s.access_level) for s in body.scopes]},
    )
    return {"ok": True, "count": len(story.scopes)}


@router.get("/audit")
async def audit_tail(limit: int = 100, admin: Principal = Depends(require_admin)):
    return {"events": store.audit[-limit:]}


class LlmConfigIn(BaseModel):
    provider: str = Field(pattern="^(openai|anthropic|local|custom)$")
    base_url: str = Field(min_length=1, max_length=300)
    api_key: str = ""
    model: str = Field(min_length=1, max_length=100)
    is_active: bool = True


@router.get("/llm-config")
async def get_llm_config(admin: Principal = Depends(require_admin)):
    cfg = await store.get_llm_config()
    masked_key = (cfg.api_key[:6] + "..." + cfg.api_key[-4:]) if len(cfg.api_key) > 10 else ("***" if cfg.api_key else "")
    return {
        "provider": cfg.provider,
        "base_url": cfg.base_url,
        "api_key": masked_key,
        "has_api_key": bool(cfg.api_key),
        "model": cfg.model,
        "is_active": cfg.is_active,
    }


@router.post("/llm-config")
async def update_llm_config(body: LlmConfigIn, admin: Principal = Depends(require_admin)):
    current = await store.get_llm_config()
    api_key = body.api_key if (body.api_key and not body.api_key.startswith("***") and "..." not in body.api_key) else current.api_key
    new_cfg = AppLlmConfig(
        provider=body.provider,
        base_url=body.base_url,
        api_key=api_key,
        model=body.model,
        is_active=body.is_active,
    )
    await store.save_llm_config(new_cfg)
    await audit.record(
        action="llm_config.update",
        outcome="ok",
        actor_id=admin.id,
        detail={"provider": body.provider, "model": body.model, "is_active": body.is_active},
    )
    return {"ok": True}


@router.post("/llm-config/test")
async def test_llm_cfg(body: LlmConfigIn, admin: Principal = Depends(require_admin)):
    current = await store.get_llm_config()
    api_key = body.api_key if (body.api_key and not body.api_key.startswith("***") and "..." not in body.api_key) else current.api_key
    cfg = AppLlmConfig(
        provider=body.provider,
        base_url=body.base_url,
        api_key=api_key,
        model=body.model,
        is_active=body.is_active,
    )
    from app.core.llm import test_llm_connection
    return await test_llm_connection(cfg)


@router.post("/stories/{story_id}/auto-scope")
async def auto_scope_story(story_id: str, admin: Principal = Depends(require_admin)):
    story = await store.story(story_id)
    if not story:
        raise NotFound("story_not_found")
    repo = await store.repo(story.repo_id)
    if not repo:
        raise NotFound("repo_not_found")

    from app.core.llm import auto_scope_files
    ref = repo.default_base_branch or "main"
    try:
        paths = await ops.list_paths(repo.installation_id, repo.full_name, ref, token=repo.token)
    except Exception:
        from app.api.vfs import _demo_paths
        paths = _demo_paths()

    cfg = await store.get_llm_config()
    result = await auto_scope_files(story, paths, cfg)
    await audit.record(
        action="story.auto_scope",
        outcome="ok",
        actor_id=admin.id,
        story_id=story_id,
        detail={"suggested_count": len(result.get("scopes", {}))},
    )
    return result
