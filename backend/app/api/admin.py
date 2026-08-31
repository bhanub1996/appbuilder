from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import Principal, require_admin
from app.config import settings
from app.core import audit
from app.errors import NotFound
from app.gitapp import ops
from app.models import Grant
from app.store import store

router = APIRouter(prefix="/admin", tags=["admin"])


class RepoIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    installation_id: int
    default_base_branch: str = "dev"


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


class ScopeIn(BaseModel):
    path_glob: str = Field(min_length=1, max_length=300)
    access_level: str = Field(pattern="^(read|write)$")


class ScopesIn(BaseModel):
    scopes: list[ScopeIn]


@router.get("/repos/{repo_id}/paths")
async def repo_paths(repo_id: str, ref: str = "dev", admin: Principal = Depends(require_admin)):
    """Full repo listing. Admin-only by construction -- this is the endpoint the
    scope picker uses, and the one thing a developer must never reach."""
    repo = await store.repo(repo_id)
    if not repo:
        raise NotFound()
    if not repo.installation_id or not settings.github_app_id:
        from app.api.vfs import _demo_paths

        return {"paths": _demo_paths()}
    try:
        return {"paths": await ops.list_paths(repo.installation_id, repo.full_name, ref)}
    except Exception:
        from app.api.vfs import _demo_paths

        return {"paths": _demo_paths()}


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
