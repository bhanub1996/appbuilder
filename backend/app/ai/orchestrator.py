"""The AI edit pipeline.

  1. authorize target against the resolver (deny by default)
  2. gather in-scope dependency stubs, capped and skeletonized by label
  3. assemble prompt (untrusted developer text fenced and last)
  4. EGRESS check -- deterministic, blocking
  5. route: trivial -> in-house model, otherwise -> developer's BYOK provider
  6. INGRESS check -- deterministic, blocking
  7. return a diff for human review; never auto-apply
"""

import difflib
from dataclasses import dataclass

from app.ai import prompt as prompt_mod
from app.ai import providers, sanitizer, skeleton
from app.config import settings
from app.core import audit, vault
from app.errors import Blocked, Forbidden
from app.models import Story
from app.vfs.resolver import Classification, VfsResolver, normalize

DEFAULT_MODELS = {"anthropic": "claude-3-5-sonnet-latest", "openai": "gpt-4o"}

_TRIVIAL_HINTS = (
    "rename",
    "typo",
    "comment",
    "format",
    "indent",
    "aria-label",
    "alt text",
    "console.log",
)


@dataclass
class EditResult:
    diff: str
    proposed_content: str
    route: str
    manifest: dict
    verdict: dict


def choose_route(instruction: str, target_source: str) -> str:
    """Cheap heuristic, deliberately conservative.

    Sending work to the in-house model saves the developer money but is only
    safe for edits that do not need strong reasoning. When unsure, use BYOK.
    """
    if not settings.local_llm_base_url:
        return "byok"
    lowered = instruction.lower()
    if len(instruction) < 160 and any(hint in lowered for hint in _TRIVIAL_HINTS):
        return "local"
    if len(target_source) > 40_000:
        return "byok"
    return "byok"


async def collect_stubs(
    *,
    dependency_sources: dict[str, str],
    classification: Classification,
    target_path: str,
) -> list[tuple[str, str]]:
    stubs: list[tuple[str, str]] = []
    for path, source in sorted(dependency_sources.items()):
        if path == target_path:
            continue
        label = classification.label_for(normalize(path))
        level = skeleton.level_for(label, is_target=False)
        body = skeleton.skeletonize(path, source, level)
        if body is None:
            continue  # L4: the model is not even told this file exists
        stubs.append((path, body))
        if len(stubs) >= settings.max_skeleton_files:
            break
    return stubs


async def run_edit(
    *,
    resolver: VfsResolver,
    classification: Classification,
    story: Story,
    rules: str,
    target_path: str,
    target_source: str,
    dependency_sources: dict[str, str],
    instruction: str,
    byok_provider: str | None,
    byok_key_ref: str | None,
) -> EditResult:
    session = resolver.session

    if not resolver.can_write(target_path):
        await audit.deny(
            target=target_path,
            need="write",
            session_id=session.id,
            actor_id=session.developer_id,
        )
        raise Forbidden("not_writable")

    stubs = await collect_stubs(
        dependency_sources=dependency_sources,
        classification=classification,
        target_path=target_path,
    )

    story_context = "\n".join(
        [story.developer_brief, *(f"- {c}" for c in story.acceptance_criteria)]
    ).strip()

    assembled = prompt_mod.assemble(
        target_path=target_path,
        target_source=target_source,
        stubs=stubs,
        rules=rules,
        story_context=story_context,
        instruction=instruction,
    )

    egress = sanitizer.check_egress(
        system=assembled.system,
        user=assembled.user,
        resolver=resolver,
        target_path=target_path,
        stub_paths=[p for p, _ in stubs],
        max_chars=settings.max_prompt_chars,
    )
    if not egress.passed:
        await audit.record(
            action="ai.call",
            outcome="blocked_egress",
            session_id=session.id,
            actor_id=session.developer_id,
            story_id=story.id,
            target=target_path,
            detail=egress.as_dict(),
        )
        raise Blocked("egress_blocked")

    route = choose_route(instruction, target_source)

    if route == "local":
        raw, usage = await providers.call_local(assembled.system, assembled.user)
        model_name = settings.local_llm_model
    else:
        if not byok_provider or not byok_key_ref:
            raise Forbidden("byok_required")
        api_key = await vault.get_key(byok_key_ref)
        model_name = DEFAULT_MODELS.get(byok_provider, "gpt-4.1")
        try:
            if byok_provider == "anthropic":
                raw, usage = await providers.call_anthropic(
                    api_key, assembled.system, assembled.user, model_name
                )
            else:
                raw, usage = await providers.call_openai_compatible(
                    api_key,
                    "https://api.openai.com/v1",
                    assembled.system,
                    assembled.user,
                    model_name,
                )
        finally:
            del api_key

    proposed = _strip_fences(raw)
    stub_text = "\n".join(body for _, body in stubs)

    ingress = sanitizer.check_ingress(
        response=proposed,
        system=assembled.system,
        stub_text=stub_text,
        original_source=target_source,
        target_path=target_path,
        resolver=resolver,
    )

    await audit.record(
        action="ai.call",
        outcome="ok" if ingress.passed else "blocked_ingress",
        session_id=session.id,
        actor_id=session.developer_id,
        story_id=story.id,
        target=target_path,
        detail={
            "route": route,
            "model": model_name,
            "manifest": assembled.manifest,
            "usage": usage,
            "verdict": ingress.as_dict(),
        },
    )

    if not ingress.passed:
        raise Blocked("ingress_blocked")

    diff = "".join(
        difflib.unified_diff(
            target_source.splitlines(keepends=True),
            proposed.splitlines(keepends=True),
            fromfile=f"a/{target_path}",
            tofile=f"b/{target_path}",
        )
    )

    return EditResult(
        diff=diff,
        proposed_content=proposed,
        route=route,
        manifest=assembled.manifest,
        verdict=ingress.as_dict(),
    )


def _strip_fences(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```"):
        return text
    lines = stripped.splitlines()
    if len(lines) < 2:
        return text
    body = lines[1:]
    if body and body[-1].strip().startswith("```"):
        body = body[:-1]
    return "\n".join(body)
