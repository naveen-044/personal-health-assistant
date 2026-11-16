from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.auth.dependencies import get_current_user
from backend.config import settings
from backend.database.store import store
from backend.schemas.chat import ChatRequest, ChatResponse
from backend.services.gemini_service import (
    GeminiConfigError,
    GeminiError,
    GeminiQuotaError,
    call_gemini_api,
    parse_image_payload,
)
from backend.services.rag_pipeline import LLMProviderError, rag_pipeline

logger = logging.getLogger('uvicorn.error')
router = APIRouter()


@router.get('/api/chat/usage')
@router.get('/chat/usage')
def get_chat_usage(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    user_id = user['user_id']
    usage = store.get_daily_usage(user_id, service='gemini', limit=settings.GEMINI_DAILY_LIMIT)
    usage['server_gemini_configured'] = bool(settings.GEMINI_API_KEY)
    return usage


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

    image_data = raw_body.get('image')
    if isinstance(image_data, str) and not image_data.strip():
        image_data = None

    # If image is provided without a question, provide a natural default question
    if (not isinstance(question, str) or not question.strip()) and image_data:
        question = "Please analyze this medical image or doctor's prescription in detail."

    if not isinstance(question, str) or not question.strip():
        raise HTTPException(status_code=400, detail='Question or image is required.')

    selected_model = str(raw_body.get('model') or '').strip().lower()
    custom_api_key = str(raw_body.get('custom_api_key') or '').strip()

    payload = ChatRequest(
        question=question.strip(),
        conversation_id=raw_body.get('conversation_id'),
        model=selected_model or None,
        image=image_data,
        custom_api_key=custom_api_key or None,
    )

    user_id = user['user_id']
    profile = store.get_or_create_profile(user_id)
    conversation_id = payload.conversation_id or str(uuid.uuid4())

    is_gemini_selected = 'gemini' in selected_model or bool(image_data)

    if is_gemini_selected:
        # Check daily usage limit for Gemini
        usage = store.get_daily_usage(user_id, service='gemini', limit=settings.GEMINI_DAILY_LIMIT)
        if not custom_api_key and usage['used'] >= settings.GEMINI_DAILY_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Daily limit of {settings.GEMINI_DAILY_LIMIT} Gemini requests reached for today. Resets daily at 00:00 UTC. Switch to the default knowledge base model or provide your own API key in View Usage.",
            )

        # Retrieve grounding context from indexed medical library if available
        retrieved = []
        context_text = ""
        try:
            retrieved = rag_pipeline.retrieve(payload.question, n_results=3)
            if retrieved:
                context_text = rag_pipeline.format_context(retrieved)
        except Exception as exc:
            logger.debug("Medical library retrieval note: %s", exc)

        parsed_image = parse_image_payload(image_data) if image_data else None

        try:
            gemini_res = call_gemini_api(
                prompt=payload.question,
                image_payload=parsed_image,
                api_key=custom_api_key or None,
                context_text=context_text,
                user_profile=profile,
            )
        except GeminiConfigError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except GeminiQuotaError as exc:
            raise HTTPException(status_code=429, detail=str(exc)) from exc
        except GeminiError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            logger.error("Unexpected error in Gemini processing: %s", exc)
            raise HTTPException(status_code=500, detail="Failed to process request with Gemini.") from exc

        sources = [
            {
                'source': (doc.get('metadata') or {}).get('filename') or (doc.get('metadata') or {}).get('source') or 'Medical Library',
                'section': (doc.get('metadata') or {}).get('section') or (doc.get('metadata') or {}).get('title') or 'Reference',
                'snippet': (doc.get('text') or '')[:300],
                'category': (doc.get('metadata') or {}).get('category'),
                'reviewed': (doc.get('metadata') or {}).get('reviewed'),
                'references': (doc.get('metadata') or {}).get('references') or [],
            }
            for doc in retrieved
        ]

        updated_usage = usage
        if not custom_api_key:
            updated_usage = store.increment_daily_usage(user_id, service='gemini', limit=settings.GEMINI_DAILY_LIMIT)

        store.append_turn(
            user_id,
            conversation_id,
            payload.question,
            gemini_res['answer'],
            sources,
            image=image_data,
        )

        return {
            'conversation_id': conversation_id,
            'answer': gemini_res['answer'],
            'sources': sources,
            'safety_notice': 'This chatbot provides general educational health information and prescription transcription and is not a diagnosis or replacement for a clinician.',
            'model': 'Gemini 3.8 Flash',
            'usage': updated_usage,
        }

    # Original RAG Pipeline (Groq / Default model)
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
        'model': 'Default Knowledge Base (GPT-OSS)',
        'usage': store.get_daily_usage(user_id, service='gemini', limit=settings.GEMINI_DAILY_LIMIT),
    }
    store.append_turn(
        user_id,
        conversation_id,
        payload.question,
        result['answer'],
        result['sources'],
        image=image_data,
    )
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
