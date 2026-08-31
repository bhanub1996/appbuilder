"""Vercel Services entrypoint.

`vercel.json` declares:  "api": { "root": "backend/", "entrypoint": "main:app" }

Every route is mounted under /api because the root-level rewrite forwards the
full path (including the /api prefix) to this service. Keeping the prefix inside
FastAPI means local dev and production share one URL space.
"""

import sys
from pathlib import Path

# Ensure backend directory is in sys.path so 'app' module can always be imported
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.factory import create_app

app = create_app()

