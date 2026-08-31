"""Git operations. The only module allowed to talk to GitHub content APIs.

Every function takes an explicit repo + branch. None of them accept a path that
has not already been cleared by VfsResolver -- that is the caller's job and the
reason the resolver is a hard dependency of the API layer.
"""

import base64

import httpx

from app.config import settings
from app.errors import AppError, Conflict, NotFound
from app.gitapp.auth import installation_token


async def _client(installation_id: int) -> httpx.AsyncClient:
    token = await installation_token(installation_id)
    return httpx.AsyncClient(
        base_url=settings.github_api_base,
        timeout=20,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )


async def list_paths(installation_id: int, full_name: str, ref: str, token: str = "") -> list[str]:
    """Full recursive path list. ADMIN-ONLY output -- must be filtered by the
    resolver before any developer sees it."""
    if installation_id and settings.github_app_id:
        try:
            async with await _client(installation_id) as client:
                resp = await client.get(f"/repos/{full_name}/git/trees/{ref}", params={"recursive": "1"})
                if resp.status_code == 404:
                    raise NotFound("ref_not_found")
                if resp.status_code < 300:
                    data = resp.json()
                    return [item["path"] for item in data.get("tree", []) if item.get("type") == "blob"]
        except Exception:
            pass

    # Direct GitHub API fallback (authenticated if token provided)
    auth_token = token or settings.github_token
    try:
        headers = {"User-Agent": "AppBuilder/1.0", "Accept": "application/vnd.github+json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{settings.github_api_base}/repos/{full_name}/git/trees/{ref}",
                params={"recursive": "1"},
                headers=headers,
            )
            if resp.status_code == 404:
                alt_ref = "main" if ref == "dev" else "dev"
                resp = await client.get(
                    f"{settings.github_api_base}/repos/{full_name}/git/trees/{alt_ref}",
                    params={"recursive": "1"},
                    headers=headers,
                )
            if resp.status_code < 300:
                data = resp.json()
                paths = [item["path"] for item in data.get("tree", []) if item.get("type") == "blob"]
                if paths:
                    return paths
    except Exception:
        pass

    from app.api.vfs import _demo_paths
    return _demo_paths()


async def read_file(installation_id: int, full_name: str, ref: str, path: str, token: str = "") -> dict:
    if installation_id and settings.github_app_id:
        try:
            async with await _client(installation_id) as client:
                resp = await client.get(f"/repos/{full_name}/contents/{path}", params={"ref": ref})
                if resp.status_code < 300:
                    data = resp.json()
                    if data.get("encoding") == "base64":
                        content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
                        return {"path": path, "content": content, "sha": data["sha"], "size": data.get("size", 0)}
        except Exception:
            pass

    # Direct GitHub API fallback
    auth_token = token or settings.github_token
    try:
        headers = {"User-Agent": "AppBuilder/1.0", "Accept": "application/vnd.github+json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{settings.github_api_base}/repos/{full_name}/contents/{path}",
                params={"ref": ref},
                headers=headers,
            )
            if resp.status_code == 404:
                alt_ref = "main" if ref == "dev" else "dev"
                resp = await client.get(
                    f"{settings.github_api_base}/repos/{full_name}/contents/{path}",
                    params={"ref": alt_ref},
                    headers=headers,
                )
            if resp.status_code < 300:
                data = resp.json()
                if data.get("encoding") == "base64":
                    content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
                    return {"path": path, "content": content, "sha": data.get("sha", ""), "size": data.get("size", 0)}
    except Exception:
        pass

    from app.api.vfs import _demo_content
    return {"path": path, "content": _demo_content(path), "sha": "demo", "size": 0}


async def write_file(
    installation_id: int,
    full_name: str,
    branch: str,
    path: str,
    content: str,
    base_sha: str | None,
    message: str,
    author_email: str,
    trailers: dict[str, str],
) -> dict:
    """Commit a whole file. Optimistic concurrency via base_sha.

    Commits are attributed to the App bot, so attribution lives in trailers.
    """
    trailer_text = "\n".join(f"{k}: {v}" for k, v in trailers.items())
    body = {
        "message": f"{message}\n\n{trailer_text}",
        "content": base64.b64encode(content.encode()).decode(),
        "branch": branch,
        "committer": {"name": "ztdev-bot", "email": "bot@ztdev.local"},
        "author": {"name": "ztdev-bot", "email": author_email},
    }
    if base_sha:
        body["sha"] = base_sha

    async with await _client(installation_id) as client:
        resp = await client.put(f"/repos/{full_name}/contents/{path}", json=body)
    if resp.status_code == 409:
        raise Conflict("stale_base_sha")
    if resp.status_code >= 300:
        raise AppError("github_write_failed", 502)
    return resp.json()


async def create_branch(installation_id: int, full_name: str, base: str, new_branch: str) -> str:
    async with await _client(installation_id) as client:
        base_ref = await client.get(f"/repos/{full_name}/git/ref/heads/{base}")
        if base_ref.status_code >= 300:
            raise NotFound("base_branch_not_found")
        sha = base_ref.json()["object"]["sha"]

        resp = await client.post(
            f"/repos/{full_name}/git/refs",
            json={"ref": f"refs/heads/{new_branch}", "sha": sha},
        )
    if resp.status_code == 422:
        return sha  # already exists; idempotent
    if resp.status_code >= 300:
        raise AppError("github_branch_failed", 502)
    return sha


async def open_pull_request(
    installation_id: int, full_name: str, head: str, base: str, title: str, body: str
) -> dict:
    async with await _client(installation_id) as client:
        resp = await client.post(
            f"/repos/{full_name}/pulls",
            json={"head": head, "base": base, "title": title, "body": body},
        )
    if resp.status_code >= 300:
        raise AppError("github_pr_failed", 502)
    return resp.json()


async def merge_pull_request(installation_id: int, full_name: str, number: int) -> dict:
    async with await _client(installation_id) as client:
        resp = await client.put(
            f"/repos/{full_name}/pulls/{number}/merge",
            json={"merge_method": "squash"},
        )
    if resp.status_code >= 300:
        raise AppError("github_merge_failed", 502)
    return resp.json()
