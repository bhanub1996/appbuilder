# Zero-Trust AI Development UI

A scoped development workspace. A developer is assigned a user story and sees
only the files that story needs. AI edits run through their own API key, but the
key and the codebase never meet on the developer's machine: the server holds the
key, strips dependency bodies down to signatures, and checks every response
before it reaches the editor.

Design rationale, threat model, and the phased plan live in the companion Notion
page. This repo is the deployable skeleton.

## What actually works in this scaffold

| Area | State |
| --- | --- |
| Scope enforcement (`VfsResolver`) | Implemented, property-tested. This is the security core. |
| Path normalization and traversal defence | Implemented, tested against 11 hostile inputs. |
| Deny-by-default tree projection | Implemented. Out-of-scope files are omitted, not hidden. |
| Skeletonization by classification label | Implemented (line scanner). Needs a real parser before pilot. |
| Prompt assembly with fenced untrusted input | Implemented. |
| Deterministic egress/ingress sanitizer | Implemented, tested. |
| BYOK vault (envelope encryption + TTL) | Implemented. Uses Upstash when configured. |
| GitHub App auth, read, commit, branch, PR | Implemented. |
| Webhook staleness invalidation | Implemented (enqueue only). |
| Monaco editor + stub-driven IntelliSense | Implemented. |
| Admin scope picker | Implemented. |
| Auth | **Stub.** Email-only. Replace with OIDC before any pilot. |
| Postgres store | **Stub.** `MemoryStore` runs the demo; `PostgresStore` is a shell. |
| Code graph / vector retrieval | **Not built.** Phase 3. |
| Tree-sitter indexer | **Not built.** Must run off-Vercel. |

It boots with zero infrastructure: with no `DATABASE_URL` and no GitHub App it
serves seeded demo data so you can exercise the whole flow.

## Layout

```
vercel.json          Vercel Services: one project, two services, one domain
backend/             FastAPI service  (root: backend/, entrypoint: main:app)
  main.py            ASGI entrypoint
  app/vfs/resolver.py   <- the chokepoint. Read this first.
  app/ai/             skeletonization, prompt assembly, sanitizer, routing
  app/gitapp/         GitHub App auth + content operations
  app/api/            routers
  tests/              security-critical tests; CI gates on these
frontend/            React + Vite + Monaco (root: frontend/, framework: vite)
migrations/          Postgres DDL incl. row-level security policy
```

## Local development

```bash
cp .env.example .env

# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest -q                      # the tests that matter
uvicorn main:app --reload      # http://127.0.0.1:8000/api/health

# frontend (separate shell)
npm install
npm run dev:web                # http://127.0.0.1:5173, proxies /api
```

Sign in as `admin@company.com` or `dev@company.com`. Any value passes in the
stub; that is exactly why it must be replaced.

## Deploy

```bash
npm i -g vercel
vercel link
vercel --prod
```

Read `docs/DEPLOYMENT.md` first. Parts of this architecture cannot run on
Vercel and need somewhere else to live.

## Reading order

1. `backend/app/vfs/resolver.py` - every rule that matters is here
2. `backend/tests/test_resolver.py` - the rules as executable claims
3. `backend/app/ai/sanitizer.py` - why the local model is not the boundary
4. `backend/app/ai/skeleton.py` - the compromise, stated plainly
5. `backend/app/api/deps.py` - the single place a permission set is built

## Two things to decide before writing more code

**Signatures are proprietary.** L1 skeletonization sends function names and
parameter types to a third-party API. `chargeCardWithRetry(cardId, amountCents,
idempotencyKey, retryPolicy)` is a design disclosure. If that is unacceptable,
classify those paths `RESTRICTED` (L3, opaque) and accept worse AI output there.

**Adoption is the larger risk.** A developer who cannot see a type definition,
grep the repo, or run the test suite will work around this tool or leave. The
stub endpoint exists because of this; test execution is unsolved. Pilot with one
team on frontend-only work before broadening.
