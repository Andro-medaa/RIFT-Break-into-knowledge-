"""This is the configuration file for the API.
It contains all the configuration settings for the API.
"""

from pathlib import Path
from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_DIR = API_DIR.parent.parent


class Settings(BaseSettings):
    """Central settings – loaded from .env files.

    Priority (last wins):
        ROOT_DIR/.env  →  API_DIR/.env  →  environment variables
    """

    model_config = SettingsConfigDict(
        env_prefix="APP_",
        env_file=(ROOT_DIR / ".env", API_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database (asyncpg + SQLAlchemy Core) ──────────────────────────────────
    database_url: str = Field(
        default="",
        validation_alias=AliasChoices(
            "APP_DATABASE_URL",
            "DATABASE_URL",
            "SUPABASE_DB_URL",
            "POSTGRES_URL",
        ),
        description="Async Postgres connection string (bypasses RLS with service role)",
    )

    @property
    def async_database_url(self) -> str:
        """Return the database URL normalized for the asyncpg driver (postgresql+asyncpg://).
        Also safely percent-encodes special characters (such as '@') in the password if unencoded.
        """
        import urllib.parse

        url = (self.database_url or "").strip()
        if not url:
            return ""

        # Normalize driver dialect prefix
        prefix = ""
        for scheme in ("postgresql+asyncpg://", "postgresql://", "postgres://"):
            if url.startswith(scheme):
                prefix = scheme
                break

        if not prefix:
            return url

        rest = url[len(prefix) :]

        # Check for unencoded '@' in password (i.e. more than one '@' in URL authority)
        if "@" in rest:
            last_at = rest.rfind("@")
            userinfo = rest[:last_at]
            hostinfo = rest[last_at + 1 :]
            if ":" in userinfo:
                user, passwd = userinfo.split(":", 1)
                # If password contains literal '@' or hasn't been percent-encoded
                if "@" in passwd:
                    passwd = urllib.parse.quote(passwd, safe="")
                userinfo = f"{user}:{passwd}"
            return f"postgresql+asyncpg://{userinfo}@{hostinfo}"

        return "postgresql+asyncpg://" + rest

    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str = Field(
        default="",
        validation_alias=AliasChoices("APP_SUPABASE_URL", "SUPABASE_URL"),
        description="Supabase project URL",
    )

    supabase_publishable_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "APP_SUPABASE_PUBLISHABLE_KEY",
            "SUPABASE_PUBLISHABLE_KEY",
            "SUPABASE_ANON_KEY",
        ),
        description="Supabase anon / publishable key (safe for client-side use)",
    )

    supabase_secret_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "APP_SUPABASE_SECRET_KEY",
            "SUPABASE_SECRET_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
        ),
        description="Supabase service-role key – NEVER expose to clients",
    )

    supabase_storage_bucket: str = Field(
        default="documents",
        validation_alias=AliasChoices(
            "APP_SUPABASE_STORAGE_BUCKET",
            "SUPABASE_STORAGE_BUCKET",
        ),
        description="Default Supabase storage bucket for PDF documents",
    )

    cors_origins: list[str] = Field(
        default=["*"],
        validation_alias=AliasChoices("APP_CORS_ORIGINS", "CORS_ORIGINS"),
        description="Allowed CORS origins for RAG web frontend",
    )

    # ── AI ────────────────────────────────────────────────────────────────────
    gemini_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "APP_GEMINI_API_KEY",
            "GEMINI_API_KEY",
            "APP_GOOGLE_API_KEY",
            "GOOGLE_API_KEY",
        ),
        description="Google Gemini API key",
    )

    elevenlabs_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "APP_ELEVENLABS_API_KEY",
            "ELEVENLABS_API_KEY",
            "XI_API_KEY",
        ),
        description="ElevenLabs API key for natural voice synthesis with timestamps",
    )

    tavily_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "APP_TAVILY_API",
            "TAVILY_API",
            "TAVILY_API_KEY",
        ),
        description="Tavily API key for web search grounding",
    )

    # ── Audio & Cache Settings ─────────────────────────────────────────────
    AUDIO_CACHE_DIR: Path = Field(
        default_factory=lambda: API_DIR / "data" / "audio_cache",
        description="Directory for caching generated TTS audio files",
    )
    SECRET_KEY: str = Field(
        default="rift-dev-secret-key-32bytes-secure",
        description="Secret key for signing URLs",
    )
    SIGNED_URL_DEFAULT_EXPIRY_SECONDS: int = Field(
        default=3600,
        description="Expiry for signed URLs in seconds",
    )
    CHATTERBOX_TURBO_URL: str = ""
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "rift-audio-cache"
    R2_PUBLIC_URL: str = ""

    def __getattr__(self, name: str):
        lower_name = name.lower()
        if lower_name in self.__dict__:
            return self.__dict__[lower_name]
        return ""


setting = Settings()
settings = setting
