from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from backend.database.store import store
from backend.schemas.chat import ChatRequest, ChatResponse
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


@router.post('/api/chat', response_model=ChatResponse)
async def answer_question(request: Request) -> dict[str, Any]:
    body = await request.body()
    raw_body: Any = {}
    if body:
        try:
            raw_body = json.loads(body.decode('utf-8'))
        except Exception:
            try:
                raw_body = json.loads(body)
            except Exception:
                raw_body = {}

    print(f'RAW_BODY={raw_body}', flush=True)
    if isinstance(raw_body, str):
        raw_body = {'question': raw_body}
    if not isinstance(raw_body, dict):
        raise HTTPException(status_code=400, detail='Request body must be a JSON object.')

    question = raw_body.get('question')
    if not isinstance(question, str):
        question = raw_body.get('question_text') or raw_body.get('query') or raw_body.get('message')
    if not isinstance(question, str) or not question.strip():
        raise HTTPException(status_code=400, detail='Question is required.')

    payload = ChatRequest(question=question.strip(), conversation_id=raw_body.get('conversation_id'))

    user_id = get_current_user_id(request)
    profile = store.get_or_create_profile(user_id)
    conversation_id = payload.conversation_id or str(uuid.uuid4())

    result = rag_pipeline.process_question(payload.question, user_profile=profile, conversation_context=None)
    response = {
        'conversation_id': conversation_id,
        'answer': result['answer'],
        'sources': result['sources'],
        'safety_notice': result['safety_notice'],
    }
    store.append_turn(user_id, conversation_id, payload.question, result['answer'], result['sources'])
    return response


@router.get('/api/chat/history')
def get_history(request: Request) -> dict[str, Any]:
    user_id = get_current_user_id(request)
    conversations = store.get_conversations(user_id)
    return {'conversations': conversations}


@router.delete('/api/chat/history/{conversation_id}')
def delete_history(conversation_id: str, request: Request) -> dict[str, Any]:
    user_id = get_current_user_id(request)
    deleted = store.delete_conversation(user_id, conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='Conversation not found.')
    return {'status': 'deleted', 'conversation_id': conversation_id}
