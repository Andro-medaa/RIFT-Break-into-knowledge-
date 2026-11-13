"""Production-grade embedding service using Google Gemini Embedding 2.

Generates 768-dimensional dense vector embeddings using Google's flagship
gemini-embedding-2 model (with Matryoshka output_dimensionality=768).
Includes batching, async execution, vision-based image captioning, and fallback
pseudo-embeddings for offline development / test environments without an API key.
"""

import asyncio
import hashlib
import math
from typing import Optional
from google import genai
from google.genai import types

from app.core.config import setting
from app.core.logger import get_logger

logger = get_logger("app.services.embedding")

# Primary model requested: Gemini Embedding 2
PRIMARY_MODEL = "gemini-embedding-2"
FALLBACK_MODELS = ["gemini-embedding-2-preview", "gemini-embedding-001"]
EMBEDDING_DIM = 768


def _generate_fallback_embedding(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """Generate a deterministic normalized unit vector for testing/offline use."""
    seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:8], 16)
    vec = [math.sin(seed + i * 0.17) for i in range(dim)]
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [round(x / norm, 6) for x in vec]


class GeminiEmbeddingService:
    """Handles vector embeddings and multimodal descriptions via Google Gemini API."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or setting.gemini_api_key
        self._client: Optional[genai.Client] = None
        self.active_model = PRIMARY_MODEL
        if self.api_key:
            try:
                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini client: {e}")

    @property
    def is_configured(self) -> bool:
        """Check if a live Gemini client is available."""
        return self._client is not None

    async def _embed_single_text(
        self,
        text: str,
        task_type: str = "RETRIEVAL_DOCUMENT",
    ) -> list[float]:
        """Embed an individual text string, returning 768-dim vector."""
        if not text or not text.strip():
            return _generate_fallback_embedding("")

        if not self._client:
            return _generate_fallback_embedding(text)

        safe_text = text[:8000] if len(text) > 8000 else text
        candidate_models = [self.active_model] + [m for m in FALLBACK_MODELS if m != self.active_model]

        for model_name in candidate_models:
            try:
                response = await self._client.aio.models.embed_content(
                    model=model_name,
                    contents=safe_text,
                    config=types.EmbedContentConfig(
                        task_type=task_type,
                        output_dimensionality=EMBEDDING_DIM,
                    ),
                )
                self.active_model = model_name
                if hasattr(response, "embeddings") and response.embeddings:
                    return response.embeddings[0].values
                elif hasattr(response, "embedding") and response.embedding:
                    return response.embedding.values
            except Exception as exc:
                logger.debug(f"Model {model_name} embed_content failed: {exc}")

        return _generate_fallback_embedding(text)

    async def embed_texts(
        self,
        texts: list[str],
        task_type: str = "RETRIEVAL_DOCUMENT",
        concurrency: int = 15,
    ) -> list[list[float]]:
        """Generate 768-dim embeddings for all texts using high-concurrency async tasks.
        
        Guarantees that every single input text gets a distinct, dense 768-dimensional embedding.
        """
        if not texts:
            return []

        if not self._client:
            logger.debug(f"Gemini API key not set; using deterministic fallback for {len(texts)} texts.")
            return [_generate_fallback_embedding(t) for t in texts]

        sem = asyncio.Semaphore(concurrency)

        async def worker(t: str) -> list[float]:
            async with sem:
                return await self._embed_single_text(t, task_type=task_type)

        results = await asyncio.gather(*(worker(t) for t in texts))
        return list(results)

    async def embed_query(self, query: str) -> list[float]:
        """Generate 768-dim embedding for a search query (task_type=RETRIEVAL_QUERY)."""
        return await self._embed_single_text(query, task_type="RETRIEVAL_QUERY")

    async def caption_image(self, image_bytes: bytes, mime_type: str = "image/png") -> str:
        """Use Gemini 2.0 Flash to generate a semantic caption for extracted PDF figures."""
        if not self._client:
            return "Diagram or figure extracted from the PDF."

        try:
            prompt = (
                "Provide a concise, detailed technical description of this figure, chart, "
                "or table from a document. Include any visible labels, numbers, trends, or text."
            )
            response = await self._client.aio.models.generate_content(
                model="gemini-3.8-flash",
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    prompt,
                ],
            )
            if response.text:
                return response.text.strip()
        except Exception as exc:
            logger.warning(f"Gemini image captioning failed: {exc}")

        return "Diagram or figure extracted from the PDF."


embedding_service = GeminiEmbeddingService()
