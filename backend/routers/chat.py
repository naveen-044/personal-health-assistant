from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.auth.dependencies import get_current_user
from backend.database.store import store
from backend.schemas.chat import ChatRequest, ChatResponse
from backend.services.rag_pipeline import LLMProviderError, rag_pipeline

router = APIRouter()


@router.post('/api/chat', response_model=ChatResponse)
@router.post('/chat', response_model=ChatResponse)
async def answer_question(request: Request, user: dict = Depends(get_current_user)) -> dict[str, Any]:
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

    user_id = user['user_id']
    profile = store.get_or_create_profile(user_id)
    conversation_id = payload.conversation_id or str(uuid.uuid4())

    try:
        result = rag_pipeline.process_question(
            payload.question,
            user_profile=profile,
            conversation_context=None,
            user_id=user_id,
        )
    except LLMProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    response = {
        'conversation_id': conversation_id,
        'answer': result['answer'],
        'sources': result['sources'],
        'safety_notice': result['safety_notice'],
    }
    store.append_turn(user_id, conversation_id, payload.question, result['answer'], result['sources'])
    return response


@router.get('/api/chat/history')
@router.get('/chat/history')
def get_history(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    user_id = user['user_id']
    conversations = store.get_conversations(user_id)
    return {'conversations': conversations}


@router.delete('/api/chat/history')
@router.delete('/chat/history')
def clear_all_history(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    user_id = user['user_id']
    cleared = store.clear_conversations(user_id)
    return {'status': 'deleted', 'message': 'Chat history cleared.', 'cleared': cleared}


@router.delete('/api/chat/history/{conversation_id}')
@router.delete('/chat/history/{conversation_id}')
def delete_history(conversation_id: str, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    user_id = user['user_id']
    deleted = store.delete_conversation(user_id, conversation_id)
    return {'status': 'deleted', 'conversation_id': conversation_id, 'existed': deleted}
