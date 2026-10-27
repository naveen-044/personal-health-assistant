from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status

from backend.config import settings
from backend.database.store import store
from backend.services.rag_pipeline import rag_pipeline

router = APIRouter()


def get_current_user_id(request: Request | None = None) -> str:
    if request is not None:
        user_header = request.headers.get('x-user-id')
        if user_header and user_header.strip():
            return user_header.strip()
    import os
    user_id = os.getenv('CHAT_USER_ID', 'demo-user')
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Authentication required.')
    return user_id


@router.post('/api/documents/upload')
async def upload_document(request: Request, file: UploadFile = File(...)) -> dict:
    user_id = get_current_user_id(request)
    if not file.filename:
        raise HTTPException(status_code=400, detail='A file is required.')

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {'.pdf', '.txt'}:
        raise HTTPException(status_code=400, detail='Only PDF and TXT files are supported.')

    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail='File exceeds the allowed size.')

    safe_name = ''.join(ch for ch in Path(file.filename).name if ch.isalnum() or ch in {'-', '_', '.', ' '})
    document_id = str(uuid.uuid4())
    unique_name = f'{document_id}_{safe_name}'
    storage_path = settings.DATA_DIR / unique_name
    storage_path.write_bytes(file_bytes)

    try:
        rag_pipeline.index_document(storage_path)
        store.add_document(user_id, document_id, safe_name, 'indexed')
        return {'document_id': document_id, 'filename': safe_name, 'status': 'indexed', 'message': 'Document uploaded and indexed successfully.'}
    except Exception as exc:
        storage_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f'Unable to index this file: {exc}') from exc


@router.get('/api/documents')
def list_documents(request: Request) -> dict:
    user_id = get_current_user_id(request)
    return {'documents': store.list_documents(user_id)}


@router.delete('/api/documents/{document_id}')
def delete_document(document_id: str, request: Request) -> dict:
    user_id = get_current_user_id(request)
    removed = store.remove_document(user_id, document_id)
    if not removed:
        raise HTTPException(status_code=404, detail='Document not found for this user.')
    return {'status': 'deleted', 'document_id': document_id}
