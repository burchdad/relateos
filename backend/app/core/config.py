from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "RelateOS API"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "*"
    cors_origin_regex: str = ""
    auto_create_tables: bool = True

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/relateos"
    redis_url: str = "redis://localhost:6379/0"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_transcription_model: str = "whisper-1"
    recording_transcription_max_bytes: int = 25_000_000
    content_bulk_send_max: int = 20
    auth_secret_key: str = "change-me-in-production"
    auth_token_ttl_hours: int = 24 * 7

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
