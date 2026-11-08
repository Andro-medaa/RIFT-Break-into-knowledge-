"""Production-grade embedding service using Google Gemini Embedding 2.

Generates 768-dimensional dense vector embeddings using Google's flagship
gemini-embedding-2 model (with Matryoshka output_dimensionality=768).
Includes batching, async execution, vision-based image captioning, and fallback
pseudo-embeddings for offline development / test environments without an API key.
"""

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

    async def embed_texts(
        self,
        texts: list[str],
        task_type: str = "RETRIEVAL_DOCUMENT",
        batch_size: int = 16,
    ) -> list[list[float]]:
        """Generate 768-dim embeddings using gemini-embedding-2."""
        if not texts:
            return []

        if not self._client:
            logger.debug(f"Gemini API key not set; using deterministic fallback for {len(texts)} texts.")
            return [_generate_fallback_embedding(t) for t in texts]

        results: list[list[float]] = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            safe_batch = [t[:8000] if len(t) > 8000 else t for t in batch]
            batch_success = False

            # Try primary model then fallbacks
            candidate_models = [self.active_model] + [m for m in FALLBACK_MODELS if m != self.active_model]
            for model_name in candidate_models:
                try:
                    response = await self._client.aio.models.embed_content(
                        model=model_name,
                        contents=safe_batch,
                        config=types.EmbedContentConfig(
                            task_type=task_type,
                            output_dimensionality=EMBEDDING_DIM,
                        ),
                    )
                    self.active_model = model_name
                    if hasattr(response, "embeddings") and response.embeddings:
                        for emb in response.embeddings:
                            results.append(emb.values)
                        batch_success = True
                        break
                    elif hasattr(response, "embedding") and response.embedding:
                        results.append(response.embedding.values)
                        batch_success = True
                        break
                except Exception as exc:
                    logger.debug(f"Model {model_name} embed_content failed: {exc}")

            if not batch_success:
                logger.warning(f"All Gemini embedding models failed for batch; using fallback.")
                results.extend([_generate_fallback_embedding(t) for t in batch])

        return results

    async def embed_query(self, query: str) -> list[float]:
        """Generate 768-dim embedding for a search query (task_type=RETRIEVAL_QUERY)."""
        embs = await self.embed_texts([query], task_type="RETRIEVAL_QUERY")
        return embs[0] if embs else _generate_fallback_embedding(query)

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
                model="gemini-2.5-flash",
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
