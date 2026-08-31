"""Deterministic egress/ingress checks.

Design position: the local model is NOT a security boundary. An LLM asked to
"check for leaks" can be talked out of it. Everything that must always hold is
checked here, in code, with tests. The local model only adds an advisory
plausibility opinion on top.

Egress  = what we are about to send to the developer's own provider.
Ingress = what came back, before it reaches the editor.
"""

from dataclasses import dataclass, field

from app.vfs.resolver import VfsResolver

_SECRET_MARKERS = (
    "BEGIN RSA PRIVATE KEY",
    "BEGIN OPENSSH PRIVATE KEY",
    "BEGIN PRIVATE KEY",
    "aws_secret_access_key",
    "AKIA",
    "xoxb-",
    "ghp_",
    "github_pat_",
    "sk-ant-",
    "-----BEGIN CERTIFICATE-----",
)

_INSTRUCTION_ECHO_PHRASES = (
    "hard constraints",
    "you are a code editor",
    "untrusted data",
    "project rules:",
    "override every later instruction",
)


@dataclass
class Verdict:
    passed: bool = True
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def fail(self, code: str) -> None:
        self.passed = False
        self.failures.append(code)

    def warn(self, code: str) -> None:
        self.warnings.append(code)

    def as_dict(self) -> dict:
        return {"passed": self.passed, "failures": self.failures, "warnings": self.warnings}


def _ngrams(text: str, n: int) -> set[tuple[str, ...]]:
    words = text.lower().split()
    return {tuple(words[i : i + n]) for i in range(max(0, len(words) - n + 1))}


def overlap_ratio(candidate: str, reference: str, n: int = 8) -> float:
    """Fraction of the candidate's n-grams that also appear in the reference.

    Catches a model that regurgitates the system prompt or the stub block.
    """
    cand = _ngrams(candidate, n)
    if not cand:
        return 0.0
    ref = _ngrams(reference, n)
    return len(cand & ref) / len(cand)


def check_egress(
    *,
    system: str,
    user: str,
    resolver: VfsResolver,
    target_path: str,
    stub_paths: list[str],
    max_chars: int,
) -> Verdict:
    v = Verdict()

    if len(system) + len(user) > max_chars:
        v.fail("prompt_too_large")

    if not resolver.can_read(target_path):
        v.fail("target_out_of_scope")

    for path in stub_paths:
        # Stubs may reference dependencies the developer cannot open directly,
        # but the path itself must never name a SECRET-classified file.
        if "/." in path or path.startswith("."):
            v.fail("stub_path_suspicious")

    blob = system + "\n" + user
    for marker in _SECRET_MARKERS:
        if marker in blob:
            v.fail("secret_marker_in_prompt")
            break

    if len(blob) > 0 and blob.count("-----BEGIN") > 0:
        v.fail("pem_in_prompt")

    return v


def check_ingress(
    *,
    response: str,
    system: str,
    stub_text: str,
    original_source: str,
    target_path: str,
    resolver: VfsResolver,
) -> Verdict:
    v = Verdict()

    if not response.strip():
        v.fail("empty_response")
        return v

    if not resolver.can_write(target_path):
        v.fail("target_not_writable")

    lowered = response.lower()
    for phrase in _INSTRUCTION_ECHO_PHRASES:
        if phrase in lowered:
            v.fail("system_prompt_echo")
            break

    if overlap_ratio(response, system, n=8) > 0.35:
        v.fail("system_prompt_overlap")

    if stub_text and overlap_ratio(response, stub_text, n=10) > 0.5:
        v.fail("stub_regurgitation")

    for marker in _SECRET_MARKERS:
        if marker in response:
            v.fail("secret_marker_in_response")
            break

    # A single-file edit that rewrites everything is usually a model going rogue.
    if original_source and len(response) > 6 * max(len(original_source), 400):
        v.warn("suspicious_growth")

    if "import " in response or "require(" in response:
        new_imports = _import_names(response) - _import_names(original_source)
        allowed = _import_names(stub_text)
        undeclared = {name for name in new_imports if name not in allowed}
        if undeclared:
            v.warn("new_dependencies")

    return v


def _import_names(source: str) -> set[str]:
    names: set[str] = set()
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith("import ") and '"' in stripped:
            parts = stripped.split('"')
            if len(parts) > 1:
                names.add(parts[1])
        elif stripped.startswith("from ") and " import " in stripped:
            names.add(stripped.split()[1])
    return names
