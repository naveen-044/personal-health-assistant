from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import patch

from backend.services.embeddings import EmbeddingService


class _Array:
    def __init__(self, value: list[list[float]]) -> None:
        self.value = value

    def tolist(self) -> list[list[float]]:
        return self.value


class EmbeddingServiceTests(unittest.TestCase):
    def test_model_load_and_embedding_dimension(self) -> None:
        expected = [0.25] * 384

        class FakeModel:
            def get_sentence_embedding_dimension(self) -> int:
                return 384

            def encode(self, texts: list[str], convert_to_numpy: bool) -> _Array:
                self.texts = texts
                self.convert_to_numpy = convert_to_numpy
                return _Array([expected for _ in texts])

        model = FakeModel()
        module = SimpleNamespace(SentenceTransformer=lambda name: model)
        service = EmbeddingService()
        service.allow_download = True

        with patch.dict('sys.modules', {'sentence_transformers': module}):
            self.assertIs(service.get_model(), model)
            vectors = service(['fever', 'hydration'])

        self.assertEqual(service.name(), 'sentence-transformers/all-MiniLM-L6-v2')
        self.assertEqual([len(vector) for vector in vectors], [384, 384])
        self.assertEqual(model.texts, ['fever', 'hydration'])
        self.assertTrue(model.convert_to_numpy)

    def test_model_load_failure_is_explicit(self) -> None:
        module = SimpleNamespace(SentenceTransformer=lambda name: (_ for _ in ()).throw(OSError('offline')))
        service = EmbeddingService()
        service.allow_download = True

        with patch.dict('sys.modules', {'sentence_transformers': module}):
            with self.assertRaisesRegex(RuntimeError, 'Unable to load embedding model'):
                service.get_model()

    def test_disabled_download_does_not_use_fallback_embeddings(self) -> None:
        service = EmbeddingService()
        service.allow_download = False

        with self.assertRaisesRegex(RuntimeError, 'ALLOW_EMBEDDING_DOWNLOAD is disabled'):
            service.embed('health question')

    def test_wrong_model_dimensions_are_rejected(self) -> None:
        module = SimpleNamespace(
            SentenceTransformer=lambda name: SimpleNamespace(
                get_sentence_embedding_dimension=lambda: 768
            )
        )
        service = EmbeddingService()
        service.allow_download = True

        with patch.dict('sys.modules', {'sentence_transformers': module}):
            with self.assertRaisesRegex(RuntimeError, 'returned 768 dimensions'):
                service.get_model()


if __name__ == '__main__':
    unittest.main()
