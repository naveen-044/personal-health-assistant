# Personal Health Assistance Chatbot Using RAG

This project is a medical-information assistant built with React + Vite on the frontend and FastAPI on the backend. It indexes trusted medical documents and answers general health questions with evidence from the library while enforcing safety guidance.

## Features

- Natural-language health assistant UI
- Retrieval-augmented generation with ChromaDB and SentenceTransformers
- Source-grounded answers and citation-like references
- Document upload for PDF and TXT files
- Optional user profile for personalized context
- In-memory user-scoped conversation history and authorization checks
- Safety guidance and emergency escalation recommendations

## Project structure

- `frontend/` — React single-page app
- `backend/` — FastAPI API and retrieval services
- `data/medical_documents/` — uploaded medical sources
- `scripts/ingest_documents.py` — batch document indexing

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Then start the API:

```bash
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

### 3. Document index

Place trusted public health PDFs or TXT files into `data/medical_documents/` and run:

```bash
python scripts/ingest_documents.py
```

Uploaded files are checked for health-reference content before indexing. Resume/CV files and
other content that does not look like a health reference are rejected. Indexed chunks store
their document ID, filename, owner, section, and PDF page number when available. Retrieval
filters out legacy personal documents and requires the configured cosine-distance relevance
limit (`RAG_MAX_COSINE_DISTANCE`, default `0.96`).

Use the Library page's delete action to remove an individual uploaded document. It removes
only that document's indexed chunks, stored file, and metadata record. Re-index approved
health files with `python scripts/ingest_documents.py`; do not delete the whole `.chroma`
directory to clean up one stale document. Legacy entries that are no longer listed in the
Library should be reviewed and removed individually rather than purging the index.

## Notes

- This is educational and not a substitute for professional healthcare advice.
- If relevant documents are not found, the API clearly says so instead of fabricating evidence.
- For serious symptoms, immediately seek emergency care or consult a licensed clinician.

## Environment variables

Copy `.env.example` to `.env` and customize values before running the app.
