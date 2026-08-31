import hashlib
import json
from datetime import datetime, timezone

from app.store import store


def _canonical(row: dict) -> str:
    return json.dumps(row, sort_keys=True, separators=(",", ":"), default=str)


async def record(
    *,
    action: str,
    outcome: str,
    actor_id: str | None = None,
    session_id: str | None = None,
    story_id: str | None = None,
    target: str | None = None,
    detail: dict | None = None,
) -> str:
    """Append a hash-chained audit row.

    The chain makes the log tamper-evident: rewriting any row invalidates every
    hash after it. Ship the tail hash to WORM storage on a schedule.
    """
    prev_hash = await store.last_audit_hash()
    row = {
        "at": datetime.now(timezone.utc).isoformat(),
        "actor_id": actor_id,
        "session_id": session_id,
        "story_id": story_id,
        "action": action,
        "target": target,
        "outcome": outcome,
        "detail": detail or {},
        "prev_hash": prev_hash,
    }
    digest = hashlib.sha256(((prev_hash or "") + _canonical(row)).encode()).hexdigest()
    row["hash"] = digest
    await store.append_audit(row)
    return digest


async def deny(*, target: str, need: str, session_id: str | None, actor_id: str | None) -> None:
    """Denials are signal, not noise. Alert on bursts from one session."""
    await record(
        action="deny",
        outcome="denied",
        actor_id=actor_id,
        session_id=session_id,
        target=target,
        detail={"need": need},
    )
