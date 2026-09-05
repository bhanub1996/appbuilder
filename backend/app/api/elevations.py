from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import Principal, current_principal, load_session_context, require_admin
from app.core import audit
from app.errors import Forbidden, NotFound
from app.store import store

router = APIRouter(tags=["elevations"])

MAX_TTL_HOURS = 24
DEFAULT_TTL_HOURS = 8


class ElevationIn(BaseModel):
    session_id: str
    path_glob: str = Field(min_length=1, max_length=300)
    access_level: str = Field(default="read", pattern="^(read|write)$")
    reason: str = Field(min_length=10, max_length=1000)


class DecisionIn(BaseModel):
    decision: str = Field(pattern="^(approve|deny|revoke)$")
    ttl_hours: int = Field(default=DEFAULT_TTL_HOURS, ge=1, le=MAX_TTL_HOURS)


@router.post("/elevations")
async def request_elevation(
    body: ElevationIn, principal: Principal = Depends(current_principal)
):
    """Requesting is always allowed. Granting is not, and never automatic.

    A reason is mandatory because the reason is what the reviewer audits, and
    because it makes fishing expeditions visible.
    """
    ctx = await load_session_context(body.session_id, principal)
    if ctx.session.developer_id != principal.id:
        raise Forbidden()

    if "*" == body.path_glob.strip() or body.path_glob.strip() in ("**", "/*", "**/*"):
        raise Forbidden("whole_repo_elevation_not_allowed")

    elev = await store.create_elevation(
        body.session_id, body.path_glob, body.access_level, body.reason
    )
    await audit.record(
        action="elevation.request",
        outcome="pending",
        actor_id=principal.id,
        session_id=body.session_id,
        target=body.path_glob,
        detail={"reason": body.reason, "access": body.access_level},
    )
    return {"id": elev.id, "status": elev.status}


@router.patch("/elevations/{elevation_id}")
async def decide_elevation(
    elevation_id: str, body: DecisionIn, admin: Principal = Depends(require_admin)
):
    elev = await store.elevation(elevation_id)
    if not elev:
        raise NotFound()

    if body.decision == "approve":
        elev.status = "approved"
        elev.expires_at = datetime.now(timezone.utc) + timedelta(hours=body.ttl_hours)
    elif body.decision == "deny":
        elev.status = "denied"
    else:
        elev.status = "revoked"
        elev.expires_at = datetime.now(timezone.utc)

    await store.save_elevation(elev)
    await audit.record(
        action="elevation.grant",
        outcome=elev.status,
        actor_id=admin.id,
        session_id=elev.session_id,
        target=elev.pattern,
        detail={"ttl_hours": body.ttl_hours if body.decision == "approve" else None},
    )
    return {"id": elev.id, "status": elev.status}
