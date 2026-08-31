import base64
import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"

    jwt_secret: str = "dev-only-insecure-secret-change-me-now"
    jwt_issuer: str = "ztdev"
    access_token_ttl_seconds: int = 900
    session_ttl_seconds: int = 28800

    database_url: str = ""
    upstash_redis_rest_url: str = ""
    upstash_redis_rest_token: str = ""

    vault_kek: str = ""

    github_app_id: str = ""
    github_app_private_key: str = ""
    github_app_private_key_b64: str = ""
    github_webhook_secret: str = ""
    github_token: str = ""
    github_api_base: str = "https://api.github.com"

    local_llm_base_url: str = ""
    local_llm_api_key: str = ""
    local_llm_model: str = "qwen2.5-coder-32b-instruct"

    indexer_base_url: str = ""
    indexer_shared_secret: str = ""

    cron_secret: str = ""

    # Hard ceiling on what any single AI request may send outward.
    max_prompt_chars: int = 120_000
    max_skeleton_files: int = 12
    graph_max_hops: int = 2

    @property
    def cors_origins(self) -> list[str]:
        raw = os.getenv("CORS_ORIGINS", "")
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def github_pem(self) -> str:
        if self.github_app_private_key_b64:
            return base64.b64decode(self.github_app_private_key_b64).decode()
        return self.github_app_private_key.replace("\\n", "\n")


settings = Settings()
