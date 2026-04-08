from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "RelateOS API"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "*"
    auto_create_tables: bool = True

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/relateos"
    redis_url: str = "redis://localhost:6379/0"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
