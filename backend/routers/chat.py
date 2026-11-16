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
    async_call_gemini_api,
    call_gemini_api,
    parse_image_payload,
)
from backend.services.rag_pipeline import LLMProviderError, rag_pipeline

logger = logging.getLogger('uvicorn.error')
router = APIRouter()


def is_conversational_query(text: str) -> bool:
    """Identify short conversational pleasantries to bypass heavy embedding calculation."""
    clean = text.strip().lower().rstrip('!?.,:;')
    greetings = {
        'hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon',
        'good evening', 'howdy', 'hola', 'sup', 'yo', 'thanks', 'thank you',
        'bye', 'goodbye', 'who are you', 'what are you', 'help', 'ok', 'okay',
    }
    return clean in greetings or len(clean.split()) <= 1


@router.get('/api/chat/usage')
@router.get('/chat/usage')
def get_chat_usage(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    user_id = user['user_id']
    usage = store.get_daily_usage(user_id, service='gemini', limit=settings.GEMINI_DAILY_LIMIT)
    usage['server_gemini_configured'] = bool(settings.GEMINI_API_KEY)
    return usage


@router.post('/api/chat/feedback')
@router.post('/chat/feedback')
async def submit_feedback(request: Request, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    body = await request.body()
    data = {}
    if body:
        try:
            data = json.loads(body.decode('utf-8'))
        except Exception:
            try:
                data = json.loads(body)
            except Exception:
                data = {}

    conversation_id = str(data.get('conversation_id') or '')
    message_index = int(data.get('message_index', 0))
    rating = str(data.get('rating') or 'thumbs_down')
    feedback_text = str(data.get('feedback_text') or '').strip()

    user_id = user['user_id']
    record = store.save_feedback(
        user_id=user_id,
        conversation_id=conversation_id,
        message_index=message_index,
        rating=rating,
        feedback_text=feedback_text,
    )
    return {'status': 'success', 'message': 'Feedback recorded successfully.', 'feedback': record}


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

    is_pha_selected = 'pha' in selected_model
    is_gemini_or_pha = is_pha_selected or 'gemini' in selected_model or bool(image_data)

    if is_gemini_or_pha:
        # Check daily usage limit
        usage = store.get_daily_usage(user_id, service='gemini', limit=settings.GEMINI_DAILY_LIMIT)
        if not custom_api_key and usage['used'] >= settings.GEMINI_DAILY_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Daily limit of {settings.GEMINI_DAILY_LIMIT} generations reached for today. Resets daily at 00:00 UTC.",
            )

        # Retrieve grounding context from indexed medical library for substantive clinical questions
        retrieved = []
        context_text = ""
        if not is_conversational_query(payload.question) and not image_data:
            try:
                retrieved = rag_pipeline.search(payload.question, top_k=3, user_id=user_id)
                if retrieved:
                    context_text = "\n\n".join(
                        f"Source: {item.get('source') or item.get('filename')}\nSection: {item.get('section')}\nContent: {item.get('snippet')}"
                        for item in retrieved
                    )
            except Exception as exc:
                logger.debug("Medical library retrieval note: %s", exc)

        parsed_image = parse_image_payload(image_data) if image_data else None

        try:
            gemini_res = await async_call_gemini_api(
                prompt=payload.question,
                image_payload=parsed_image,
                api_key=custom_api_key or None,
                model_name=payload.model,
                context_text=context_text,
                user_profile=profile,
                system_prompt_type='pha' if is_pha_selected else 'gemini',
            )
        except GeminiConfigError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except GeminiQuotaError as exc:
            raise HTTPException(status_code=429, detail=str(exc)) from exc
        except GeminiError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            logger.error("Unexpected error in processing: %s", exc)
            raise HTTPException(status_code=500, detail="Failed to process request.") from exc

        sources = [
            {
                'source': doc.get('filename') or doc.get('source') or 'Medical Library',
                'section': doc.get('section') or 'Reference',
                'snippet': (doc.get('snippet') or '')[:300],
                'category': doc.get('category'),
                'reviewed': doc.get('reviewed'),
                'references': doc.get('references') or [],
            }
            for doc in retrieved
        ]

        updated_usage = usage
        if not custom_api_key:
            updated_usage = store.increment_daily_usage(user_id, service='gemini', limit=settings.GEMINI_DAILY_LIMIT)

        active_model_name = 'PHA 0.1.1' if is_pha_selected else 'Gemini 3.8 Flash'

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
            'model': active_model_name,
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
