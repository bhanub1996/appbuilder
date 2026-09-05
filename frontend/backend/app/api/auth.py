from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr

from app.api.deps import Principal, current_principal
from app.core import audit
from app.core.security import issue_access_token
from app.errors import Unauthorized
from app.store import store

router = APIRouter(tags=["auth"])


class LoginIn(BaseModel):
    email: EmailStr


@router.post("/auth/login")
async def login(body: LoginIn):
    """DEMO ONLY.

    Replace with your OIDC provider before a pilot. A workforce identity system
    is a prerequisite for this architecture, not an enhancement: scope
    enforcement is meaningless if identity is self-asserted.
    """
    user = await store.user_by_email(body.email)
    if not user:
        raise Unauthorized()
    await audit.record(action="auth.login", outcome="ok", actor_id=user["id"])
    return {
        "access_token": issue_access_token(user_id=user["id"], role=user["role"]),
        "user": user,
    }


@router.get("/me/assignments")
async def my_assignments(principal: Principal = Depends(current_principal)):
    stories = await store.stories_for_developer(principal.id)
    return {
        "stories": [
            {
                "id": s.id,
                "key": s.key,
                "title": s.title,
                "status": s.status,
                "developer_brief": s.developer_brief,
                "acceptance_criteria": s.acceptance_criteria,
                # internal_notes is intentionally absent.
            }
            for s in stories
        ]
    }
