"""Data access.

Two implementations behind one interface:

  MemoryStore   - boots with seed data so the app runs with zero infrastructure.
                  Do not use beyond local demo: it is per-instance, and Vercel
                  runs many instances.
  PostgresStore - stub with the intended queries. Wire asyncpg against a POOLED
                  Neon/Supabase URL. See docs/DEPLOYMENT.md section 2.

Everything returns plain dataclasses so the API layer never sees SQL rows.
"""

import uuid
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.models import ACCESS_READ, ACCESS_WRITE, DevSession, Elevation, Grant, Repository, Story


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MemoryStore:
    def __init__(self) -> None:
        self.users: dict[str, dict] = {}
        self.repos: dict[str, Repository] = {}
        self.stories: dict[str, Story] = {}
        self.sessions: dict[str, DevSession] = {}
        self.elevations: dict[str, Elevation] = {}
        self.audit: list[dict] = []
        self.global_rules: dict[str, str] = {}
        self._seed()

    def _seed(self) -> None:
        admin_id = "11111111-1111-1111-1111-111111111111"
        dev_id = "22222222-2222-2222-2222-222222222222"
        bhanu_id = "55555555-5555-5555-5555-555555555555"
        self.users = {
            "admin@company.com": {"id": admin_id, "email": "admin@company.com", "role": "admin"},
            "dev@company.com": {"id": dev_id, "email": "dev@company.com", "role": "developer"},
            "bhanu@company.com": {"id": bhanu_id, "email": "bhanu@company.com", "role": "admin"},
            "bhanub1996@gmail.com": {"id": bhanu_id, "email": "bhanub1996@gmail.com", "role": "admin"},
        }

        repo_id = "33333333-3333-3333-3333-333333333333"
        self.repos[repo_id] = Repository(
            id=repo_id,
            full_name="acme/storefront",
            installation_id=0,
            default_base_branch="dev",
            classifications=[
                ("infra/*", "SECRET"),
                ("*.pem", "SECRET"),
                ("backend/billing/*", "RESTRICTED"),
                ("backend/*", "RESTRICTED"),
                ("frontend/*", "INTERNAL"),
                ("docs/*", "PUBLIC"),
            ],
        )

        story_id = "44444444-4444-4444-4444-444444444444"
        self.stories[story_id] = Story(
            id=story_id,
            repo_id=repo_id,
            key="STORE-412",
            title="Add remember-me to the login form",
            developer_brief=(
                "Add a persistent-session checkbox to the login form. Pass the flag through the "
                "existing auth client call. Do not change token lifetimes."
            ),
            internal_notes="Legal wants a 30-day cap; do not surface that to the vendor team.",
            acceptance_criteria=[
                "Checkbox renders below the password field and is keyboard reachable.",
                "Unchecked is the default.",
                "The flag reaches the auth client without changing its signature.",
            ],
            base_branch="dev",
            feature_branch="feature/store-412",
            status="assigned",
            assignee_id=dev_id,
            scopes=[
                Grant("frontend/src/pages/Login.tsx", ACCESS_WRITE, "story_scope"),
                Grant("frontend/src/components/*", ACCESS_WRITE, "story_scope"),
                Grant("frontend/src/api/authClient.ts", ACCESS_READ, "story_scope"),
                Grant("frontend/src/styles.css", ACCESS_WRITE, "story_scope"),
            ],
        )

        self.global_rules[repo_id] = (
            "- Use the existing design tokens in styles.css. Never add a CSS framework.\n"
            "- No new runtime dependencies without an admin-approved exception.\n"
            "- All interactive elements must be keyboard reachable and labelled.\n"
            "- Never widen an exported function signature; add an optional field instead."
        )

    # --- users -------------------------------------------------------------
    async def user_by_email(self, email: str) -> dict | None:
        clean = email.lower().strip()
        if clean not in self.users:
            role = "admin" if ("admin" in clean or "bhanu" in clean or len(self.users) <= 4) else "developer"
            self.users[clean] = {
                "id": str(uuid.uuid4()),
                "email": clean,
                "role": role,
            }
        return self.users.get(clean)

    async def users_list(self) -> list[dict]:
        return list(self.users.values())

    # --- stories -----------------------------------------------------------
    async def stories_for_developer(self, developer_id: str) -> list[Story]:
        return [
            s
            for s in self.stories.values()
            if s.assignee_id == developer_id and s.status not in ("merged", "cancelled")
        ]

    async def story(self, story_id: str) -> Story | None:
        return self.stories.get(story_id)

    async def create_story(
        self,
        repo_id: str,
        key: str,
        title: str,
        developer_brief: str = "",
        internal_notes: str = "",
        acceptance_criteria: list[str] | None = None,
        base_branch: str = "main",
        assignee_id: str | None = None,
    ) -> Story:
        story = Story(
            id=str(uuid.uuid4()),
            repo_id=repo_id,
            key=key,
            title=title,
            developer_brief=developer_brief,
            internal_notes=internal_notes,
            acceptance_criteria=acceptance_criteria or [],
            base_branch=base_branch,
            feature_branch=f"feature/{key.lower()}",
            status="assigned" if assignee_id else "draft",
            assignee_id=assignee_id,
            scopes=[],
        )
        self.stories[story.id] = story
        return story

    async def repo(self, repo_id: str) -> Repository | None:
        return self.repos.get(repo_id)

    async def repos_list(self) -> list[Repository]:
        return list(self.repos.values())

    async def create_repo(
        self,
        full_name: str,
        installation_id: int,
        default_base_branch: str,
        token: str = "",
    ) -> Repository:
        repo = Repository(
            id=str(uuid.uuid4()),
            full_name=full_name,
            installation_id=installation_id,
            default_base_branch=default_base_branch,
            token=token,
            classifications=[
                ("infra/*", "SECRET"),
                ("*.pem", "SECRET"),
                ("backend/billing/*", "RESTRICTED"),
                ("backend/*", "RESTRICTED"),
                ("frontend/*", "INTERNAL"),
                ("docs/*", "PUBLIC"),
            ],
        )
        self.repos[repo.id] = repo
        return repo

    async def rules_for_repo(self, repo_id: str) -> str:
        return self.global_rules.get(repo_id, "")

    # --- sessions ----------------------------------------------------------
    async def active_session_for(self, developer_id: str, story_id: str) -> DevSession | None:
        for s in self.sessions.values():
            if (
                s.developer_id == developer_id
                and s.story_id == story_id
                and s.status == "active"
                and s.expires_at > _now()
            ):
                return s
        return None

    async def create_session(self, developer_id: str, story: Story) -> DevSession:
        session = DevSession(
            id=str(uuid.uuid4()),
            developer_id=developer_id,
            story_id=story.id,
            repo_id=story.repo_id,
            feature_branch=story.feature_branch or f"feature/{story.key.lower()}",
            expires_at=_now() + timedelta(seconds=settings.session_ttl_seconds),
        )
        self.sessions[session.id] = session
        return session

    async def session(self, session_id: str) -> DevSession | None:
        return self.sessions.get(session_id)

    async def save_session(self, session: DevSession) -> None:
        self.sessions[session.id] = session

    # --- grants ------------------------------------------------------------
    async def grants_for_session(self, session: DevSession) -> list[Grant]:
        """Story scopes plus any APPROVED, UNEXPIRED elevation. Nothing else."""
        story = self.stories.get(session.story_id)
        grants = list(story.scopes) if story else []
        for elev in self.elevations.values():
            if elev.session_id != session.id or elev.status != "approved":
                continue
            grants.append(
                Grant(elev.pattern, elev.access, "elevation", expires_at=elev.expires_at)
            )
        return grants

    async def create_elevation(
        self, session_id: str, pattern: str, access: str, reason: str
    ) -> Elevation:
        elev = Elevation(
            id=str(uuid.uuid4()),
            session_id=session_id,
            pattern=pattern,
            access=access,
            reason=reason,
        )
        self.elevations[elev.id] = elev
        return elev

    async def elevation(self, elevation_id: str) -> Elevation | None:
        return self.elevations.get(elevation_id)

    async def save_elevation(self, elev: Elevation) -> None:
        self.elevations[elev.id] = elev

    async def expire_elevations(self) -> int:
        count = 0
        for elev in self.elevations.values():
            if (
                elev.status == "approved"
                and elev.expires_at is not None
                and elev.expires_at <= _now()
            ):
                elev.status = "expired"
                count += 1
        return count

    async def list_elevations(self) -> list[Elevation]:
        return list(self.elevations.values())

    # --- audit -------------------------------------------------------------
    async def last_audit_hash(self) -> str | None:
        return self.audit[-1]["hash"] if self.audit else None

    async def append_audit(self, row: dict) -> None:
        self.audit.append(row)


class PostgresStore(MemoryStore):
    """Intentional stub.

    Replace each method with an asyncpg query. Two non-obvious requirements:

    1. Open the connection with the POOLED Neon/Supabase URL. Serverless
       invocations do not share a pool, so an unpooled URL will exhaust
       max_connections under modest concurrency.
    2. Before any query that touches kb_chunks, issue
           SET LOCAL app.session_id = $1
       inside the transaction so the RLS policy in migrations/0001_init.sql can
       enforce scope at the database layer. Application-layer filtering is the
       first gate, not the only one.
    """


store: MemoryStore = PostgresStore() if settings.database_url else MemoryStore()
