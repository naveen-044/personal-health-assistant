from __future__ import annotations

import base64
import logging
from typing import Any
import httpx

from backend.config import settings

logger = logging.getLogger('uvicorn.error')

GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
DEFAULT_GEMINI_MODELS = [
    'gemini-3-flash-preview',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest',
]

SYSTEM_PROMPT = """You are a highly capable Clinical and Pharmaceutical AI Assistant integrated into the Personal Health Assistant platform.

Your primary duties:
1. MEDICINE ANALYSIS: Identify active ingredients, clinical indications, administration instructions, side effects, precautions, and warnings.
2. PRESCRIPTION TRANSCRIPTION: Transcribe handwritten or printed doctor prescriptions with extreme care into formatted snippet boxes and tables.
3. FORMATTING: Use clean markdown headings, bullet points, clean tables, and code snippet boxes (```prescription or ```dosage).
4. SAFETY: Always emphasize educational nature and remind users to verify prescriptions with licensed clinicians or pharmacists.
"""

PHA_SYSTEM_PROMPT = """You are PHA 0.1.1 (Personal Health Assistant Clinical & Diagnostic Intelligence System).
You are an advanced, high-speed clinical intelligence engine fine-tuned for healthcare support, patients, and clinical workflows.
You specialize in clinical pharmacology, prescription transcription and verification, differential symptom assessment, lab report interpretation, multi-source biomedical literature synthesis, and voice/audio inquiry resolution.

CORE CLINICAL DIRECTIVES:

1. SENDED MEDIA ANALYSIS (Doctor Prescriptions & Pharmaceutical Images):
   - When a photo of a doctor's handwritten or printed prescription is provided:
     - Decode with clinical precision: resolve medical Latin shorthand (Rx, BID, TID, QID, PRN, PO, PC, AC, STAT, q4h, qhs).
     - Present the transcribed prescription in a clean clinical snippet box:
       ```prescription
       Medication: [Generic & Brand Name, Formulation & Strength]
       Dosage: [Exact Quantity, e.g., 500 mg tablet]
       Frequency & Administration: [e.g., Twice daily after meals (BID / PC)]
       Duration: [e.g., 7 days]
       Indication / Purpose: [e.g., Suspected acute bacterial bronchitis]
       Safety & Instructions: [e.g., Finish full course; drink plenty of water]
       ```
     - Always generate a complete Medication Comparison & Administration Table:
       | Medication | Active Ingredient & Strength | Dosage & Timing | Clinical Purpose | Key Side Effects & Precautions |
     - Explicitly flag any ambiguous or illegible handwriting:
       > ⚠️ **[Pharmacist Verification Required]**: The dosage/name for "[item]" requires verbal confirmation from the dispensing pharmacist before consumption.
   - When a photo of a pill, blister strip, box, or syrup bottle is provided:
     - Detail the active chemical entity, therapeutic class, standard dosing guidelines, known contraindications, food-drug interactions, and missed-dose protocol.

2. MULTI-SOURCE CLINICAL EVIDENCE SYNTHESIS:
   - Base all clinical guidance on established international references (CDC, WHO, NIH MedlinePlus, PubMed, FDA Orange Book).
   - When answering questions about symptoms, disease differentiation, or drug comparisons:
     - Always provide structured Markdown tables for rapid clinical comparison (e.g., Cold vs. Flu vs. COVID-19, or Ibuprofen vs. Acetaminophen).
     - Detail onset timing, characteristic symptom presentation, red-flag triggers, and home supportive care.
     - Cite verified health references with clean markdown links where applicable.

3. VOICE & AUDIO INQUIRIES:
   - When processing transcribed voice messages or audio questions, immediately address the user's primary symptom or medication concern with empathy, clarity, and rapid bulleted insights.

4. CLINICAL SAFETY & TRIAGE:
   - Provide educational clinical support; do not replace an in-person physical examination by a licensed medical provider.
   - For severe red-flag presentations (e.g., sudden chest pressure radiating to arm/jaw, acute respiratory distress, severe allergic anaphylaxis, thunderclap headache, acute unilateral weakness):
     - Prioritize an urgent emergency alert recommending immediate emergency medical attention (911 / 112 / local emergency care).
"""


class GeminiError(Exception):
    """Base error for Gemini service."""
    pass


class GeminiQuotaError(GeminiError):
    """Raised when Gemini quota is exceeded."""
    pass


class GeminiConfigError(GeminiError):
    """Raised when Gemini API key is missing or invalid."""
    pass


def parse_image_payload(image_str: str) -> dict[str, str] | None:
    """Parse a base64 image data string into mime_type and clean base64 data."""
    if not image_str or not isinstance(image_str, str):
        return None

    cleaned = image_str.strip()
    if cleaned.startswith('data:'):
        try:
            header, b64_part = cleaned.split(',', 1)
            mime_type = header.split(';')[0].replace('data:', '').strip()
            return {'mime_type': mime_type or 'image/jpeg', 'data': b64_part.strip()}
        except Exception:
            return None

    # Raw base64 string
    return {'mime_type': 'image/jpeg', 'data': cleaned}


def resolve_models_to_try(model_name: str | None = None) -> list[str]:
    """Return an ordered list of models to try, placing high-speed active models first."""
    if not model_name or model_name in ('gemini-3.8-flash', 'pha-0.1.1', 'gemini', 'pha'):
        # 3.8-flash currently encounters frequent 503 capacity spikes; gemini-3-flash-preview
        # is the ultra-fast active endpoint with ~1.2s response latency.
        return ['gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash']

    cleaned = model_name.strip()
    if cleaned in DEFAULT_GEMINI_MODELS:
        return [cleaned] + [m for m in DEFAULT_GEMINI_MODELS if m != cleaned]

    return DEFAULT_GEMINI_MODELS


def _build_payload(
    prompt: str,
    image_payload: dict[str, str] | None = None,
    context_text: str | None = None,
    user_profile: dict[str, Any] | None = None,
    system_prompt_type: str = 'gemini',
) -> dict[str, Any]:
    full_prompt_parts = []
    if user_profile:
        conditions = user_profile.get('conditions', '').strip()
        allergies = user_profile.get('allergies', '').strip()
        medications = user_profile.get('medications', '').strip()
        profile_notes = []
        if conditions:
            profile_notes.append(f"- Known conditions: {conditions}")
        if allergies:
            profile_notes.append(f"- Allergies: {allergies}")
        if medications:
            profile_notes.append(f"- Current medications: {medications}")
        if profile_notes:
            full_prompt_parts.append("Patient Background Context:\n" + "\n".join(profile_notes) + "\n")

    if context_text:
        full_prompt_parts.append(
            f"Indexed Medical Library Grounding Material:\n{context_text}\n"
        )

    full_prompt_parts.append(f"User Query:\n{prompt}")
    combined_user_text = "\n\n".join(full_prompt_parts)

    parts: list[dict[str, Any]] = [{'text': combined_user_text}]
    if image_payload and image_payload.get('data'):
        parts.append({
            'inline_data': {
                'mime_type': image_payload.get('mime_type', 'image/jpeg'),
                'data': image_payload['data'],
            }
        })

    active_prompt = PHA_SYSTEM_PROMPT if system_prompt_type == 'pha' else SYSTEM_PROMPT
    return {
        'system_instruction': {
            'parts': [{'text': active_prompt}]
        },
        'contents': [
            {
                'role': 'user',
                'parts': parts,
            }
        ],
        'generationConfig': {
            'temperature': 0.2,
            'maxOutputTokens': 2500,
        },
    }


async def async_call_gemini_api(
    prompt: str,
    image_payload: dict[str, str] | None = None,
    api_key: str | None = None,
    model_name: str | None = None,
    context_text: str | None = None,
    user_profile: dict[str, Any] | None = None,
    system_prompt_type: str = 'gemini',
) -> dict[str, Any]:
    """Execute Gemini generateContent API asynchronously with fast failover."""
    key = (api_key or settings.GEMINI_API_KEY or '').strip()
    if not key:
        raise GeminiConfigError(
            'Gemini API key is not configured. Set GEMINI_API_KEY in the backend environment or enter your Google AI key in the View Usage menu.'
        )

    payload = _build_payload(
        prompt=prompt,
        image_payload=image_payload,
        context_text=context_text,
        user_profile=user_profile,
        system_prompt_type=system_prompt_type,
    )

    models_to_try = resolve_models_to_try(model_name)
    last_error: Exception | None = None

    for target_model in models_to_try:
        url = f"{GEMINI_BASE_URL}/{target_model}:generateContent?key={key}"
        # Keep timeout tight (5.0s) so any unavailable/stalled model fails over rapidly
        timeout_val = 5.0
        try:
            async with httpx.AsyncClient(timeout=timeout_val) as client:
                response = await client.post(
                    url,
                    headers={'Content-Type': 'application/json'},
                    json=payload,
                )

            if response.status_code == 200:
                data = response.json()
                candidates = data.get('candidates', [])
                if not candidates:
                    return {
                        'answer': 'I could not generate an answer for this query. Please verify the prompt and try again.',
                        'model': target_model,
                    }

                parts = candidates[0].get('content', {}).get('parts', [])
                answer_text = ''.join(part.get('text', '') for part in parts).strip()
                if not answer_text:
                    answer_text = 'No descriptive response was generated by the model.'

                return {
                    'answer': answer_text,
                    'model': target_model,
                }

            if response.status_code in (401, 403):
                raise GeminiConfigError('Invalid Gemini API key or unauthorized access. Please check your API key.')

            if response.status_code == 429:
                raise GeminiQuotaError('Gemini API rate limit or quota exceeded. Please wait a moment or try again later.')

            # If 404 (model not found) or 503 (temporary high demand), try next fallback model immediately
            if response.status_code in (404, 503):
                logger.warning("Gemini model %s returned %d, rapidly switching to fallback...", target_model, response.status_code)
                continue

            last_error = GeminiError(f"Gemini API returned status {response.status_code}: {response.text[:200]}")
        except (GeminiConfigError, GeminiQuotaError):
            raise
        except httpx.TimeoutException as exc:
            last_error = exc
            logger.warning("Timeout connecting to Gemini model %s, rapidly switching to fallback...", target_model)
            continue
        except Exception as exc:
            last_error = exc
            logger.warning("Error invoking Gemini model %s: %s", target_model, exc)

    if last_error:
        raise GeminiError(f"Gemini service error: {last_error}")

    raise GeminiError("Gemini service is currently unavailable. Please try again.")


def call_gemini_api(
    prompt: str,
    image_payload: dict[str, str] | None = None,
    api_key: str | None = None,
    model_name: str | None = None,
    context_text: str | None = None,
    user_profile: dict[str, Any] | None = None,
    system_prompt_type: str = 'gemini',
) -> dict[str, Any]:
    """Execute Gemini generateContent API synchronously (for tests & backward compatibility)."""
    key = (api_key or settings.GEMINI_API_KEY or '').strip()
    if not key:
        raise GeminiConfigError(
            'Gemini API key is not configured. Set GEMINI_API_KEY in the backend environment or enter your Google AI key in the View Usage menu.'
        )

    payload = _build_payload(
        prompt=prompt,
        image_payload=image_payload,
        context_text=context_text,
        user_profile=user_profile,
        system_prompt_type=system_prompt_type,
    )

    models_to_try = resolve_models_to_try(model_name)
    last_error: Exception | None = None

    for target_model in models_to_try:
        url = f"{GEMINI_BASE_URL}/{target_model}:generateContent?key={key}"
        timeout_val = 5.0
        try:
            with httpx.Client(timeout=timeout_val) as client:
                response = client.post(
                    url,
                    headers={'Content-Type': 'application/json'},
                    json=payload,
                )

            if response.status_code == 200:
                data = response.json()
                candidates = data.get('candidates', [])
                if not candidates:
                    return {
                        'answer': 'I could not generate an answer for this query. Please verify the prompt and try again.',
                        'model': target_model,
                    }

                parts = candidates[0].get('content', {}).get('parts', [])
                answer_text = ''.join(part.get('text', '') for part in parts).strip()
                if not answer_text:
                    answer_text = 'No descriptive response was generated by the model.'

                return {
                    'answer': answer_text,
                    'model': target_model,
                }

            if response.status_code in (401, 403):
                raise GeminiConfigError('Invalid Gemini API key or unauthorized access. Please check your API key.')

            if response.status_code == 429:
                raise GeminiQuotaError('Gemini API rate limit or quota exceeded. Please wait a moment or try again later.')

            if response.status_code in (404, 503):
                logger.warning("Gemini model %s returned %d, rapidly switching to fallback...", target_model, response.status_code)
                continue

            last_error = GeminiError(f"Gemini API returned status {response.status_code}: {response.text[:200]}")
        except (GeminiConfigError, GeminiQuotaError):
            raise
        except httpx.TimeoutException as exc:
            last_error = exc
            logger.warning("Timeout connecting to Gemini model %s, rapidly switching to fallback...", target_model)
            continue
        except Exception as exc:
            last_error = exc
            logger.warning("Error invoking Gemini model %s: %s", target_model, exc)

    if last_error:
        raise GeminiError(f"Gemini service error: {last_error}")

    raise GeminiError("Gemini service is currently unavailable. Please try again.")
