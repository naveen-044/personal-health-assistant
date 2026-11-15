# Personal Health Assistance Chatbot Using RAG

This project is a medical-information assistant built with React + Vite on the frontend and FastAPI on the backend. It indexes trusted medical documents and answers general health questions with evidence from the library while enforcing safety guidance.

## Features

- Natural-language health assistant UI
- MongoDB-backed accounts with password hashing, short-lived JWT access tokens, and rotating HttpOnly refresh sessions
- Retrieval-augmented generation with ChromaDB and SentenceTransformers
- Source-grounded answers and citation-like references
- Document upload for PDF and TXT files
- Optional user profile for personalized context
- User-scoped conversation history and document authorization
- Safety guidance and emergency escalation recommendations

## Project structure

- `frontend/` — React single-page app
- `backend/` — FastAPI API and retrieval services
- `data/medical_documents/` — uploaded medical sources
- `scripts/ingest_documents.py` — batch document indexing

## Setup

### 1. Configure MongoDB Atlas and authentication

Authentication requires a reachable MongoDB Atlas cluster. From the project root, copy `.env.example` to `.env` and set:

- `MONGODB_URI` to your Atlas connection string. Never commit the real URI.
- `DATABASE_NAME` to the database to use (defaults to `personal_health_assistant`).
- `JWT_SECRET_KEY` to a generated random value of at least 32 bytes. For example:
  `python -c "import secrets; print(secrets.token_urlsafe(48))"`

The backend uses the configured database and creates a `users` collection with a unique email index, plus an `auth_sessions` collection for hashed, expiring refresh sessions. It does not store accounts in the in-memory fallback. If Atlas is unavailable, authentication endpoints return `503` rather than accepting or storing accounts locally. Make sure your Atlas Network Access rules and database user permit the backend to connect.

For local development, the refresh cookie uses `AUTH_COOKIE_SAMESITE=lax` and `AUTH_COOKIE_SECURE=false`. For HTTPS deployment on separate frontend/backend hostnames, set `AUTH_COOKIE_SECURE=true` and `AUTH_COOKIE_SAMESITE=none`; when possible, use frontend and API hostnames under the same custom domain and set an appropriate cookie domain.

After replacing the placeholders in `.env`, verify Atlas access and the `users` collection/index with:

```bash
python scripts/check_mongodb.py
```

The check uses the application's existing MongoDB client, performs a read, writes and reads a uniquely named temporary record in `_health_checks`, then deletes it. It reports the selected database and never prints the connection string.

### 2. Backend

From the repository root, create and activate a virtual environment:

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1  # Windows PowerShell
pip install -r backend\requirements.txt
```

Copy `.env.example` to `.env`, then set `GROQ_API_KEY` and any deployment-specific values.
Groq is the only generative AI provider; `LLM_MODEL` selects the Groq-served model.
The embedding model is fixed to `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions); set
`ALLOW_EMBEDDING_DOWNLOAD=true` to download it when it is not already cached.

Start the API from the repository root:

```bash
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

The frontend Axios client defaults to `http://127.0.0.1:8001`. To override it, copy
`frontend/.env.example` to `frontend/.env`, set `VITE_API_BASE_URL`, and restart Vite.
Sign-up and sign-in use `/api/auth/register` and `/api/auth/login`. Access tokens remain in
memory; a short-lived access token is renewed after a page refresh using the HttpOnly refresh
cookie. Chat, profile, history, and document endpoints require that access token.

### 4. Document index

Place trusted public health PDFs or TXT files into `data/medical_documents/` and run:

```bash
cd ..
.\.venv\Scripts\python.exe .\scripts\ingest_documents.py
```

Uploaded files are checked for health-reference content before indexing. Resume/CV files and
other content that does not look like a health reference are rejected. Indexed chunks store
their document ID, filename, owner, category, review date, reference URLs, content hash, section,
and PDF page number when available. Retrieval
filters out legacy personal documents and uses a cosine-distance relevance limit of `0.78`.

Chunk size, overlap, and retrieval count use sensible defaults of 700 characters, 100 characters,
and 4 chunks. Ingestion updates changed document chunks in place, skips unchanged files, and
keeps the existing ChromaDB collection. It does not re-index UUID-prefixed files managed as
user uploads, so their ownership metadata is preserved. The command does not delete the
collection. It writes dataset counts, category totals, embedding dimensions, and indexing status
to `data/dataset_statistics.txt`.

The included TXT references are concise educational summaries with source links to CDC, NIDDK,
and MedlinePlus. Source URLs that could not be verified are marked for review in the relevant
document. These references are not comprehensive clinical guidelines. Answers without relevant
indexed evidence state that limitation instead of filling gaps with model knowledge.

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

Copy `.env.example` to `.env` and customize the backend values before running the API. Copy
`frontend/.env.example` to `frontend/.env` only when overriding the frontend API URL. For
production, configure the same variables in the hosting provider's secret/environment settings;
do not upload either `.env` file.
