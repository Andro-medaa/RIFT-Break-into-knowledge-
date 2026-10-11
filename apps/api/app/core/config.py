from typing import List
import os

class Settings:
    PROJECT_NAME: str = "RIFT API"
    VERSION: str = "0.1.0"
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
        "*",
    ]
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

settings = Settings()
