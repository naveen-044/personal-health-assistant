from __future__ import annotations

from typing import Any

from backend.config import settings

MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2'
EMBEDDING_DIMENSIONS = 384


class EmbeddingService:
    def __init__(self) -> None:
        self.model_name = MODEL_NAME
        self.dimensions = EMBEDDING_DIMENSIONS
        self.model: Any | None = None
        self.allow_download = settings.ALLOW_EMBEDDING_DOWNLOAD

    def name(self) -> str:
        return self.model_name

    def get_model(self) -> Any:
        if self.model is not None:
            return self.model
        if not self.allow_download:
            raise RuntimeError(
                f"Embedding model '{self.model_name}' is not cached and "
                'ALLOW_EMBEDDING_DOWNLOAD is disabled.'
            )
        try:
            from sentence_transformers import SentenceTransformer

            model = SentenceTransformer(self.model_name)
            get_dimension = getattr(model, 'get_embedding_dimension', None)
            if get_dimension is None:
                get_dimension = model.get_sentence_embedding_dimension
            actual_dimensions = get_dimension()
            if actual_dimensions != self.dimensions:
                raise RuntimeError(
                    f"Embedding model '{self.model_name}' returned {actual_dimensions} dimensions; "
                    f'{self.dimensions} were configured.'
                )
            self.model = model
        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError(
                f"Unable to load embedding model '{self.model_name}'. Check that "
                'sentence-transformers is installed, the model name is valid, and the model '
                'is cached or ALLOW_EMBEDDING_DOWNLOAD=true with network access.'
            ) from exc
        return self.model

    def embed(self, text: str) -> list[float]:
        vectors = self([text])
        return vectors[0]

    def __call__(self, input: str | list[str]) -> list[list[float]]:
        values = [input] if isinstance(input, str) else list(input)
        if not values:
            return []
        model = self.get_model()
        try:
            embeddings = model.encode(values, convert_to_numpy=True)
        except Exception as exc:
            raise RuntimeError(f"Embedding generation failed for model '{self.model_name}'.") from exc
        vectors = embeddings.tolist()
        if len(vectors) != len(values) or any(len(vector) != self.dimensions for vector in vectors):
            raise RuntimeError(
                f"Embedding model '{self.model_name}' must return {self.dimensions}-dimensional vectors."
            )
        return [[float(value) for value in vector] for vector in vectors]
