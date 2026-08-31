"""Vercel Services entrypoint.

`vercel.json` declares:  "api": { "root": "backend/", "entrypoint": "main:app" }

Every route is mounted under /api because the root-level rewrite forwards the
full path (including the /api prefix) to this service. Keeping the prefix inside
FastAPI means local dev and production share one URL space.
"""

from app.factory import create_app

app = create_app()
