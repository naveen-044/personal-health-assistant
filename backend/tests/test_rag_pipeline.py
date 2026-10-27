from __future__ import annotations

import gc
from pathlib import Path
import tempfile
import unittest

from backend.database.store import InMemoryStore
from backend.services.rag_pipeline import RAGPipeline


HEALTH_TEXT = (
    '## Hydration\n'
    'Dehydration symptoms include dark urine and lightheadedness. '
    'Health guidance recommends drinking water and seeking medical care for severe symptoms.'
)


class RAGPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.data_dir = root / 'documents'
        self.chroma_dir = root / 'chroma'
        self.pipeline = RAGPipeline(data_dir=self.data_dir, chroma_path=self.chroma_dir)

    def tearDown(self) -> None:
        self.pipeline.client.close()
        self.pipeline = None
        gc.collect()
        self.temp_dir.cleanup()

    def _index_health_doc(self, document_id: str, filename: str) -> Path:
        storage_name = f'{document_id}_{filename}'
        path = self.data_dir / storage_name
        path.write_text(HEALTH_TEXT, encoding='utf-8')
        self.pipeline.index_document(
            path,
            document_id=document_id,
            filename=filename,
            owner_id='test-user',
        )
        return path

    def test_search_excludes_legacy_resume_chunks(self) -> None:
        self._index_health_doc('health-1', 'health-guidelines.txt')
        resume_text = 'College education degree skills work experience projects.'
        self.pipeline.collection.add(
            ids=['legacy-resume-chunk'],
            documents=[resume_text],
            metadatas=[{'source': 'temp_resume.pdf', 'section': 'Education'}],
            embeddings=self.pipeline.embedding_service([resume_text]),
        )

        results = self.pipeline.search(
            'What are the symptoms of dehydration and what care is recommended?',
            user_id='test-user',
        )

        self.assertTrue(results)
        self.assertTrue(all(result['source'] == 'health-guidelines.txt' for result in results))
        self.assertFalse(any('College' in result['snippet'] for result in results))

    def test_delete_removes_only_the_selected_document(self) -> None:
        first_path = self._index_health_doc('health-1', 'first-guidelines.txt')
        self._index_health_doc('health-2', 'second-guidelines.txt')

        removed = self.pipeline.delete_document('health-1', first_path.name)

        self.assertEqual(removed, 1)
        self.assertFalse(first_path.exists())
        remaining = self.pipeline.collection.get(include=['metadatas'])
        self.assertEqual(len(remaining['ids']), 1)
        self.assertEqual(remaining['metadatas'][0]['document_id'], 'health-2')

    def test_delete_uses_exact_source_for_legacy_chunks(self) -> None:
        old_storage_name = 'legacy-1_old-guidelines.txt'
        other_storage_name = 'legacy-2_other-guidelines.txt'
        old_path = self.data_dir / old_storage_name
        other_path = self.data_dir / other_storage_name
        old_path.write_text(HEALTH_TEXT, encoding='utf-8')
        other_path.write_text(HEALTH_TEXT, encoding='utf-8')
        self.pipeline.collection.add(
            ids=['legacy-health-1', 'legacy-health-2'],
            documents=[HEALTH_TEXT, HEALTH_TEXT],
            metadatas=[
                {'source': old_storage_name, 'section': 'Hydration'},
                {'source': other_storage_name, 'section': 'Hydration'},
            ],
            embeddings=self.pipeline.embedding_service([HEALTH_TEXT, HEALTH_TEXT]),
        )

        removed = self.pipeline.delete_document('legacy-1', old_storage_name)

        self.assertEqual(removed, 1)
        self.assertFalse(old_path.exists())
        self.assertTrue(other_path.exists())
        remaining = self.pipeline.collection.get(include=['metadatas'])
        self.assertEqual(remaining['ids'], ['legacy-health-2'])

    def test_resume_upload_is_rejected(self) -> None:
        path = self.data_dir / 'temp_resume.txt'
        path.write_text(HEALTH_TEXT + '\nWork experience and education projects.', encoding='utf-8')

        with self.assertRaisesRegex(ValueError, 'health reference document'):
            self.pipeline.index_document(path, document_id='resume-1', filename='temp_resume.txt')

        self.assertEqual(self.pipeline.collection.count(), 0)

    def test_non_health_question_does_not_retrieve_medical_chunks(self) -> None:
        self._index_health_doc('health-1', 'health-guidelines.txt')

        results = self.pipeline.search(
            'Which college did I attend and when did I graduate?',
            user_id='test-user',
        )

        self.assertEqual(results, [])

    def test_indexed_chunks_include_document_and_page_metadata(self) -> None:
        path = self._index_health_doc('health-1', 'health-guidelines.txt')
        records = self.pipeline.collection.get(include=['metadatas'])
        metadata = records['metadatas'][0]

        self.assertEqual(metadata['document_id'], 'health-1')
        self.assertEqual(metadata['filename'], 'health-guidelines.txt')
        self.assertEqual(metadata['owner_id'], 'test-user')
        self.assertEqual(metadata['document_type'], 'health')
        self.assertNotIn('page_number', metadata)
        self.assertTrue(path.exists())

    def test_store_document_lookup_and_removal_are_user_scoped(self) -> None:
        store = InMemoryStore()
        store.add_document('user-a', 'doc-a', 'health.pdf')
        store.add_document('user-b', 'doc-b', 'other.pdf')

        self.assertIsNone(store.get_document('user-b', 'doc-a'))
        self.assertEqual(store.get_document('user-a', 'doc-a')['filename'], 'health.pdf')
        self.assertTrue(store.remove_document('user-a', 'doc-a'))
        self.assertIsNone(store.get_document('user-a', 'doc-a'))
        self.assertIsNotNone(store.get_document('user-b', 'doc-b'))


if __name__ == '__main__':
    unittest.main()
