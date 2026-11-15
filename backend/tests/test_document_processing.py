from __future__ import annotations

import gc
from pathlib import Path
import tempfile
import unittest

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from backend.services.document_loader import extract_pages, extract_text
from backend.services.rag_pipeline import RAGPipeline


class DocumentProcessingTests(unittest.TestCase):
    def test_txt_loader_normalizes_and_ignores_empty_lines(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'health.txt'
            path.write_text('\ufeff## Health\r\n\r\n  Keep   hydrated. \x00\r\n\r\n', encoding='utf-8')

            pages = extract_pages(path)

            self.assertEqual(len(pages), 1)
            self.assertEqual(pages[0], '## Health\n\n Keep hydrated.')
            self.assertEqual(extract_text(path), pages[0])

    def test_pdf_loader_extracts_text_from_project_health_reference(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'health.pdf'
            writer = PdfWriter()
            page = writer.add_blank_page(width=300, height=300)
            content = DecodedStreamObject()
            content.set_data(b'BT /F1 12 Tf 10 100 Td (Health guidelines include hydration.) Tj ET')
            page[NameObject('/Contents')] = content
            page[NameObject('/Resources')] = DictionaryObject({
                NameObject('/Font'): DictionaryObject({
                    NameObject('/F1'): DictionaryObject({
                        NameObject('/Type'): NameObject('/Font'),
                        NameObject('/Subtype'): NameObject('/Type1'),
                        NameObject('/BaseFont'): NameObject('/Helvetica'),
                    }),
                }),
            })
            with path.open('wb') as output:
                writer.write(output)

            pages = extract_pages(path)

            self.assertTrue(pages)
            self.assertEqual(pages[0], 'Health guidelines include hydration.')
            self.assertTrue(extract_text(path).strip())

    def test_chunker_applies_configurable_size_and_overlap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            pipeline = RAGPipeline(Path(directory) / 'docs', Path(directory) / 'chroma')
            try:
                content = ' '.join(f'healthword{index}' for index in range(120))

                chunks = pipeline._chunk_text(f'## Hydration\n{content}', chunk_size=120, overlap=30)

                self.assertGreater(len(chunks), 2)
                for _, chunk in chunks:
                    self.assertLessEqual(len(chunk), 120)
                first_body = chunks[0][1].split('\n', 1)[1]
                second_body = chunks[1][1].split('\n', 1)[1]
                self.assertTrue(set(first_body.split()) & set(second_body.split()))
            finally:
                pipeline.client.close()
                pipeline = None
                gc.collect()

    def test_chunker_rejects_invalid_overlap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            pipeline = RAGPipeline(Path(directory) / 'docs', Path(directory) / 'chroma')
            try:
                with self.assertRaises(ValueError):
                    pipeline._chunk_text('## Health\nSome health guidance.', chunk_size=100, overlap=100)
            finally:
                pipeline.client.close()
                pipeline = None
                gc.collect()


if __name__ == '__main__':
    unittest.main()
