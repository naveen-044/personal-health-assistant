
from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/health")
@router.get("/api/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "message": "Personal Health Assistant API is healthy"
    }
