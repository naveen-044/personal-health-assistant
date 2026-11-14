
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

from backend.config import settings
from backend.routers.chat import router as chat_router
from backend.routers.documents import router as documents_router
from backend.routers.health import router as health_router
from backend.routers.profile import router as profile_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.services.rag_pipeline import rag_pipeline
    try:
        if rag_pipeline.collection.count() == 0:
            print("[Startup] ChromaDB collection is empty. Auto-ingesting medical documents...")
            from scripts.ingest_documents import ingest_default_documents
            count = ingest_default_documents()
            print(f"[Startup] Ingestion complete. Added {count} chunks. Total: {rag_pipeline.collection.count()}")
    except Exception as exc:
        print(f"[Startup] Auto-ingestion note: {exc}")
    yield


app = FastAPI(
    title="Personal Health Assistant",
    version="1.0.0",
    description="Educational health assistant using RAG.",
    lifespan=lifespan,
)


# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.FRONTEND_ORIGINS,
    allow_origin_regex=r"^https?://([a-zA-Z0-9-]+\.)*vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Root Endpoint
@app.get("/")
def root():
    return {
        "message": "Personal Health Assistant API",
        "status": "running"
    }


# API Information
@app.get("/api")
def api_info():
    return {
        "name": "Personal Health Assistant API",
        "status": "running",
        "endpoints": [
            "/",
            "/health",
            "/api/health",
            "/api",
            "/docs",
            "/redoc",
            "/openapi.json",
            "/debug/routes",
            "/api/chat",
            "/api/chat/history",
            "/api/documents",
            "/api/profile"
        ]
    }


# Register API Routers
app.include_router(health_router)
app.include_router(chat_router)
app.include_router(documents_router)
app.include_router(profile_router)





# Debug Registered Routes
@app.get("/debug/routes")
def debug_routes(request: Request):
    routes = []

    for route in request.app.routes:
        if isinstance(route, APIRoute):
            routes.append({
                "path": route.path,
                "methods": sorted(route.methods or []),
                "name": route.name
            })

    return {
        "status": "ok",
        "total_routes": len(routes),
        "routes": routes
    }
