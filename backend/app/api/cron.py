from fastapi import APIRouter, Header

import httpx

from app.config import settings
from app.core import audit
from app.errors import Unauthorized
from app.store import store

router = APIRouter(prefix="/internal/cron", tags=["cron"])


def _authorize(authorization: str) -> None:
    """Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.

    Without this check these endpoints are world-callable.
    """
    if not settings.cron_secret:
        raise Unauthorized("cron_secret_not_configured")
    if authorization != f"Bearer {settings.cron_secret}":
        raise Unauthorized()


@router.get("/expire-elevations")
async def expire_elevations(authorization: str = Header(default="")):
    """Backstop only.

    The resolver already treats an expired grant as absent at query time, so a
    late cron run cannot extend access. This job exists to keep the audit trail
    and the admin UI honest.
    """
    _authorize(authorization)
    count = await store.expire_elevations()
    await audit.record(action="elevation.expire", outcome="ok", detail={"expired": count})
    return {"expired": count}


@router.get("/reconcile-index")
async def reconcile_index(authorization: str = Header(default="")):
    """Nudge the external indexer.

    Vercel cannot host the continuous tree-sitter indexer: no persistent
    processes, and function duration is capped. This endpoint only asks the
    off-platform worker to reconcile.
    """
    _authorize(authorization)
    if not settings.indexer_base_url:
        return {"skipped": "indexer_not_configured"}

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{settings.indexer_base_url.rstrip('/')}/reconcile",
            headers={"Authorization": f"Bearer {settings.indexer_shared_secret}"},
        )
    await audit.record(
        action="index.reconcile", outcome="ok", detail={"status": resp.status_code}
    )
    return {"status": resp.status_code}
