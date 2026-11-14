from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path
import uuid

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.config import settings
from backend.services.document_loader import is_supported_file
from backend.services.rag_pipeline import rag_pipeline


def _is_uploaded_storage_file(path: Path) -> bool:
    try:
        uuid.UUID(path.name.split('_', 1)[0])
    except ValueError:
        return False
    return True


def _is_currently_indexed(path: Path) -> bool:
    content_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    existing = rag_pipeline.collection.get(
        where={'source': path.name},
        include=['metadatas'],
    )
    metadatas = existing.get('metadatas', [])
    return bool(existing.get('ids')) and all(
        metadata and metadata.get('content_sha256') == content_hash
        for metadata in metadatas
    )


def _write_dataset_statistics(failed_documents: dict[str, str]) -> Path:
    documents_dir = settings.DATA_DIR
    curated_files = []
    for path in sorted(documents_dir.glob('*.txt')):
        text = path.read_text(encoding='utf-8-sig', errors='replace')
        category_match = re.search(r'(?im)^Category:\s*(.+?)\s*$', text)
        if category_match:
            curated_files.append((path, category_match.group(1).strip()))

    source_names = {path.name for path, _ in curated_files}
    records = rag_pipeline.collection.get(include=['metadatas'])
    indexed_chunks: dict[str, int] = {}
    for metadata in records.get('metadatas', []):
        source = (metadata or {}).get('source')
        if source in source_names:
            indexed_chunks[source] = indexed_chunks.get(source, 0) + 1

    categories: dict[str, int] = {}
    for _, category in curated_files:
        categories[category] = categories.get(category, 0) + 1

    successful = [
        path.name for path, _ in curated_files
        if path.name in indexed_chunks and path.name not in failed_documents
    ]
    failed = [
        path.name for path, _ in curated_files
        if path.name in failed_documents or path.name not in indexed_chunks
    ]
    dataset_bytes = sum(path.stat().st_size for path, _ in curated_files)
    dataset_chunks = sum(indexed_chunks.values())
    report_lines = [
        'Medical dataset statistics',
        f'Documents available: {len(curated_files)}',
        f'Dataset size: {dataset_bytes / (1024 * 1024):.4f} MB ({dataset_bytes} bytes)',
        f'Dataset chunks indexed in ChromaDB: {dataset_chunks}',
        f'Total collection chunks (includes non-dataset documents): {rag_pipeline.collection.count()}',
        f'Embedding model: {rag_pipeline.embedding_service.name()}',
        f'Embedding dimensions: {rag_pipeline.embedding_service.dimensions}',
        f'Documents indexed successfully: {len(successful)}',
        f'Documents failed or not indexed: {len(failed)}',
        '',
        'Category-wise document counts:',
    ]
    report_lines.extend(
        f'- {category}: {count}'
        for category, count in sorted(categories.items(), key=lambda item: item[0].lower())
    )
    report_lines.extend(['', 'Failed documents:'])
    if failed:
        for filename in failed:
            reason = failed_documents.get(filename, 'No matching ChromaDB records found.')
            report_lines.append(f'- {filename}: {reason}')
    else:
        report_lines.append('- None')

    report_path = documents_dir.parent / 'dataset_statistics.txt'
    report_path.write_text('\n'.join(report_lines) + '\n', encoding='utf-8')
    return report_path


def ingest_default_documents() -> int:
    documents_dir = settings.DATA_DIR
    documents_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(documents_dir.iterdir())
    indexed = 0
    for path in files:
        if not path.is_file() or not is_supported_file(path) or _is_uploaded_storage_file(path):
            continue
        try:
            if not _is_currently_indexed(path):
                result = rag_pipeline.index_document(path)
                indexed += result.get('chunks', 0)
        except Exception as exc:
            print(f"Auto-ingest skipped {path.name}: {exc}")
    try:
        _write_dataset_statistics({})
    except Exception:
        pass
    return indexed


def main() -> None:
    documents_dir = settings.DATA_DIR
    documents_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(documents_dir.iterdir())
    if not files:
        print('No documents found in the medical_documents folder.')
        return
    indexed = 0
    skipped = 0
    failed: dict[str, str] = {}
    for path in files:
        if not path.is_file() or not is_supported_file(path):
            continue
        if _is_uploaded_storage_file(path):
            skipped += 1
            print(f'Skipped uploaded document storage file {path.name}; ownership is preserved.')
            continue
        try:
            if _is_currently_indexed(path):
                skipped += 1
                print(f'Already indexed and unchanged: {path.name}.')
                continue
            result = rag_pipeline.index_document(path)
            indexed += result['chunks']
            print(f"Indexed {path.name}: {result['chunks']} chunks.")
        except ValueError as exc:
            skipped += 1
            failed[path.name] = str(exc)
            print(f'Skipped {path.name}: {exc}')
        except Exception as exc:
            failed[path.name] = str(exc)
            print(f'Failed to index {path.name}: {exc}')

    total = rag_pipeline.collection.count()
    report_path = _write_dataset_statistics(failed)
    print(
        f'Document ingestion complete. Added or updated {indexed} chunks; '
        f'skipped {skipped} file(s); collection currently contains {total} chunks.'
    )
    print(f'Dataset statistics report written to {report_path}.')
    if failed:
        raise SystemExit(f'Indexing failed for {len(failed)} file(s): {", ".join(failed)}')


if __name__ == '__main__':
    main()
