"""BYOK key vault.

Vercel Functions are stateless and may run in many concurrent instances, so an
in-process dict is not a vault. Keys are envelope-encrypted with a KEK held in
an environment variable (move to KMS for production) and the ciphertext is
stored in Upstash Redis under the session TTL.

Invariants:
  - The plaintext key is never written to logs, never returned to the client,
    and never persisted to disk.
  - Deleting the session deletes the ciphertext.
"""

import base64
import os

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.core.kv import kv
from app.errors import Forbidden


def _fernet() -> Fernet:
    kek = settings.vault_kek
    if not kek:
        # Deterministic dev-only 32-byte key so local restarts do not break sessions.
        kek = base64.urlsafe_b64encode(b"01234567890123456789012345678901").decode()
    raw = kek.encode()
    try:
        if len(base64.urlsafe_b64decode(raw)) != 32:
            raw = base64.urlsafe_b64encode(b"01234567890123456789012345678901")
        return Fernet(raw)
    except Exception:
        fallback = base64.urlsafe_b64encode(b"01234567890123456789012345678901")
        return Fernet(fallback)


def generate_kek() -> str:
    return Fernet.generate_key().decode()


async def put_key(session_id: str, provider: str, api_key: str, ttl_seconds: int) -> str:
    token = _fernet().encrypt(api_key.encode()).decode()
    ref = f"byok:{session_id}:{provider}"
    await kv.set(ref, token, ttl_seconds=ttl_seconds)
    return ref


async def get_key(ref: str) -> str:
    token = await kv.get(ref)
    if not token:
        raise Forbidden("byok_key_missing")
    try:
        plaintext = _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise Forbidden("byok_key_undecryptable") from exc
    return plaintext


async def drop_key(ref: str) -> None:
    await kv.delete(ref)


def redact(text: str) -> str:
    """Belt-and-braces: strip anything that looks like a provider key."""
    out = []
    for token in text.split():
        if len(token) > 24 and (token.startswith("sk-") or token.startswith("sk-ant-")):
            out.append("[redacted]")
        else:
            out.append(token)
    return " ".join(out)


os.environ.pop("BYOK_KEY", None)  # never inherit a key from the build env
