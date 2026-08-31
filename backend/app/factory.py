from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import admin, ai, auth, cron, elevations, sessions, vfs, webhooks
from app.config import settings
from app.errors import AppError

API_PREFIX = "/api"


def create_app() -> FastAPI:
    app = FastAPI(
        title="Zero-Trust Dev UI API",
        version="0.1.0",
        # Never expose the schema in production: the route list is a map of the
        # system and the admin surface is not developer-visible.
        docs_url="/api/docs" if settings.app_env != "production" else None,
        openapi_url="/api/openapi.json" if settings.app_env != "production" else None,
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.exception_handler(AppError)
    async def _app_error(_request, exc: AppError):
        # Deliberately terse. Never leak which path existed or why it was denied.
        return JSONResponse(status_code=exc.status, content={"error": exc.code})

    @app.get(f"{API_PREFIX}/health")
    async def health():
        return {
            "ok": True,
            "env": settings.app_env,
            "store": "postgres" if settings.database_url else "memory",
            "github_app": bool(settings.github_app_id),
            "local_llm": bool(settings.local_llm_base_url),
        }

    for router in (
        auth.router,
        sessions.router,
        vfs.router,
        ai.router,
        elevations.router,
        admin.router,
        webhooks.router,
        cron.router,
    ):
        app.include_router(router, prefix=API_PREFIX)

    return app
