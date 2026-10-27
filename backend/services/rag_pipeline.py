from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
import re
from typing import Any

import chromadb
import httpx

from backend.config import settings
from backend.services.document_loader import extract_text, is_supported_file
from backend.services.embeddings import EmbeddingService
from backend.services.safety import build_safety_notice

logger = logging.getLogger('uvicorn.error')


class RAGPipeline:
    def __init__(self, data_dir: Path | str = settings.DATA_DIR, chroma_path: Path | str = settings.CHROMA_PATH) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.embedding_service = EmbeddingService()
        self.client = chromadb.PersistentClient(path=str(chroma_path))
        try:
            self.collection = self.client.get_or_create_collection(
                name='medical_knowledge_base',
                metadata={'hnsw:space': 'cosine'},
                embedding_function=self.embedding_service,
            )
        except Exception:
            self.collection = self.client.get_or_create_collection(
                name='medical_knowledge_base',
                metadata={'hnsw:space': 'cosine'}
            )

    def _ensure_collection(self) -> None:
        try:
            self.collection.count()
        except Exception:
            self.collection = self.client.get_or_create_collection(
                name='medical_knowledge_base',
                metadata={'hnsw:space': 'cosine'}
            )

    def _chunk_text(self, text: str, chunk_size: int = 700, overlap: int = 60) -> list[tuple[str, str]]:
        """
        Splits text into meaningful, section-aware chunks.
        Returns a list of tuples: (section_title, chunk_content)
        """
        # Split by markdown headers if available
        raw_sections = re.split(r'(?m)^(?=##?\s+)', text)
        clean_sections: list[tuple[str, str]] = []

        for sec in raw_sections:
            sec_str = sec.strip()
            if not sec_str:
                continue

            lines = sec_str.split('\n')
            title = 'General Guidelines'
            content = sec_str

            if lines and lines[0].startswith('#'):
                title = lines[0].lstrip('#').strip()
                content = '\n'.join(lines[1:]).strip()
                if not content:
                    # Heading only, keep title
                    continue

            # If section fits comfortably, keep as single chunk
            if len(content) <= chunk_size:
                clean_sections.append((title, f"### {title}\n{content}"))
            else:
                # Sub-chunk by paragraphs
                paragraphs = [p.strip() for p in content.split('\n\n') if p.strip()]
                curr = ''
                part = 1
                for p in paragraphs:
                    if len(curr) + len(p) < chunk_size:
                        curr = (curr + '\n\n' + p).strip()
                    else:
                        if curr:
                            clean_sections.append((f"{title} (Part {part})", f"### {title}\n{curr}"))
                            part += 1
                        curr = p
                if curr:
                    clean_sections.append((f"{title} (Part {part})", f"### {title}\n{curr}"))

        if not clean_sections:
            clean_sections.append(('Overview', text[:chunk_size]))

        return clean_sections

    def index_document(self, file_path: str | Path) -> dict:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f'Document not found: {path}')
        if not is_supported_file(path):
            raise ValueError('Only PDF and TXT files are supported.')

        text = extract_text(path)
        if not text.strip():
            raise ValueError('No readable text found in the uploaded document.')

        section_chunks = self._chunk_text(text)
        ids = []
        documents = []
        metadatas = []
        for index, (section_title, chunk_content) in enumerate(section_chunks):
            chunk_id = hashlib.sha256(f'{path.name}:{index}:{chunk_content}'.encode('utf-8')).hexdigest()
            ids.append(chunk_id)
            documents.append(chunk_content)
            metadatas.append({
                'source': path.name,
                'section': section_title,
                'stored_at': str(path.stat().st_mtime),
            })

        existing = self.collection.get(where={'source': path.name})
        if existing and existing.get('ids'):
            self.collection.delete(ids=existing['ids'])

        embeddings = self.embedding_service(documents)
        self.collection.add(documents=documents, ids=ids, metadatas=metadatas, embeddings=embeddings)
        return {
            'document': path.name,
            'chunks': len(section_chunks),
            'status': 'indexed'
        }

    def search(self, question: str, top_k: int = 3) -> list[dict]:
        self._ensure_collection()
        try:
            collection_snapshot = self.collection.peek()
            if not collection_snapshot.get('ids'):
                return []
        except Exception:
            return []

        # Vector semantic search
        vector_results = []
        try:
            query_embeddings = self.embedding_service(question)
            results = self.collection.query(query_embeddings=query_embeddings, n_results=top_k * 2, include=['documents', 'metadatas', 'distances'])
            docs = results.get('documents', [[]])[0]
            metas = results.get('metadatas', [[]])[0]
            dists = results.get('distances', [[]])[0]
            for idx, document in enumerate(docs):
                metadata = metas[idx] if idx < len(metas) else {}
                dist = dists[idx] if idx < len(dists) else 1.0
                vector_results.append({
                    'source': metadata.get('source', 'Unknown source'),
                    'section': metadata.get('section', 'Document section'),
                    'snippet': document,
                    'vector_score': 1.0 / (1.0 + max(0.0, dist)),
                })
        except Exception:
            pass

        # Hybrid lexical term scoring (BM25-style keyword boosting)
        q_tokens = [t.lower() for t in re.findall(r'\w+', question) if len(t) > 2]
        all_records = self.collection.get()
        all_docs = all_records.get('documents', [])
        all_metas = all_records.get('metadatas', [])

        candidate_map = {}
        for doc, meta in zip(all_docs, all_metas):
            sec_title = meta.get('section', '')
            key = f"{meta.get('source', '')}:{sec_title}"
            lexical_score = 0.0
            doc_lower = doc.lower()
            sec_lower = sec_title.lower()

            for token in q_tokens:
                if token in sec_lower:
                    lexical_score += 12.0
                token_count = doc_lower.count(token)
                if token_count > 0:
                    lexical_score += min(token_count * 2.0, 8.0)

            candidate_map[key] = {
                'source': meta.get('source', 'Medical Library'),
                'section': sec_title,
                'snippet': doc,
                'score': lexical_score,
            }

        # Merge vector scores
        for v in vector_results:
            key = f"{v['source']}:{v['section']}"
            if key in candidate_map:
                candidate_map[key]['score'] += v['vector_score'] * 3.0
            else:
                candidate_map[key] = {
                    'source': v['source'],
                    'section': v['section'],
                    'snippet': v['snippet'],
                    'score': v['vector_score'] * 3.0,
                }

        sorted_candidates = sorted(candidate_map.values(), key=lambda x: x['score'], reverse=True)
        # Return top matches that have positive relevance
        filtered = [c for c in sorted_candidates if c['score'] > 0][:top_k]
        return filtered or sorted_candidates[:top_k]

    def _call_llm(self, question: str, context: str, profile_context: str) -> str | None:
        """Attempts to call configured LLMs: Gemini, OpenAI, Groq, or Ollama."""
        # 1. Gemini
        gemini_key = os.getenv('GEMINI_API_KEY') or getattr(settings, 'GEMINI_API_KEY', '')
        if gemini_key:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
                prompt = (
                    "You are a compassionate, expert Personal Health Assistant. "
                    "Answer the user's question clearly, thoroughly, and informatively using the provided medical context and user profile.\n\n"
                    f"User Profile: {profile_context}\n\n"
                    f"Retrieved Medical Evidence:\n{context}\n\n"
                    f"User Question: {question}\n\n"
                    "Formatting requirements:\n"
                    "- Use clear markdown with bold headers and bullet points.\n"
                    "- Provide an Overview/Assessment, Actionable Home Care / Management Guidelines, and Red Flags / When to Seek Immediate Medical Evaluation.\n"
                    "- Tailor the response specifically to the question and incorporate user profile considerations if applicable.\n"
                    "- Conclude with a clear reminder that this is educational advice."
                )
                with httpx.Client(timeout=15.0) as client:
                    resp = client.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get('candidates', [])
                        if candidates:
                            text = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                            if text and text.strip():
                                return text.strip()
            except Exception as exc:
                logger.warning(f"Gemini API generation failed: {exc}")

        # 2. OpenAI
        openai_key = os.getenv('OPENAI_API_KEY') or getattr(settings, 'OPENAI_API_KEY', '')
        if openai_key:
            try:
                with httpx.Client(timeout=15.0) as client:
                    resp = client.post(
                        "https://api.openai.com/v1/chat/completions",
                        headers={"Authorization": f"Bearer {openai_key}"},
                        json={
                            "model": "gpt-4o-mini",
                            "messages": [
                                {
                                    "role": "system",
                                    "content": (
                                        "You are a compassionate, knowledgeable Personal Health Assistant. "
                                        "Answer the question thoroughly based on the retrieved medical documents and user profile. "
                                        "Use clear markdown with bullet points for recommendations and warning signs."
                                    )
                                },
                                {
                                    "role": "user",
                                    "content": f"Context:\n{context}\n\nProfile:\n{profile_context}\n\nQuestion: {question}"
                                }
                            ]
                        }
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        return data['choices'][0]['message']['content'].strip()
            except Exception as exc:
                logger.warning(f"OpenAI API generation failed: {exc}")

        # 3. Groq
        groq_key = os.getenv('GROQ_API_KEY') or getattr(settings, 'GROQ_API_KEY', '')
        if groq_key:
            try:
                with httpx.Client(timeout=15.0) as client:
                    resp = client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {groq_key}"},
                        json={
                            "model": "llama-3.3-70b-versatile",
                            "messages": [
                                {
                                    "role": "system",
                                    "content": (
                                        "You are an empathetic, expert Personal Health Assistant. "
                                        "Answer using the medical context. Use clear markdown headers and bullet points."
                                    )
                                },
                                {
                                    "role": "user",
                                    "content": f"Context:\n{context}\n\nProfile:\n{profile_context}\n\nQuestion: {question}"
                                }
                            ]
                        }
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        return data['choices'][0]['message']['content'].strip()
            except Exception as exc:
                logger.warning(f"Groq API generation failed: {exc}")

        # 4. Ollama
        ollama_url = getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434')
        llm_model = getattr(settings, 'LLM_MODEL', 'llama3.2')
        try:
            with httpx.Client(timeout=8.0) as client:
                resp = client.post(
                    f"{ollama_url}/api/generate",
                    json={
                        "model": llm_model,
                        "prompt": f"Context:\n{context}\n\nUser Profile:\n{profile_context}\n\nQuestion: {question}\n\nAnswer as a health assistant:",
                        "stream": False
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    ans = data.get('response', '').strip()
                    if ans:
                        return ans
        except Exception:
            pass

        return None

    def _synthesize_response(self, question: str, evidence: list[dict], user_profile: dict | None = None) -> str:
        """
        Dynamically extracts clinical facts, recommendations, and red flags from the evidence,
        formatting them into a natural, varied, professional health assistant response.
        """
        q_lower = question.strip().lower()

        # Conversational greetings
        greetings = {'hi', 'hello', 'hey', 'help', 'good morning', 'good afternoon', 'good evening', 'who are you', 'what can you do'}
        if q_lower in greetings or any(q_lower == g for g in greetings):
            return (
                "Hello! I am your **Personal Health Assistant**.\n\n"
                "I can provide evidence-based guidance based on your indexed medical documents and personal health profile, covering topics such as:\n"
                "- **Fever & Viral Infections**: Home care recommendations, temperatures, and warning signs.\n"
                "- **Cold vs. Influenza**: Symptom onset, prevention, and distinguishing differences.\n"
                "- **Hydration & Wellness**: Daily fluid requirements and dehydration management.\n"
                "- **Hypertension & Blood Pressure**: Target levels and lifestyle interventions.\n"
                "- **Diabetes & Glucose Control**: Dietary pillars, exercise, and hypoglycemia management.\n"
                "- **Sleep Hygiene & Recovery**: Guidelines for restorative rest.\n\n"
                "You can also upload your own medical documents (PDF or TXT) in the **Library** tab to expand my knowledge.\n\n"
                "How can I help you today?"
            )

        if not evidence:
            return (
                f"I could not find specific documentation in the indexed medical library regarding **\"{question}\"**.\n\n"
                "- **Expand Knowledge**: You can upload relevant medical reference files (PDF or TXT) in the **Library** tab.\n"
                "- **Medical Disclaimer**: For specific diagnoses, worsening symptoms, or medication changes, please consult a licensed healthcare provider."
            )

        definitions: list[str] = []
        recommendations: list[str] = []
        red_flags: list[str] = []

        for item in evidence:
            raw_text = item.get('snippet', '').strip()
            lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
            for line in lines:
                if line.startswith('#'):
                    continue

                # Check for emergency / warning / red flags
                if any(kw in line.lower() for kw in ['red flag', 'urgent', 'emergency', 'seek medical', 'severe', 'call 911']):
                    clean_line = re.sub(r'^(?:-\s*|\*\s*|Red flags requiring urgent medical evaluation:\s*)', '', line, flags=re.IGNORECASE).strip()
                    if clean_line and clean_line not in red_flags:
                        red_flags.append(clean_line)
                # Check for recommendations / treatment / prevention
                elif line.startswith('- ') or line.startswith('* ') or any(kw in line.lower() for kw in ['recommend', 'treat', 'prevent', 'manage', 'intake', 'lifestyle', 'tips:']):
                    clean_line = re.sub(r'^(?:-\s*|\*\s*)', '', line).strip()
                    if clean_line and clean_line not in recommendations:
                        recommendations.append(clean_line)
                else:
                    if len(line) > 25 and line not in definitions:
                        definitions.append(line)

        sections: list[str] = []

        # 1. Overview
        if definitions:
            overview_text = '\n\n'.join(definitions[:2])
            sections.append(f"### Overview & Clinical Context\n{overview_text}")

        # 2. Recommendations & Actionable Steps
        if recommendations:
            rec_list = '\n'.join(f"- {r}" for r in recommendations[:5])
            sections.append(f"### Recommended Actions & Home Care\n{rec_list}")

        # 3. Red Flags / Warnings
        if red_flags:
            flags_list = '\n'.join(f"- {rf}" for rf in red_flags[:4])
            sections.append(f"### Warning Signs (When to Seek Urgent Care)\n{flags_list}")

        # 4. Profile Considerations
        if user_profile:
            p_notes = []
            if user_profile.get('allergies'):
                p_notes.append(f"Allergies: {user_profile['allergies']}")
            if user_profile.get('conditions'):
                p_notes.append(f"Existing Conditions: {user_profile['conditions']}")
            if user_profile.get('medications'):
                p_notes.append(f"Medications: {user_profile['medications']}")
            if p_notes:
                sections.append(f"### Note for Your Profile\n**{ ' | '.join(p_notes) }**\nAlways discuss any medication adjustments or symptom changes with your healthcare provider.")

        # Educational disclaimer
        sections.append("*This guidance is educational and drawn from your indexed medical documents. It is not a clinical diagnosis.*")

        return '\n\n'.join(sections)

    def process_question(self, question: str, user_profile: dict | None = None, conversation_context: list | None = None) -> dict:
        q_strip = question.strip()
        evidence = self.search(q_strip, top_k=3)

        profile_context = 'No user profile provided.'
        if user_profile:
            profile_context = (
                f"Name: {user_profile.get('name', 'N/A')}, "
                f"Age Range: {user_profile.get('age_range', 'N/A')}, "
                f"Allergies: {user_profile.get('allergies', 'None listed')}, "
                f"Conditions: {user_profile.get('conditions', 'None listed')}, "
                f"Medications: {user_profile.get('medications', 'None listed')}."
            )

        context = '\n\n'.join(f"[{item['source']} - {item['section']}]:\n{item['snippet']}" for item in evidence)

        # 1. Try LLM first if available
        llm_answer = self._call_llm(q_strip, context, profile_context)
        if llm_answer:
            answer = llm_answer
        else:
            # 2. Dynamic, structured clinical synthesis
            answer = self._synthesize_response(q_strip, evidence, user_profile)

        return {
            'answer': answer,
            'sources': [
                {'source': item['source'], 'section': item['section'], 'snippet': item['snippet'][:200]}
                for item in evidence
            ],
            'safety_notice': build_safety_notice(q_strip),
            'profile_context': profile_context,
        }


rag_pipeline = RAGPipeline()
