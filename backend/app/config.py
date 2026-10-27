import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("mockinterview")


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/mockinterview"
    secret_key: str = "change-me-in-env"
    access_token_expire_minutes: int = 120
    gemini_api_key: str = ""
    # Model names change over time; override with GEMINI_MODEL in .env if needed.
    gemini_model: str = "gemini-flash-latest"
    # Optional fallback provider: used only when Gemini is unset or its call fails.
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    worker_url: str = "http://localhost:8001"
    questions_per_interview: int = 5
    min_answer_words: int = 3

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

if settings.secret_key == "change-me-in-env":
    log.warning("SECRET_KEY is still the default value. Set a long random value in .env.")
