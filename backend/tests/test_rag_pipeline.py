from __future__ import annotations

import gc
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx

from backend.database.store import InMemoryStore
from backend.services.rag_pipeline import LLMProviderError, RAGPipeline


HEALTH_TEXT = (
    '## Hydration\n'
    'Dehydration symptoms include dark urine and lightheadedness. '
    'Health guidance recommends drinking water and seeking medical care for severe symptoms.'
)


class TestEmbeddings:
    vocabulary: dict[str, int] = {}
    stop_words = {
        'a', 'an', 'and', 'are', 'can', 'did', 'do', 'does', 'for', 'from',
        'how', 'i', 'in', 'is', 'it', 'my', 'of', 'on', 'the', 'to', 'was',
        'what', 'when', 'which', 'why',
    }

    def name(self) -> str:
        return 'test-embedding-model'

    def __call__(self, value: str | list[str]) -> list[list[float]]:
        texts = [value] if isinstance(value, str) else value
        vectors = []
        for text in texts:
            vector = [0.0] * 384
            for token in set(text.lower().split()):
                normalized = token.strip('.,?!:;()[]{}').rstrip('s')
                if normalized in self.stop_words:
                    continue
                if normalized not in self.vocabulary:
                    self.vocabulary[normalized] = len(self.vocabulary) % 384
                index = self.vocabulary[normalized]
                vector[index] += 1.0
            norm = math.sqrt(sum(component * component for component in vector)) or 1.0
            vectors.append([component / norm for component in vector])
        return vectors


class RAGPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.data_dir = root / 'documents'
        self.chroma_dir = root / 'chroma'
        self.pipeline = RAGPipeline(data_dir=self.data_dir, chroma_path=self.chroma_dir)
        self.pipeline.embedding_service = TestEmbeddings()
        self.pipeline.max_cosine_distance = 0.96

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

    def test_named_condition_without_retrieved_support_returns_no_evidence(self) -> None:
        self._index_health_doc('health-1', 'health-guidelines.txt')

        results = self.pipeline.search('What is the treatment for Wilson disease?')

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

    def test_curated_document_metadata_includes_category_review_and_references(self) -> None:
        path = self.data_dir / 'metadata-guidelines.txt'
        path.write_text(
            'Category: General health\n'
            'Reviewed: 2026-11-09\n'
            '## Hydration\n'
            'Health guidance supports hydration and medical care for severe dehydration.\n'
            '## Sources\n'
            '- CDC: https://www.cdc.gov/example/health.html\n',
            encoding='utf-8',
        )

        self.pipeline.index_document(path)

        record = self.pipeline.collection.get(include=['metadatas'])
        metadata = record['metadatas'][0]
        self.assertEqual(metadata['category'], 'General health')
        self.assertEqual(metadata['reviewed'], '2026-11-09')
        self.assertIn('https://www.cdc.gov/example/health.html', metadata['reference_urls'])
        self.assertEqual(len(metadata['content_sha256']), 64)

    def test_reindexing_same_document_does_not_duplicate_chunks(self) -> None:
        path = self._index_health_doc('health-1', 'health-guidelines.txt')
        initial_count = self.pipeline.collection.count()

        result = self.pipeline.index_document(
            path,
            document_id='health-1',
            filename='health-guidelines.txt',
            owner_id='test-user',
        )

        self.assertEqual(self.pipeline.collection.count(), initial_count)
        self.assertEqual(result['chunks'], initial_count)

    def test_reindex_updates_content_without_losing_existing_document_on_embedding_error(self) -> None:
        path = self._index_health_doc('health-1', 'health-guidelines.txt')
        initial = self.pipeline.collection.get(where={'document_id': 'health-1'}, include=['documents'])
        original_count = len(initial['ids'])
        path.write_text(
            '## Heart health\nHeart disease prevention includes health education and clinical care.',
            encoding='utf-8',
        )
        self.pipeline.embedding_service = lambda values: (_ for _ in ()).throw(RuntimeError('embedding unavailable'))

        with self.assertRaises(RuntimeError):
            self.pipeline.index_document(
                path,
                document_id='health-1',
                filename='health-guidelines.txt',
                owner_id='test-user',
            )

        remaining = self.pipeline.collection.get(where={'document_id': 'health-1'}, include=['documents'])
        self.assertEqual(len(remaining['ids']), original_count)
        self.assertEqual(remaining['documents'], initial['documents'])

    def test_unfamiliar_health_wording_is_not_rejected_by_keyword_filter(self) -> None:
        path = self.data_dir / 'health-guidelines.txt'
        path.write_text(
            '## Throat discomfort\nA sore throat may occur during a respiratory infection. '
            'Seek care for severe or worsening symptoms.',
            encoding='utf-8',
        )
        self.pipeline.index_document(
            path,
            document_id='health-throat',
            filename='health-guidelines.txt',
            owner_id='test-user',
        )

        results = self.pipeline.search('Why does my throat feel scratchy?', user_id='test-user')

        self.assertTrue(results)
        self.assertIn('throat', results[0]['snippet'].lower())

    def test_stricter_relevance_threshold_rejects_unrelated_terms(self) -> None:
        path = self.data_dir / 'fever-guidance.txt'
        extra_terms = ' '.join(f'topic{index}' for index in range(30))
        path.write_text(
            f'## Fever\nFever care includes health guidance. {extra_terms}',
            encoding='utf-8',
        )
        self.pipeline.index_document(
            path,
            document_id='health-fever',
            filename='fever-guidance.txt',
            owner_id='test-user',
        )
        self.assertTrue(self.pipeline.search('health kidney stones?', user_id='test-user'))

        self.pipeline.max_cosine_distance = 0.78
        self.assertEqual(self.pipeline.search('health kidney stones?', user_id='test-user'), [])

    def test_fifteen_general_health_queries_use_semantic_retrieval(self) -> None:
        content = (
            '## General health information\n'
            'Fever, cold, cough, headache, and stomach discomfort are common symptoms with many causes. '
            'Diabetes awareness includes blood glucose and prevention. Blood pressure, heart health, and '
            'kidney health are connected. Sleep, hydration, nutrition, vitamins, and exercise support '
            'wellness. Medication safety means asking a pharmacist. First aid, menstrual health, and '
            'respiratory illness should be discussed with a healthcare professional when needed.'
        )
        path = self.data_dir / 'health-reference.txt'
        path.write_text(content, encoding='utf-8')
        self.pipeline.index_document(
            path,
            document_id='health-topics',
            filename='health-reference.txt',
            owner_id='test-user',
        )
        questions = [
            'What can cause a fever?',
            'How can I prevent catching a cold?',
            'What should I know about a cough?',
            'What are common headache causes?',
            'What might cause stomach discomfort?',
            'What is diabetes awareness?',
            'Why should blood pressure be checked?',
            'How can I support heart health?',
            'What do kidneys do?',
            'How does sleep affect wellness?',
            'Why is hydration important?',
            'What should I know about vitamins and nutrition?',
            'How can I ask about medication safety?',
            'What is basic first aid awareness?',
            'What should I know about menstrual health?',
        ]

        results_by_question = {
            question: self.pipeline.search(question, user_id='test-user')
            for question in questions
        }

        self.assertEqual(len(results_by_question), 15)
        empty_questions = [question for question, results in results_by_question.items() if not results]
        self.assertEqual(empty_questions, [])

    def test_medication_question_without_evidence_uses_safe_fallback(self) -> None:
        result = self.pipeline.process_question('What dose of this medicine should I take?')

        self.assertEqual(result['sources'], [])
        self.assertIn('could not find relevant supporting information', result['answer'])
        self.assertIn('healthcare professional', result['answer'])
        self.assertIn('not a diagnosis', result['answer'])

    def test_groq_uses_configured_model_and_retrieved_context(self) -> None:
        response = unittest.mock.MagicMock()
        response.json.return_value = {
            'choices': [{'message': {'content': 'Retrieved context indicates that hydration supports wellbeing.'}}],
        }
        client = unittest.mock.MagicMock()
        client.__enter__.return_value = client
        client.post.return_value = response
        with (
            patch('backend.services.rag_pipeline.settings.GROQ_API_KEY', 'test-key'),
            patch('backend.services.rag_pipeline.settings.LLM_MODEL', 'test-model'),
            patch('backend.services.rag_pipeline.httpx.Client', return_value=client),
        ):
            answer = self.pipeline._call_llm(
                'How does hydration help?',
                '[wellness.txt - Hydration]: Drink fluids regularly.',
            )

        self.assertIn('Retrieved context', answer)
        args, kwargs = client.post.call_args
        self.assertEqual(args[0], 'https://api.groq.com/openai/v1/chat/completions')
        self.assertEqual(kwargs['json']['model'], 'test-model')
        self.assertIn('Drink fluids regularly.', kwargs['json']['messages'][1]['content'])
        self.assertIn('Never invent medical facts', kwargs['json']['messages'][0]['content'])
        self.assertIn('How does hydration help?', kwargs['json']['messages'][1]['content'])

    def test_groq_failure_does_not_silently_switch_provider(self) -> None:
        client = unittest.mock.MagicMock()
        client.__enter__.return_value = client
        client.post.side_effect = httpx.ConnectError('test connection failure')
        with (
            patch('backend.services.rag_pipeline.settings.GROQ_API_KEY', 'test-key'),
            patch('backend.services.rag_pipeline.httpx.Client', return_value=client),
        ):
            with self.assertRaisesRegex(LLMProviderError, 'Groq could not be reached'):
                self.pipeline._call_llm('Question', 'retrieved evidence')

        self.assertEqual(client.post.call_count, 1)

    def test_missing_groq_key_is_a_clear_error(self) -> None:
        with patch('backend.services.rag_pipeline.settings.GROQ_API_KEY', ''):
            with self.assertRaisesRegex(LLMProviderError, 'Set GROQ_API_KEY'):
                self.pipeline._call_llm('Question', 'retrieved evidence')

    def test_user_profile_details_are_not_sent_to_the_llm(self) -> None:
        self._index_health_doc('health-1', 'health-guidelines.txt')
        with patch.object(self.pipeline, '_call_llm', return_value='Grounded answer.') as call_llm:
            self.pipeline.process_question(
                'What does the health library say about hydration?',
                user_profile={
                    'name': 'Private Test Name',
                    'allergies': 'Private Test Allergy',
                    'conditions': 'Private Test Condition',
                    'medications': 'Private Test Medicine',
                },
                user_id='test-user',
            )

        self.assertNotIn('Private Test', str(call_llm.call_args))
        self.assertEqual(len(call_llm.call_args.args), 2)

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
