import hashlib
import logging
import math
from typing import List, Protocol
from app.core.config import settings

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 768


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Computes cosine similarity between two float vectors."""
    if len(vec_a) != len(vec_b) or not vec_a:
        return 0.0

    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))

    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0

    return dot / (norm_a * norm_b)


class EmbeddingProvider(Protocol):
    def embed_text(self, text: str) -> List[float]:
        """Generate a 768-dimensional normalized float embedding vector."""
        ...

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a batch of strings."""
        ...


class DeterministicEmbeddingProvider:
    """
    Deterministic unit-normalized 768-dim embedding provider.
    Generates reproducible, semantic-preserving hash vectors based on token n-grams.
    Used during offline tests, local environments, or when Gemini API key is absent.
    """

    def __init__(self, dim: int = EMBEDDING_DIM):
        self.dim = dim

    def embed_text(self, text: str) -> List[float]:
        import re

        clean = text.lower().strip()
        vec = [0.0] * self.dim

        tokens = [t for t in re.findall(r"\w+", clean) if len(t) > 1]
        if not tokens:
            vec[0] = 1.0
            return vec

        for idx, token in enumerate(tokens):
            # Compute whole token hash
            h = int(hashlib.sha256(token.encode("utf-8")).hexdigest(), 16)
            bucket = h % self.dim
            vec[bucket] += 2.0

            # Character tri-grams for subword similarity
            if len(token) >= 3:
                for c_idx in range(len(token) - 2):
                    tri = token[c_idx : c_idx + 3]
                    th = int(hashlib.sha256(tri.encode("utf-8")).hexdigest(), 16)
                    vec[th % self.dim] += 0.4

            # Word bigrams for phrase matching
            if idx > 0:
                bi = f"{tokens[idx - 1]}_{token}"
                bi_h = int(hashlib.sha256(bi.encode("utf-8")).hexdigest(), 16)
                vec[bi_h % self.dim] += 1.0

        # Normalize to unit length
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [x / norm for x in vec]
        else:
            vec[0] = 1.0

        return vec

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return [self.embed_text(t) for t in texts]


class GeminiEmbeddingProvider:
    """
    Production embedding provider using Gemini text-embedding-004 (768-dimensional).
    Falls back gracefully to DeterministicEmbeddingProvider if offline or unauthenticated.
    """

    def __init__(self, api_key: str = "", fallback: bool = False):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.fallback_provider = DeterministicEmbeddingProvider()
        self.fallback = fallback or not bool(self.api_key)

    def embed_text(self, text: str) -> List[float]:
        if self.fallback:
            return self.fallback_provider.embed_text(text)

        try:
            from google import genai

            client = genai.Client(api_key=self.api_key)
            result = client.models.embed_content(
                model="text-embedding-004",
                contents=text,
            )

            if hasattr(result, "embeddings") and result.embeddings:
                return result.embeddings[0].values
            elif hasattr(result, "embedding") and result.embedding:
                return result.embedding.values

            return self.fallback_provider.embed_text(text)
        except Exception as e:
            logger.warning(f"Gemini embedding failed: {e}. Using deterministic fallback.")
            return self.fallback_provider.embed_text(text)

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        if self.fallback:
            return self.fallback_provider.embed_batch(texts)

        try:
            from google import genai

            client = genai.Client(api_key=self.api_key)
            result = client.models.embed_content(
                model="text-embedding-004",
                contents=texts,
            )

            if hasattr(result, "embeddings") and result.embeddings:
                return [e.values for e in result.embeddings]

            return self.fallback_provider.embed_batch(texts)
        except Exception as e:
            logger.warning(f"Gemini batch embedding failed: {e}. Using deterministic fallback.")
            return self.fallback_provider.embed_batch(texts)


def get_embedding_provider() -> EmbeddingProvider:
    """Factory returning active embedding provider."""
    if settings.GEMINI_API_KEY.strip():
        return GeminiEmbeddingProvider(api_key=settings.GEMINI_API_KEY)
    return DeterministicEmbeddingProvider()
