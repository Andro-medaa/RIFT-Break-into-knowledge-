from typing import List
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from apps/api/.env or workspace root
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

class Settings:
    PROJECT_NAME: str = "RIFT API"
    VERSION: str = "0.1.0"
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
        "*",
    ]
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
    DATABASE_URL: str = os.getenv("DATABASE_URL", "").strip()
    REDIS_URL: str = os.getenv("REDIS_URL", "").strip()
    
    # Step 13: GPU Chatterbox-Turbo & Cloudflare R2 Audio Caching
    CHATTERBOX_TURBO_URL: str = os.getenv("CHATTERBOX_TURBO_URL", "").strip()
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "").strip()
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "rift-audio-cache").strip()
    R2_PUBLIC_URL: str = os.getenv("R2_PUBLIC_URL", "").strip()
    AUDIO_CACHE_DIR: Path = Path(
        os.getenv(
            "AUDIO_CACHE_DIR",
            str(Path(__file__).resolve().parent.parent.parent / "data" / "audio_cache"),
        )
    )

    # Step 15: Security & Prompt Defense
    SECRET_KEY: str = os.getenv("SECRET_KEY", "rift-dev-secret-key-32bytes-secure").strip()
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(50 * 1024 * 1024)))
    MAX_PDF_PAGES: int = int(os.getenv("MAX_PDF_PAGES", "500"))
    SIGNED_URL_DEFAULT_EXPIRY_SECONDS: int = int(os.getenv("SIGNED_URL_DEFAULT_EXPIRY_SECONDS", "3600"))

settings = Settings()

