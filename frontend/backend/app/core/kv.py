"""Upstash Redis over HTTP.

A TCP Redis client is a poor fit for serverless: connections do not survive
between invocations. Upstash's REST API is stateless HTTP, so it works from a
Vercel Function without a connection pool. Falls back to a process-local dict
for local development only.
"""

import time

import httpx

from app.config import settings


class _MemoryKV:
    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float | None]] = {}

    async def get(self, key: str) -> str | None:
        item = self._data.get(key)
        if not item:
            return None
        value, expires = item
        if expires is not None and expires < time.time():
            self._data.pop(key, None)
            return None
        return value

    async def set(self, key: str, value: str, ttl_seconds: int | None = None) -> None:
        expires = time.time() + ttl_seconds if ttl_seconds else None
        self._data[key] = (value, expires)

    async def delete(self, key: str) -> None:
        self._data.pop(key, None)


class _UpstashKV:
    def __init__(self, base: str, token: str) -> None:
        self._base = base.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}"}

    async def _cmd(self, *parts: str) -> dict:
        url = self._base + "/" + "/".join(httpx.URL(p).path.lstrip("/") or p for p in parts)
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, headers=self._headers)
            resp.raise_for_status()
            return resp.json()

    async def get(self, key: str) -> str | None:
        data = await self._cmd("get", key)
        return data.get("result")

    async def set(self, key: str, value: str, ttl_seconds: int | None = None) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            body = ["SET", key, value]
            if ttl_seconds:
                body += ["EX", str(ttl_seconds)]
            resp = await client.post(self._base, headers=self._headers, json=body)
            resp.raise_for_status()

    async def delete(self, key: str) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(self._base, headers=self._headers, json=["DEL", key])
            resp.raise_for_status()


if settings.upstash_redis_rest_url and settings.upstash_redis_rest_token:
    kv = _UpstashKV(settings.upstash_redis_rest_url, settings.upstash_redis_rest_token)
else:
    kv = _MemoryKV()
