from __future__ import annotations

import base64
import logging
from typing import Any
import httpx

from backend.config import settings

logger = logging.getLogger('uvicorn.error')

GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
DEFAULT_GEMINI_MODELS = [
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
    'gemini-3.5-flash',
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
You specialize in clinical healthcare support, medication verification, handwritten prescription decoding, multi-source medical literature retrieval, and voice/audio inquiry interpretation.

PRIMARY DIRECTIVES:
1. SENDED MEDIA ANALYSIS (Prescriptions & Medicines):
   - When a photo of a doctor's handwritten or printed prescription is sent:
     - Decode the prescription with clinical precision.
     - Present the transcribed prescription in a clean, dedicated snippet box:
       ```prescription
       Medication: [Drug Name, Formulation & Strength]
       Dosage: [Exact Amount, e.g., 500mg, 1 tablet]
       Frequency & Timing: [e.g., Twice daily after food (BID / PC)]
       Duration: [e.g., 5 days]
       Clinical Purpose: [e.g., Acute bacterial infection]
       Special Notes: [e.g., Complete full course]
       ```
     - Always provide a structured comparison table for all medications identified:
       | Medication | Strength & Form | Dosage & Timing | Clinical Purpose | Key Precautions |
     - Highlight any illegible or ambiguous handwriting with an explicit callout:
       > ⚠️ [Pharmacist Verification Required]: Ensure your pharmacist confirms [Item] prior to consumption.
   - When a photo of a pill, blister pack, or medicine bottle is sent:
     - State the active ingredient(s), manufacturer/brand names, therapeutic category.
     - Detail indications, adult administration guidelines, common side effects, and drug interactions.

2. MULTI-SOURCE SYNTHESIS & TEXT ANSWERS:
   - Synthesize evidence across clinical reference guidelines (MedlinePlus, CDC, WHO, PubMed, FDA).
   - Use clean Markdown tables to present comparisons, symptom checklists, or schedules.
   - Structure text clearly with clean headings, concise bullet points, and high readability.

3. SAFETY BOUNDARIES:
   - Provide educational medical information only; do not replace a licensed clinician or pharmacist.
   - Flag emergency red-flag symptoms immediately.
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


def call_gemini_api(
    prompt: str,
    image_payload: dict[str, str] | None = None,
    api_key: str | None = None,
    model_name: str | None = None,
    context_text: str | None = None,
    user_profile: dict[str, Any] | None = None,
    system_prompt_type: str = 'gemini',
) -> dict[str, Any]:
    """Execute Gemini generateContent API via HTTP."""
    key = (api_key or settings.GEMINI_API_KEY or '').strip()
    if not key:
        raise GeminiConfigError(
            'Gemini API key is not configured. Set GEMINI_API_KEY in the backend environment or enter your Google AI key in the View Usage menu.'
        )

    # Build prompt with optional user profile and RAG context
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
    payload = {
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

    models_to_try = [model_name] if model_name and model_name in DEFAULT_GEMINI_MODELS else DEFAULT_GEMINI_MODELS
    last_error: Exception | None = None

    for target_model in models_to_try:
        url = f"{GEMINI_BASE_URL}/{target_model}:generateContent?key={key}"
        # Use a quick 8s timeout on 3.8-flash during demand spikes to failover instantly
        timeout_val = 8.0 if target_model == 'gemini-3.8-flash' else 30.0
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

            # If 404 (model not found) or 503 (temporary high demand), try next fallback model
            if response.status_code in (404, 503):
                logger.warning("Gemini model %s returned %d, trying fallback...", target_model, response.status_code)
                continue

            last_error = GeminiError(f"Gemini API returned status {response.status_code}: {response.text[:200]}")
        except (GeminiConfigError, GeminiQuotaError):
            raise
        except httpx.TimeoutException as exc:
            last_error = exc
            logger.warning("Timeout connecting to Gemini model %s, trying fallback...", target_model)
            continue
        except Exception as exc:
            last_error = exc
            logger.warning("Error invoking Gemini model %s: %s", target_model, exc)

    if last_error:
        raise GeminiError(f"Gemini service error: {last_error}")

    raise GeminiError("Gemini service is currently unavailable. Please try again.")
