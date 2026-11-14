from __future__ import annotations

from pathlib import Path
import re

from pypdf import PdfReader

SUPPORTED_EXTENSIONS = {'.txt', '.pdf'}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


def sanitize_filename(filename: str) -> str:
    candidate = Path(filename).name.replace('..', '')
    safe = ''.join(ch for ch in candidate if ch.isalnum() or ch in {'-', '_', '.', ' '})
    return safe.strip() or 'medical_document.txt'


def is_supported_file(path: Path) -> bool:
    return path.suffix.lower() in SUPPORTED_EXTENSIONS


def extract_text(path: Path) -> str:
    return '\n'.join(page for page in extract_pages(path) if page.strip())


def _clean_text(text: str) -> str:
    text = text.replace('\x00', '').replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+', '\n\n', text)
    return text.strip()


def extract_pages(path: Path) -> list[str]:
    if path.suffix.lower() == '.txt':
        return [_clean_text(path.read_text(encoding='utf-8-sig', errors='replace'))]
    if path.suffix.lower() == '.pdf':
        try:
            reader = PdfReader(str(path))
            return [_clean_text(page.extract_text() or '') for page in reader.pages]
        except Exception as exc:
            raise ValueError(f'Unable to extract readable text from PDF {path.name}.') from exc
    raise ValueError(f'Unsupported file type for {path.name}')
