from dataclasses import dataclass, field
from datetime import datetime

ACCESS_READ = "read"
ACCESS_WRITE = "write"

LABELS = ("PUBLIC", "INTERNAL", "RESTRICTED", "SECRET")


@dataclass(frozen=True)
class Grant:
    """One materialized permission. Produced from a story scope or an elevation."""

    pattern: str
    access: str
    source: str  # "story_scope" | "elevation"
    expires_at: datetime | None = None


@dataclass
class Repository:
    id: str
    full_name: str
    installation_id: int
    default_base_branch: str = "dev"
    token: str = ""
    classifications: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class Story:
    id: str
    repo_id: str
    key: str
    title: str
    developer_brief: str = ""
    internal_notes: str = ""  # never leaves the admin surface
    acceptance_criteria: list[str] = field(default_factory=list)
    base_branch: str = "dev"
    feature_branch: str | None = None
    status: str = "draft"
    assignee_id: str | None = None
    scopes: list[Grant] = field(default_factory=list)
    kb_document_ids: list[str] = field(default_factory=list)


@dataclass
class DevSession:
    id: str
    developer_id: str
    story_id: str
    repo_id: str
    feature_branch: str
    expires_at: datetime
    status: str = "active"
    head_sha: str | None = None
    byok_provider: str | None = None
    byok_key_ref: str | None = None
    token_spend_usd: float = 0.0


@dataclass
class Elevation:
    id: str
    session_id: str
    pattern: str
    access: str
    reason: str
    status: str = "pending"
    expires_at: datetime | None = None
