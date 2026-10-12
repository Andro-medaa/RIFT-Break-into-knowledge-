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

settings = Settings()

