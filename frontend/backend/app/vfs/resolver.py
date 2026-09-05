"""THE CHOKEPOINT.

Every source byte that reaches a client or an external model passes through this
class. Deny by default. No shortcuts, no convenience overloads, no caller-
supplied allowlists.

Rules encoded here:
  1. Paths are normalized and rejected if absolute, traversing, or .git-adjacent.
  2. A path is readable/writable only if an ACTIVE grant pattern matches it.
  3. A SECRET classification is absolute and overrides every grant, including
     an approved elevation.
  4. Expiry is checked at query time, not only by a background worker.

If you change this file, a second reviewer is required and the property tests in
tests/test_resolver.py must still pass.
"""

from datetime import datetime, timezone
from fnmatch import fnmatch
from pathlib import PurePosixPath

from app.models import ACCESS_READ, ACCESS_WRITE, DevSession, Grant

_DENIED_SEGMENTS = {"..", ".", "", "~"}
_DENIED_PREFIXES = (".git", ".env", ".ssh", ".npmrc", ".vercel")
_DENIED_NAMES = {"id_rsa", "id_ed25519", ".env", ".netrc", ".htpasswd"}


class PathRejected(ValueError):
    pass


def normalize(raw: str) -> PurePosixPath:
    """Reject anything that is not a plain, relative, forward-slash repo path."""
    if not raw or not isinstance(raw, str):
        raise PathRejected("empty")
    if len(raw) > 1024:
        raise PathRejected("too_long")
    if "\x00" in raw or "\n" in raw or "\r" in raw:
        raise PathRejected("control_char")
    if "%" in raw:
        # Percent-encoding is a decoding ambiguity we refuse to resolve here.
        raise PathRejected("encoded")
    candidate = raw.replace("\\", "/")
    if candidate.startswith("/") or ":" in candidate.split("/")[0]:
        raise PathRejected("absolute")
    path = PurePosixPath(candidate)
    for part in path.parts:
        if part in _DENIED_SEGMENTS:
            raise PathRejected("traversal")
        lowered = part.lower()
        if lowered in _DENIED_NAMES:
            raise PathRejected("sensitive_name")
        if any(lowered.startswith(prefix) for prefix in _DENIED_PREFIXES):
            raise PathRejected("sensitive_prefix")
    return path


def _glob_specificity(pattern: str) -> int:
    """Longer, less wildcarded patterns win. Used for classification lookup."""
    return len(pattern) - 4 * pattern.count("*")


class Classification:
    def __init__(self, rules: list[tuple[str, str]]) -> None:
        self._rules = sorted(rules, key=lambda r: _glob_specificity(r[0]), reverse=True)

    def label_for(self, path: PurePosixPath) -> str:
        text = str(path)
        for pattern, label in self._rules:
            if fnmatch(text, pattern):
                return label
        return "INTERNAL"


class VfsResolver:
    def __init__(
        self,
        session: DevSession,
        grants: list[Grant],
        classification: Classification,
        now: datetime | None = None,
    ) -> None:
        self._session = session
        self._now = now or datetime.now(timezone.utc)
        self._labels = classification
        self._grants = [g for g in grants if self._is_active(g)]

    def _is_active(self, grant: Grant) -> bool:
        if grant.expires_at is None:
            return True
        expires = grant.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires > self._now

    @property
    def session(self) -> DevSession:
        return self._session

    @property
    def patterns(self) -> list[str]:
        return [g.pattern for g in self._grants]

    def access_level(self, raw: str) -> str | None:
        """Return "write", "read", or None. None means the path does not exist
        as far as this session is concerned."""
        try:
            path = normalize(raw)
        except PathRejected:
            return None

        if self._labels.label_for(path) == "SECRET":
            return None  # absolute, overrides every grant

        best: str | None = None
        text = str(path)
        for grant in self._grants:
            if not fnmatch(text, grant.pattern):
                continue
            if grant.access == ACCESS_WRITE:
                return ACCESS_WRITE
            best = ACCESS_READ
        return best

    def can_read(self, raw: str) -> bool:
        return self.access_level(raw) in (ACCESS_READ, ACCESS_WRITE)

    def can_write(self, raw: str) -> bool:
        return self.access_level(raw) == ACCESS_WRITE

    def filter_readable(self, paths: list[str]) -> list[str]:
        return [p for p in paths if self.can_read(p)]
