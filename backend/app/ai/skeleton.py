"""Skeletonization.

Strips implementation bodies from a dependency, keeping only what a model needs
to call it correctly: names, parameters, types, and doc summaries.

Levels
  L0 FULL       verbatim (only ever the in-scope target file)
  L1 SIGNATURE  signatures + types + docstring first line
  L2 SHAPE      names + arity, types erased
  L3 OPAQUE     "module exists, exports N symbols"
  L4 NONE       omitted; the model is not told it exists

This module is a deliberate compromise and you should understand it before
shipping: a signature IS proprietary information. `chargeCardWithRetry(cardId,
amountCents, idempotencyKey, retryPolicy)` tells a competitor a great deal.
Classify anything you consider genuinely sensitive as L3/L4, not L1.

The regex-free line scanner below is a placeholder. Production must use a real
parser -- py-tree-sitter for Python, ts-morph for TS/JS -- running in the
indexer service, because Vercel's function bundle limit makes native tree-sitter
wheels a poor fit. See docs/DEPLOYMENT.md section 3.
"""

L0_FULL = "L0"
L1_SIGNATURE = "L1"
L2_SHAPE = "L2"
L3_OPAQUE = "L3"
L4_NONE = "L4"

LABEL_TO_LEVEL = {
    "PUBLIC": L1_SIGNATURE,
    "INTERNAL": L1_SIGNATURE,
    "RESTRICTED": L3_OPAQUE,
    "SECRET": L4_NONE,
}

_SIGNATURE_STARTERS = (
    "export function ",
    "export async function ",
    "export const ",
    "export class ",
    "export interface ",
    "export type ",
    "export default function ",
    "def ",
    "async def ",
    "class ",
)


def level_for(label: str, is_target: bool) -> str:
    if is_target:
        return L0_FULL
    return LABEL_TO_LEVEL.get(label, L3_OPAQUE)


def _signature_lines(source: str) -> list[str]:
    out: list[str] = []
    for raw in source.splitlines():
        stripped = raw.strip()
        if not stripped.startswith(_SIGNATURE_STARTERS):
            continue
        # Keep the declaration head only: cut at the body opener.
        head = stripped
        for opener in (" {", "{", ":"):
            idx = head.find(opener)
            if idx > 0:
                head = head[:idx]
                break
        head = head.rstrip("=").strip()
        if head and head not in out:
            out.append(head + ";")
    return out


def skeletonize(path: str, source: str, level: str) -> str | None:
    """Return the text safe to place in a prompt, or None if omitted entirely."""
    if level == L4_NONE:
        return None

    if level == L0_FULL:
        return source

    if level == L3_OPAQUE:
        count = len(_signature_lines(source))
        return f"// {path}: module available at runtime; {count} exported symbols (details withheld)"

    signatures = _signature_lines(source)
    if not signatures:
        return f"// {path}: no exported symbols detected"

    if level == L2_SHAPE:
        shaped = []
        for sig in signatures:
            name = sig.split("(")[0].split()[-1] if "(" in sig else sig.split()[-1]
            arity = sig.count(",") + 1 if "(" in sig and "()" not in sig else 0
            shaped.append(f"{name}/{arity};")
        return f"// {path} (shape only)\n" + "\n".join(shaped)

    return f"// {path} (signatures only -- bodies removed)\n" + "\n".join(signatures)
