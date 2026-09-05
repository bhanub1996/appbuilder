import time
import uuid

import jwt

from app.config import settings
from app.errors import Unauthorized

ALGO = "HS256"


def issue_access_token(*, user_id: str, role: str, session_id: str | None = None) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "role": role,
        "sid": session_id,
        "iss": settings.jwt_issuer,
        "iat": now,
        "exp": now + settings.access_token_ttl_seconds,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGO)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[ALGO],
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "sub", "iss"]},
        )
    except jwt.PyJWTError as exc:
        raise Unauthorized() from exc
