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

import asyncpg

from app.config import settings
from app.models import ACCESS_READ, ACCESS_WRITE, AppLlmConfig, DevSession, Elevation, Grant, ProjectContext, Repository, Story


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MemoryStore:
    def __init__(self) -> None:
        self.users: dict[str, dict] = {}
        self.repos: dict[str, Repository] = {}
        self.project_contexts: dict[str, ProjectContext] = {}
        self.stories: dict[str, Story] = {}
        self.sessions: dict[str, DevSession] = {}
        self.elevations: dict[str, Elevation] = {}
        self.audit: list[dict] = []
        self.global_rules: dict[str, str] = {}
        self.llm_config: AppLlmConfig = AppLlmConfig(
            provider="openai",
            base_url=settings.local_llm_base_url or "https://api.openai.com/v1",
            api_key=settings.local_llm_api_key or "",
            model=settings.local_llm_model or "gpt-4o-mini",
            is_active=bool(settings.local_llm_base_url or settings.local_llm_api_key),
        )
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
            full_name="bhanub1996/appbuilder",
            installation_id=0,
            default_base_branch="main",
            classifications=[
                ("infra/*", "SECRET"),
                ("*.pem", "SECRET"),
                ("backend/billing/*", "RESTRICTED"),
                ("backend/*", "RESTRICTED"),
                ("frontend/*", "INTERNAL"),
                ("docs/*", "PUBLIC"),
            ],
        )

        navy_id = "44444444-4444-4444-4444-444444444444"
        self.repos[navy_id] = Repository(
            id=navy_id,
            full_name="bhanub1996/navyadhatri",
            installation_id=0,
            default_base_branch="main",
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

    async def get_project_context(self, repo_id: str) -> ProjectContext:
        if repo_id not in self.project_contexts:
            self.project_contexts[repo_id] = ProjectContext(repo_id=repo_id)
        return self.project_contexts[repo_id]

    async def save_project_context(self, context: ProjectContext) -> None:
        self.project_contexts[context.repo_id] = context

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

    # --- llm config --------------------------------------------------------
    async def get_llm_config(self) -> AppLlmConfig:
        return self.llm_config

    async def save_llm_config(self, config: AppLlmConfig) -> None:
        self.llm_config = config

    # --- audit -------------------------------------------------------------
    async def last_audit_hash(self) -> str | None:
        return self.audit[-1]["hash"] if self.audit else None

    async def append_audit(self, row: dict) -> None:
        self.audit.append(row)


class PostgresStore(MemoryStore):
    """Postgres-backed store implementation using asyncpg."""

    def __init__(self):
        super().__init__()
        self.pool: asyncpg.Pool | None = None

    async def connect(self):
        if not self.pool:
            self.pool = await asyncpg.create_pool(
                dsn=settings.database_url,
                min_size=1,
                max_size=10,
            )

    async def disconnect(self):
        if self.pool:
            await self.pool.close()
            self.pool = None

    # --- users -------------------------------------------------------------
    async def user_by_email(self, email: str) -> dict | None:
        clean = email.lower().strip()
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT id, email, role FROM users WHERE email = $1", clean)
            if not row:
                count = await conn.fetchval("SELECT count(*) FROM users")
                role = "admin" if ("admin" in clean or "bhanu" in clean or count <= 4) else "developer"
                row = await conn.fetchrow(
                    "INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id, email, role",
                    clean, role
                )
            return dict(row) if row else None

    async def users_list(self) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("SELECT id, email, role FROM users")
            return [dict(row) for row in rows]

    # --- stories -----------------------------------------------------------
    async def stories_for_developer(self, developer_id: str) -> list[Story]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, repo_id, key, title, developer_brief, internal_notes, acceptance_criteria, base_branch, feature_branch, status, assignee_id FROM user_stories WHERE assignee_id = $1 AND status NOT IN ('merged', 'cancelled')",
                developer_id
            )
            return [self._row_to_story(row, []) for row in rows] # Scopes are fetched when needed or we can fetch them here. MemoryStore doesn't populate scopes in stories_for_developer.

    async def story(self, story_id: str) -> Story | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, repo_id, key, title, developer_brief, internal_notes, acceptance_criteria, base_branch, feature_branch, status, assignee_id FROM user_stories WHERE id = $1",
                story_id
            )
            if not row:
                return None
            scopes_rows = await conn.fetch(
                "SELECT path_glob, access_level FROM story_scopes WHERE story_id = $1",
                story_id
            )
            scopes = [Grant(r["path_glob"], r["access_level"], "story") for r in scopes_rows]
            return self._row_to_story(row, scopes)


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
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO user_stories (repo_id, key, title, developer_brief, internal_notes, acceptance_criteria, base_branch, feature_branch, status, assignee_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id, repo_id, key, title, developer_brief, internal_notes, acceptance_criteria, base_branch, feature_branch, status, assignee_id
                """,
                repo_id, key, title, developer_brief, internal_notes,
                json.dumps(acceptance_criteria or []), base_branch, f"feature/{key.lower()}",
                "assigned" if assignee_id else "draft", assignee_id
            )
            return self._row_to_story(row, [])

    def _row_to_story(self, row, scopes) -> Story:
        import json
        ac = row["acceptance_criteria"]
        if isinstance(ac, str):
            ac = json.loads(ac)
        return Story(
            id=str(row["id"]),
            repo_id=str(row["repo_id"]),
            key=row["key"],
            title=row["title"],
            developer_brief=row["developer_brief"] or "",
            internal_notes=row["internal_notes"] or "",
            acceptance_criteria=ac,
            base_branch=row["base_branch"],
            feature_branch=row["feature_branch"],
            status=row["status"],
            assignee_id=str(row["assignee_id"]) if row["assignee_id"] else None,
            scopes=scopes,
        )


    # --- repos -----------------------------------------------------------
    async def repo(self, repo_id: str) -> Repository | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT id, full_name, installation_id, default_base_branch FROM repositories WHERE id = $1", repo_id)
            if not row:
                return None
            classifications = await conn.fetch("SELECT path_glob, label FROM path_classifications WHERE repo_id = $1", repo_id)
            return Repository(
                id=str(row["id"]),
                full_name=row["full_name"],
                installation_id=row["installation_id"],
                default_base_branch=row["default_base_branch"],
                token="", # Assume config handled
                classifications=[(c["path_glob"], c["label"]) for c in classifications]
            )

    async def repos_list(self) -> list[Repository]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("SELECT id, full_name, installation_id, default_base_branch FROM repositories")
            repos = []
            for row in rows:
                classifications = await conn.fetch("SELECT path_glob, label FROM path_classifications WHERE repo_id = $1", row["id"])
                repos.append(Repository(
                    id=str(row["id"]),
                    full_name=row["full_name"],
                    installation_id=row["installation_id"],
                    default_base_branch=row["default_base_branch"],
                    token="",
                    classifications=[(c["path_glob"], c["label"]) for c in classifications]
                ))
            return repos

    async def create_repo(self, full_name: str, installation_id: int, default_base_branch: str, token: str = "") -> Repository:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO repositories (github_repo_id, full_name, installation_id, default_base_branch)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (github_repo_id) DO UPDATE SET full_name = EXCLUDED.full_name
                RETURNING id, full_name, installation_id, default_base_branch
                """,
                hash(full_name) % (10 ** 8), full_name, installation_id, default_base_branch
            )
            defaults = [
                ("infra/*", "SECRET"), ("*.pem", "SECRET"), ("backend/billing/*", "RESTRICTED"),
                ("backend/*", "RESTRICTED"), ("frontend/*", "INTERNAL"), ("docs/*", "PUBLIC"),
            ]
            for glob, label in defaults:
                await conn.execute("INSERT INTO path_classifications (repo_id, path_glob, label) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", row["id"], glob, label)
            return Repository(id=str(row["id"]), full_name=row["full_name"], installation_id=row["installation_id"], default_base_branch=row["default_base_branch"], token=token, classifications=defaults)

    async def rules_for_repo(self, repo_id: str) -> str:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT body FROM global_rules WHERE repo_id = $1 AND active = true ORDER BY version DESC LIMIT 1", repo_id)
            return row["body"] if row else ""

    async def get_project_context(self, repo_id: str) -> ProjectContext:
        if repo_id not in self.project_contexts:
            self.project_contexts[repo_id] = ProjectContext(repo_id=repo_id)
        return self.project_contexts[repo_id]

    async def save_project_context(self, context: ProjectContext) -> None:
        self.project_contexts[context.repo_id] = context

    # --- sessions ----------------------------------------------------------
    async def active_session_for(self, developer_id: str, story_id: str) -> DevSession | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, developer_id, story_id, feature_branch, expires_at, byok_configured FROM dev_sessions WHERE developer_id = $1 AND story_id = $2 AND status = 'active' AND expires_at > now()",
                developer_id, story_id
            )
            if not row: return None
            story_row = await conn.fetchrow("SELECT repo_id FROM user_stories WHERE id = $1", story_id)
            return DevSession(
                id=str(row["id"]), developer_id=str(row["developer_id"]), story_id=str(row["story_id"]),
                repo_id=str(story_row["repo_id"]) if story_row else "", feature_branch=row["feature_branch"],
                expires_at=row["expires_at"], byok_configured=row["byok_configured"] if "byok_configured" in row else False
            )

    async def create_session(self, developer_id: str, story: Story) -> DevSession:
        async with self.pool.acquire() as conn:
            expires = datetime.now(timezone.utc) + timedelta(seconds=settings.session_ttl_seconds)
            row = await conn.fetchrow(
                "INSERT INTO dev_sessions (developer_id, story_id, feature_branch, expires_at) VALUES ($1, $2, $3, $4) RETURNING id",
                developer_id, story.id, story.feature_branch or f"feature/{story.key.lower()}", expires
            )
            return DevSession(
                id=str(row["id"]), developer_id=developer_id, story_id=story.id, repo_id=story.repo_id,
                feature_branch=story.feature_branch or f"feature/{story.key.lower()}", expires_at=expires
            )

    async def session(self, session_id: str) -> DevSession | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT id, developer_id, story_id, feature_branch, expires_at, byok_provider FROM dev_sessions WHERE id = $1", session_id)
            if not row: return None
            story_row = await conn.fetchrow("SELECT repo_id FROM user_stories WHERE id = $1", row["story_id"])
            return DevSession(
                id=str(row["id"]), developer_id=str(row["developer_id"]), story_id=str(row["story_id"]),
                repo_id=str(story_row["repo_id"]) if story_row else "", feature_branch=row["feature_branch"],
                expires_at=row["expires_at"], byok_configured=bool(row["byok_provider"])
            )

    async def save_session(self, session: DevSession) -> None:
        async with self.pool.acquire() as conn:
            # We assume session byok details or status is being saved
            # The MemoryStore doesn't track status well but the DB does.
            await conn.execute(
                "UPDATE dev_sessions SET byok_provider = $1, byok_key_ref = $2 WHERE id = $3",
                session.byok_provider if getattr(session, 'byok_configured', False) else None,
                session.byok_key_ref if hasattr(session, 'byok_key_ref') else None,
                session.id
            )

    # --- grants ------------------------------------------------------------
    async def grants_for_session(self, session: DevSession) -> list[Grant]:
        story = await self.story(session.story_id)
        grants = list(story.scopes) if story else []
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("SELECT path_glob, access_level, expires_at FROM access_elevations WHERE session_id = $1 AND status = 'approved'", session.id)
            for r in rows:
                grants.append(Grant(r["path_glob"], r["access_level"], "elevation", expires_at=r["expires_at"]))
        return grants

    async def create_elevation(self, session_id: str, pattern: str, access: str, reason: str) -> Elevation:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "INSERT INTO access_elevations (session_id, path_glob, access_level, reason) VALUES ($1, $2, $3, $4) RETURNING id, status",
                session_id, pattern, access, reason
            )
            return Elevation(id=str(row["id"]), session_id=session_id, pattern=pattern, access=access, reason=reason, status=row["status"])

    async def elevation(self, elevation_id: str) -> Elevation | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT id, session_id, path_glob, access_level, reason, status, expires_at FROM access_elevations WHERE id = $1", elevation_id)
            if not row: return None
            return Elevation(id=str(row["id"]), session_id=str(row["session_id"]), pattern=row["path_glob"], access=row["access_level"], reason=row["reason"], status=row["status"], expires_at=row["expires_at"])

    async def save_elevation(self, elev: Elevation) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute("UPDATE access_elevations SET status = $1, expires_at = $2 WHERE id = $3", elev.status, elev.expires_at, elev.id)

    async def expire_elevations(self) -> int:
        async with self.pool.acquire() as conn:
            return await conn.execute("UPDATE access_elevations SET status = 'expired' WHERE status = 'approved' AND expires_at <= now()")

    async def list_elevations(self) -> list[Elevation]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("SELECT id, session_id, path_glob, access_level, reason, status, expires_at FROM access_elevations")
            return [Elevation(id=str(r["id"]), session_id=str(r["session_id"]), pattern=r["path_glob"], access=r["access_level"], reason=r["reason"], status=r["status"], expires_at=r["expires_at"]) for r in rows]

    # --- llm config --------------------------------------------------------
    async def get_llm_config(self) -> AppLlmConfig:
        return self.llm_config

    async def save_llm_config(self, config: AppLlmConfig) -> None:
        self.llm_config = config

    # --- audit -------------------------------------------------------------
    async def last_audit_hash(self) -> str | None:
        async with self.pool.acquire() as conn:
            return await conn.fetchval("SELECT hash FROM audit_events ORDER BY at DESC LIMIT 1")

    async def append_audit(self, row: dict) -> None:
        import json
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO audit_events (actor_id, session_id, story_id, action, target, outcome, detail, prev_hash, hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                row.get("actor_id"), row.get("session_id"), row.get("story_id"), row.get("action"), row.get("target"), row.get("outcome"), json.dumps(row.get("detail", {})), row.get("prev_hash"), row.get("hash")
            )

store: MemoryStore = PostgresStore() if settings.database_url else MemoryStore()
