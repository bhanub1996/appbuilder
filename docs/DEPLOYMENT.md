# Deploying on Vercel

## 1. Topology

One Vercel project, two services, one domain, one rollback unit. This is what
`vercel.json` declares:

```json
{
  "services": {
    "web": { "root": "frontend/", "framework": "vite" },
    "api": { "root": "backend/", "entrypoint": "main:app" }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },
    { "source": "/(.*)", "destination": { "service": "web" } }
  ]
}
```

Why this matters for a zero-trust tool specifically:

- **Same origin.** The browser calls `/api/...` on the same host as the app. No
  CORS preflight, no third-party cookie problems, and no second domain to add to
  your CSP.
- **One firewall surface.** Deployment Protection, WAF rules, and rate limits are
  configured once and cover both services. With two separate projects you would
  have to keep two policies in agreement, and a mismatch is a bypass.
- **Atomic rollback.** The frontend that assumes a scope-shaped API response and
  the backend that produces it ship and revert together. A rollback that leaves
  a new UI against an old permission model is a real risk in this system.

Routes are kept under `/api` inside FastAPI as well, so local dev and production
share one URL space. If your rewrite is configured to strip the prefix, set
`root_path="/api"` on the `FastAPI(...)` call in `app/factory.py` and drop
`API_PREFIX` instead.

Services is in beta. Verify the current field list in Vercel's service
configuration reference before you rely on anything beyond `root`, `framework`,
and `entrypoint`.

## 2. Managed services to provision

| Need | Use | Non-obvious requirement |
| --- | --- | --- |
| Postgres + pgvector | Neon or Supabase | Use the **pooled** connection string. Serverless invocations do not share a pool; an unpooled URL will exhaust `max_connections` under light load. |
| Redis (BYOK vault, GitHub token cache) | Upstash | Must be the **REST** API, not TCP. A TCP client cannot keep a connection across invocations. |
| Object storage (knowledge-base uploads) | Vercel Blob or S3 | Serve via signed, short-lived URLs only. |

Apply the schema with the **unpooled** URL:

```bash
psql "$DATABASE_URL_UNPOOLED" -f migrations/0001_init.sql
```

## 3. What cannot run on Vercel

This is the honest part. Four pieces of the design need somewhere else to live.

### 3.1 The in-house model (Qwen2.5-Coder)

Vercel has no GPU runtime. A 32B model at usable latency needs roughly one
A100-40G or two L40S.

**Options, cheapest first:**

1. **Drop it for v1.** The deterministic sanitizer does the security work
   already; the local model was only ever advisory. You lose the free-tier
   routing for trivial edits. This is the recommended starting point.
2. **Serverless GPU** (Modal, RunPod, Baseten). Pay per second. Cold starts of
   20-60s are tolerable for a background validator, painful for an interactive
   edit.
3. **Dedicated GPU host** (Fly.io, Lambda Labs, your own rack). Predictable
   latency, roughly USD 1-2k/month for a single A100 class instance.

Expose it as an OpenAI-compatible endpoint and set `LOCAL_LLM_BASE_URL`.

### 3.2 The tree-sitter indexer

Two blockers, not one: functions are request-scoped, and native tree-sitter
wheels plus a language grammar set push the Python bundle toward the function
size limit.

Run it as a small always-on worker (Fly.io, Railway, ECS) that owns the code
graph. It pulls from GitHub, parses, and writes `code_files` / `code_symbols` /
`code_edges`. Vercel Cron pokes `/api/internal/cron/reconcile-index`; the
webhook handler only enqueues. Nothing in the request path waits on it.

### 3.3 Background jobs

`arq` workers do not exist here. Three replacements:

- **Vercel Cron** for anything periodic. Already wired: elevation expiry every
  10 minutes, index reconciliation nightly. Vercel sends
  `Authorization: Bearer $CRON_SECRET`; `app/api/cron.py` checks it. Set
  `CRON_SECRET` or those endpoints are world-callable.
- **Vercel Queues** for fan-out work that must survive a failed request.
- The **external worker** from 3.2 for anything long-running.

Note how elevation expiry is designed: `VfsResolver` treats an expired grant as
absent *at query time*. The cron job only keeps the audit log and admin UI tidy.
A missed cron run can never extend someone's access. Build every scheduled job
this way -- as a backstop, never as the enforcement point.

### 3.4 The in-memory BYOK vault

The original design held the developer's key in process memory. That does not
survive statelessness: the next request may hit a different instance, and a
warm instance may serve a different session.

Implemented instead: envelope-encrypt with `VAULT_KEK`, store the ciphertext in
Upstash under the session TTL, decrypt per request, drop the plaintext from the
frame. The plaintext is never logged, never returned to the browser, and never
written to disk.

Move `VAULT_KEK` to a real KMS (AWS KMS, GCP KMS, Vault) before a pilot. An
environment variable is a reasonable v1 and a poor v2.

## 4. Environment variables

Set these in the Vercel dashboard for Production, Preview, and Development.
Both services share the project's variables.

| Variable | Required | Notes |
| --- | --- | --- |
| `JWT_SECRET` | yes | 32+ random bytes. `openssl rand -hex 32` |
| `DATABASE_URL` | yes | Pooled. Empty falls back to the in-memory demo store. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | yes | BYOK vault and GitHub token cache |
| `VAULT_KEK` | yes | `openssl rand -base64 32`, 32 decoded bytes |
| `GITHUB_APP_ID` | yes | |
| `GITHUB_APP_PRIVATE_KEY_B64` | yes | Base64 the PEM; avoids newline mangling |
| `GITHUB_WEBHOOK_SECRET` | yes | Signature verification is mandatory |
| `CRON_SECRET` | yes | Otherwise cron endpoints are open |
| `LOCAL_LLM_BASE_URL` | no | Omit to route everything to BYOK |
| `INDEXER_BASE_URL` / `_SHARED_SECRET` | no | Phase 3 |
| `VITE_API_BASE` | no | Defaults to `/api`. Build-time, public. No secrets. |

`VITE_`-prefixed values are compiled into the browser bundle. Never put a
credential behind that prefix.

## 5. GitHub App setup

Permissions, minimum viable set:

- Contents: **read and write**
- Pull requests: **read and write**
- Checks: **read**
- Metadata: **read**

Webhook URL: `https://<your-domain>/api/webhooks/github`
Subscribe to: `push`, `pull_request`, `check_suite`, `installation_repositories`

All commits are authored by the App bot, so human attribution lives in commit
trailers (`Story`, `Author-Developer`, `Session`, `AI-Assist`). Two consequences
worth accepting deliberately: GitHub's blame and contribution graphs will not
show your developers, and your audit trail is now the source of truth for who
changed what. Tell the team this before you turn it on.

## 6. Preview deployments

Each PR gets a preview URL. Turn on Deployment Protection (Vercel Authentication
or a shared secret) before the first real branch, or every scoped preview is a
public endpoint that will happily read files with a valid session token.

## 7. Pre-pilot checklist

- [ ] Replace the stub auth in `app/api/auth.py` with your OIDC provider
- [ ] Implement `PostgresStore`; the in-memory store is per-instance and lies
      under concurrency
- [ ] Wire `SET LOCAL app.session_id` before every `kb_chunks` query so the RLS
      policy is actually load-bearing
- [ ] Replace the line-scanner in `app/ai/skeleton.py` with a real parser
- [ ] Move `VAULT_KEK` to KMS
- [ ] Set `CRON_SECRET` and confirm cron endpoints reject unauthenticated calls
- [ ] Enable Deployment Protection on previews
- [ ] Confirm `/api/openapi.json` returns 404 in production
- [ ] Add rate limits per session on `/ai/*` and alert on `deny` bursts
- [ ] Decide the signature-disclosure question in README before onboarding
      anyone outside the pilot team
