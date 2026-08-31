from dataclasses import dataclass

from fastapi import Header

from app.core.security import decode_access_token
from app.errors import Forbidden, NotFound, Unauthorized
from app.models import DevSession, Story
from app.store import store
from app.vfs.resolver import Classification, VfsResolver


@dataclass
class Principal:
    id: str
    role: str


async def current_principal(authorization: str = Header(default="")) -> Principal:
    if not authorization.startswith("Bearer "):
        raise Unauthorized()
    claims = decode_access_token(authorization[7:])
    return Principal(id=claims["sub"], role=claims.get("role", "developer"))


async def require_admin(authorization: str = Header(default="")) -> Principal:
    principal = await current_principal(authorization)
    if principal.role != "admin":
        raise Forbidden()
    return principal


@dataclass
class SessionContext:
    principal: Principal
    session: DevSession
    story: Story
    resolver: VfsResolver
    repo_full_name: str
    installation_id: int
    rules: str
    classification: Classification


async def load_session_context(session_id: str, principal: Principal) -> SessionContext:
    """Single place where a session is turned into a permission set.

    Ownership, status, and expiry are all checked here. No route may build a
    VfsResolver by any other path.
    """
    session = await store.session(session_id)
    if not session:
        raise NotFound("session_not_found")
    if session.developer_id != principal.id and principal.role != "admin":
        # Do not distinguish "not yours" from "does not exist".
        raise NotFound("session_not_found")
    if session.status != "active":
        raise Forbidden("session_inactive")

    story = await store.story(session.story_id)
    repo = await store.repo(session.repo_id)
    if not story or not repo:
        raise NotFound("story_not_found")

    classification = Classification(repo.classifications)
    grants = await store.grants_for_session(session)
    resolver = VfsResolver(session, grants, classification)

    return SessionContext(
        principal=principal,
        session=session,
        story=story,
        resolver=resolver,
        repo_full_name=repo.full_name,
        installation_id=repo.installation_id,
        rules=await store.rules_for_repo(repo.id),
        classification=classification,
    )
