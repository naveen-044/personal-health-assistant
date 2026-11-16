from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    conversation_id: str | None = None
    model: str | None = None
    image: str | None = None
    custom_api_key: str | None = None


class ChatMessage(BaseModel):
    role: Literal['user', 'assistant']
    content: str
    created_at: str
    image: str | None = None


class SourceEntry(BaseModel):
    source: str
    section: str
    snippet: str
    category: str | None = None
    reviewed: str | None = None
    references: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    conversation_id: str
    chat_code: str | None = None
    answer: str
    sources: list[SourceEntry] = Field(default_factory=list)
    safety_notice: str = ''
    model: str | None = None
    usage: dict[str, Any] | None = None
