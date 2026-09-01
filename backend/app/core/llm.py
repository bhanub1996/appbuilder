"""Application-level LLM client and AI Auto-Scoping Engine.

Used for platform-level intelligence such as automated story scoping,
blast radius minimization, and triage without requiring developer BYOK keys.
"""

import json
import re
import httpx

from app.models import AppLlmConfig, Story


async def test_llm_connection(config: AppLlmConfig) -> dict:
    """Test connectivity to the configured LLM provider."""
    provider = config.provider.lower()
    base_url = config.base_url.rstrip("/")
    api_key = config.api_key.strip()
    model = config.model.strip()

    system = "You are a health check probe. Respond only with the word 'PONG'."
    user = "PING"

    try:
        if provider == "anthropic":
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{base_url}/v1/messages" if "v1" not in base_url else f"{base_url}/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model or "claude-3-5-haiku-20241022",
                        "max_tokens": 10,
                        "temperature": 0,
                        "system": system,
                        "messages": [{"role": "user", "content": user}],
                    },
                )
                if resp.status_code >= 300:
                    return {"ok": False, "error": f"Anthropic error ({resp.status_code}): {resp.text[:200]}"}
                return {"ok": True, "message": f"Anthropic connected successfully with model {model}!"}

        # OpenAI / Local / Custom OpenAI-compatible
        endpoint = f"{base_url}/chat/completions" if not base_url.endswith("/chat/completions") else base_url
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                endpoint,
                headers=headers,
                json={
                    "model": model or "gpt-4o-mini",
                    "max_tokens": 10,
                    "temperature": 0,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
            if resp.status_code >= 300:
                return {"ok": False, "error": f"LLM error ({resp.status_code}): {resp.text[:200]}"}
            return {"ok": True, "message": f"LLM connected successfully with model {model}!"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def auto_scope_files(
    story: Story,
    repo_paths: list[str],
    config: AppLlmConfig | None = None,
) -> dict:
    """Analyze story requirements and predict the minimal required file scopes."""
    if not repo_paths:
        return {"scopes": {}, "reasoning": "No repository files available."}

    # If LLM is active and configured, use AI reasoning
    if config and config.is_active and (config.api_key or "localhost" in config.base_url or "127.0.0.1" in config.base_url):
        try:
            ai_result = await _call_llm_for_scoping(story, repo_paths, config)
            if ai_result and ai_result.get("scopes"):
                return ai_result
        except Exception:
            pass

    # Smart fallback heuristic
    return _heuristic_auto_scoping(story, repo_paths)


async def _call_llm_for_scoping(story: Story, repo_paths: list[str], config: AppLlmConfig) -> dict:
    system_prompt = (
        "You are an expert Zero-Trust Security & Software Architect.\n"
        "Your task is to analyze a User Story and select the MINIMAL set of files (scope) needed from the repository.\n"
        "Rules:\n"
        "1. Mark as 'write': Files that the developer must create or modify to fulfill the story.\n"
        "2. Mark as 'read': Files needed for reference, types, schemas, styles, or direct dependencies.\n"
        "3. Strict Zero-Trust: Do not include unrelated files. Keep blast radius minimal.\n"
        "4. Output MUST be valid JSON only with this schema:\n"
        '{"scopes": {"exact/path/from/list.tsx": "write", "exact/path/from/list.ts": "read"}, "reasoning": "Explanation"}'
    )

    criteria_str = "\n".join(f"- {c}" for c in story.acceptance_criteria)
    user_prompt = (
        f"Story Key: {story.key}\n"
        f"Story Title: {story.title}\n"
        f"Developer Brief: {story.developer_brief}\n"
        f"Acceptance Criteria:\n{criteria_str}\n\n"
        f"Available Repository Paths ({len(repo_paths)} files):\n"
        + "\n".join(repo_paths[:200])  # Cap at 200 paths
    )

    provider = config.provider.lower()
    base_url = config.base_url.rstrip("/")
    api_key = config.api_key.strip()
    model = config.model.strip() or ("gpt-4o-mini" if provider == "openai" else "claude-3-5-haiku-20241022")

    if provider == "anthropic":
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{base_url}/v1/messages" if "v1" not in base_url else f"{base_url}/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 1500,
                    "temperature": 0,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            data = resp.json()
            raw_text = "".join(b.get("text", "") for b in data.get("content", []))
    else:
        endpoint = f"{base_url}/chat/completions" if not base_url.endswith("/chat/completions") else base_url
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                endpoint,
                headers=headers,
                json={
                    "model": model,
                    "temperature": 0,
                    "response_format": {"type": "json_object"} if "gpt" in model else None,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            data = resp.json()
            raw_text = data["choices"][0]["message"]["content"]

    # Parse JSON from text
    match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if match:
        parsed = json.loads(match.group(0))
        # Filter only valid repo paths
        valid_scopes = {
            p: level
            for p, level in parsed.get("scopes", {}).items()
            if p in repo_paths and level in ("read", "write")
        }
        return {
            "scopes": valid_scopes,
            "reasoning": parsed.get("reasoning", "Scoped based on LLM analysis."),
        }
    return {}


def _heuristic_auto_scoping(story: Story, repo_paths: list[str]) -> dict:
    """Smart zero-trust keyword and path pattern matching fallback."""
    text = f"{story.key} {story.title} {story.developer_brief} {' '.join(story.acceptance_criteria)}".lower()
    keywords = set(re.findall(r"[a-z0-9_\-]+", text))

    # Remove generic English stop words
    stop_words = {"the", "and", "a", "to", "in", "for", "is", "of", "with", "add", "setup", "create", "on", "this", "from"}
    meaningful = keywords - stop_words

    matched_scopes: dict[str, str] = {}

    for path in repo_paths:
        path_lower = path.lower()
        path_tokens = set(re.findall(r"[a-z0-9_\-]+", path_lower))

        overlap = meaningful.intersection(path_tokens)
        if overlap:
            # If path strongly relates to UI/feature being edited
            if any(t in path_lower for t in ("page", "component", "router", "view", "api", "service")):
                matched_scopes[path] = "write"
            elif any(t in path_lower for t in ("type", "model", "schema", "style", "css", "client", "util")):
                matched_scopes[path] = "read"
            else:
                matched_scopes[path] = "write" if len(overlap) >= 2 else "read"

    # Default fallback: if no direct keyword match, scope primary entrypoints
    if not matched_scopes and repo_paths:
        for path in repo_paths:
            if any(path.endswith(ext) for ext in ("Login.tsx", "App.tsx", "main.py", "styles.css", "client.ts")):
                matched_scopes[path] = "write" if "tsx" in path or "py" in path else "read"

    return {
        "scopes": matched_scopes,
        "reasoning": f"Smart Auto-Scope matched {len(matched_scopes)} paths based on story keywords.",
    }
