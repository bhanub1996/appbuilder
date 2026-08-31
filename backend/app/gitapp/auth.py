"""GitHub App authentication.

Developers never hold a token. All Git I/O uses a short-lived installation
token minted from the App's private key and cached in the KV store, so a
serverless invocation does not re-mint on every request.
"""

import time

import httpx
import jwt

from app.config import settings
from app.core.kv import kv
from app.errors import AppError

_CACHE_SKEW_SECONDS = 300


def _app_jwt() -> str:
    now = int(time.time())
    payload = {"iat": now - 60, "exp": now + 540, "iss": settings.github_app_id}
    return jwt.encode(payload, settings.github_pem, algorithm="RS256")


async def installation_token(installation_id: int) -> str:
    if not settings.github_app_id:
        raise AppError("github_app_not_configured", 503)

    cache_key = f"ghtok:{installation_id}"
    cached = await kv.get(cache_key)
    if cached:
        return cached

    url = f"{settings.github_api_base}/app/installations/{installation_id}/access_tokens"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {_app_jwt()}",
                "Accept": "application/vnd.github+json",
            },
        )
    if resp.status_code >= 300:
        raise AppError("github_token_failed", 502)

    token = resp.json()["token"]
    await kv.set(cache_key, token, ttl_seconds=3600 - _CACHE_SKEW_SECONDS)
    return token
