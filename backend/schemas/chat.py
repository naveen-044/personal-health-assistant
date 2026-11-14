from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    conversation_id: str | None = None


class ChatMessage(BaseModel):
    role: Literal['user', 'assistant']
    content: str
    created_at: str


class SourceEntry(BaseModel):
    source: str
    section: str
    snippet: str
    category: str | None = None
    reviewed: str | None = None
    references: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    conversation_id: str
    answer: str
    sources: list[SourceEntry]
    safety_notice: str
