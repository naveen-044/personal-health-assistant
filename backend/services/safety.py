from __future__ import annotations

import re

EMERGENCY_PATTERNS = [
    'chest pain', 'trouble breathing', 'fainting', 'severe bleeding',
    'suicidal', 'suicide', 'stroke', 'memory loss', 'anaphylaxis',
    'severe allergic reaction', 'seizure', 'unconscious', 'shortness of breath'
]


def detect_emergency_signals(text: str) -> bool:
    cleaned = re.sub(r'[^a-z0-9\s]', ' ', text.lower())
    return any(pattern in cleaned for pattern in EMERGENCY_PATTERNS)


def build_safety_notice(question: str) -> str:
    if detect_emergency_signals(question):
        return (
            'This could be an emergency. Contact local emergency services or seek urgent professional care immediately; '
            'do not delay emergency care while waiting for more information.'
        )
    return (
        'This chatbot provides general educational health information and is not a diagnosis or a replacement for a clinician. '
        'If symptoms are severe, persistent, or changing, seek prompt professional evaluation.'
    )
