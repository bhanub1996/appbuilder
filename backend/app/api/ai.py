from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.ai import orchestrator
from app.api.deps import Principal, current_principal, load_session_context
from app.api.vfs import _demo_content, _demo_dependencies
from app.errors import NotFound
from app.gitapp import ops

router = APIRouter(tags=["ai"])


class EditIn(BaseModel):
    path: str
    instruction: str = Field(min_length=3, max_length=4000)
    selection: str | None = None


@router.post("/ai/{session_id}/edit")
async def ai_edit(session_id: str, body: EditIn, principal: Principal = Depends(current_principal)):
    ctx = await load_session_context(session_id, principal)

    if not ctx.resolver.can_read(body.path):
        raise NotFound("file_not_found")

    if ctx.installation_id:
        target = await ops.read_file(
            ctx.installation_id, ctx.repo_full_name, ctx.session.feature_branch, body.path
        )
        target_source = target["content"]
    else:
        target_source = _demo_content(body.path)

    result = await orchestrator.run_edit(
        resolver=ctx.resolver,
        classification=ctx.classification,
        story=ctx.story,
        rules=ctx.rules,
        target_path=body.path,
        target_source=target_source,
        dependency_sources=_demo_dependencies(),
        instruction=body.instruction,
        byok_provider=ctx.session.byok_provider,
        byok_key_ref=ctx.session.byok_key_ref,
    )
    return {
        "diff": result.diff,
        "proposed_content": result.proposed_content,
        "route": result.route,
        "manifest": result.manifest,
    }
