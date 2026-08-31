"""Security-critical. CI must fail the build if any of these regress."""

from datetime import datetime, timedelta, timezone

import pytest

from app.models import ACCESS_READ, ACCESS_WRITE, DevSession, Grant
from app.vfs.resolver import Classification, PathRejected, VfsResolver, normalize
from app.vfs.tree import build_tree

CLASSIFICATION = Classification(
    [
        ("infra/*", "SECRET"),
        ("*.pem", "SECRET"),
        ("backend/billing/*", "RESTRICTED"),
        ("frontend/*", "INTERNAL"),
    ]
)


def make_resolver(grants, now=None):
    session = DevSession(
        id="s1",
        developer_id="d1",
        story_id="st1",
        repo_id="r1",
        feature_branch="feature/x",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    return VfsResolver(session, grants, CLASSIFICATION, now=now)


@pytest.mark.parametrize(
    "bad",
    [
        "../../etc/passwd",
        "/etc/passwd",
        "frontend/../infra/secrets.tf",
        "frontend/src/../../.git/config",
        ".git/config",
        ".env",
        "frontend/.env.production",
        "C:/Windows/System32",
        "frontend%2f..%2finfra",
        "frontend/src/id_rsa",
        "",
    ],
)
def test_normalize_rejects_hostile_paths(bad):
    with pytest.raises(PathRejected):
        normalize(bad)


def test_normalize_accepts_ordinary_paths():
    assert str(normalize("frontend/src/pages/Login.tsx")) == "frontend/src/pages/Login.tsx"
    assert str(normalize("frontend\\\\src\\\\a.ts")) == "frontend/src/a.ts"


def test_deny_by_default():
    r = make_resolver([])
    assert r.access_level("frontend/src/pages/Login.tsx") is None
    assert not r.can_read("frontend/src/pages/Login.tsx")


def test_write_grant_implies_read():
    r = make_resolver([Grant("frontend/src/pages/Login.tsx", ACCESS_WRITE, "story_scope")])
    assert r.can_read("frontend/src/pages/Login.tsx")
    assert r.can_write("frontend/src/pages/Login.tsx")


def test_read_grant_does_not_imply_write():
    r = make_resolver([Grant("frontend/src/api/*", ACCESS_READ, "story_scope")])
    assert r.can_read("frontend/src/api/authClient.ts")
    assert not r.can_write("frontend/src/api/authClient.ts")


def test_secret_label_beats_every_grant():
    """Even an explicit write grant and an approved elevation lose to SECRET."""
    r = make_resolver(
        [
            Grant("infra/*", ACCESS_WRITE, "story_scope"),
            Grant("infra/prod.tf", ACCESS_WRITE, "elevation"),
            Grant("*", ACCESS_WRITE, "story_scope"),
        ]
    )
    assert r.access_level("infra/prod.tf") is None
    assert r.access_level("keys/server.pem") is None


def test_expired_elevation_is_inert():
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    r = make_resolver(
        [Grant("backend/billing/*", ACCESS_READ, "elevation", expires_at=past)]
    )
    assert r.access_level("backend/billing/charge.py") is None


def test_unexpired_elevation_grants_access():
    future = datetime.now(timezone.utc) + timedelta(hours=2)
    r = make_resolver(
        [Grant("backend/billing/*", ACCESS_READ, "elevation", expires_at=future)]
    )
    assert r.can_read("backend/billing/charge.py")
    assert not r.can_write("backend/billing/charge.py")


def test_tree_omits_out_of_scope_files_entirely():
    r = make_resolver([Grant("frontend/src/pages/*", ACCESS_WRITE, "story_scope")])
    tree = build_tree(
        r,
        [
            "frontend/src/pages/Login.tsx",
            "frontend/src/pages/Signup.tsx",
            "backend/billing/charge.py",
            "infra/prod.tf",
        ],
    )
    flat = repr(tree)
    assert "Login.tsx" in flat
    assert "billing" not in flat
    assert "infra" not in flat
    assert "charge.py" not in flat
