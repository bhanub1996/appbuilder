"""Model transports.

All provider calls are server-to-server. The developer's key is decrypted, used
for one request, and dropped from the local frame. It is never logged, never
placed in an error message, and never returned in a response body.
"""

import httpx

from app.config import settings
from app.errors import AppError


async def call_anthropic(api_key: str, system: str, user: str, model: str) -> tuple[str, dict]:
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 8192,
                "temperature": 0,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
        )
    if resp.status_code >= 300:
        # Surface the status, never the body: it can contain the echoed prompt.
        raise AppError(f"provider_error_{resp.status_code}", 502)
    data = resp.json()
    text = "".join(block.get("text", "") for block in data.get("content", []))
    usage = data.get("usage", {})
    return text, {
        "input_tokens": usage.get("input_tokens"),
        "output_tokens": usage.get("output_tokens"),
    }


async def call_openai_compatible(
    api_key: str, base_url: str, system: str, user: str, model: str
) -> tuple[str, dict]:
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "temperature": 0,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
        )
    if resp.status_code >= 300:
        raise AppError(f"provider_error_{resp.status_code}", 502)
    data = resp.json()
    text = data["choices"][0]["message"]["content"] or ""
    usage = data.get("usage", {})
    return text, {
        "input_tokens": usage.get("prompt_tokens"),
        "output_tokens": usage.get("completion_tokens"),
    }


async def call_local(system: str, user: str) -> tuple[str, dict]:
    """In-house model (vLLM, OpenAI-compatible). Free to the developer.

    Vercel has no GPU runtime, so this endpoint MUST live off-Vercel. If it is
    not configured, callers fall back to the BYOK route.
    """
    if not settings.local_llm_base_url:
        raise AppError("local_llm_not_configured", 503)
    return await call_openai_compatible(
        settings.local_llm_api_key or "none",
        settings.local_llm_base_url,
        system,
        user,
        settings.local_llm_model,
    )
