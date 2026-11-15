
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import PyMongoError

from backend.auth.dependencies import get_optional_mongo_store
from backend.database.store import MongoStore

router = APIRouter(tags=["Health"])
logger = logging.getLogger(__name__)


@router.get("/health")
@router.get("/api/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "message": "Personal Health Assistant API is healthy"
    }


@router.get("/api/health/database")
def database_health(database: MongoStore | None = Depends(get_optional_mongo_store)) -> dict:
    if database is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "unavailable",
                "database_connected": False,
                "message": "MongoDB is unavailable. Configure a reachable MongoDB Atlas connection.",
            },
        )

    try:
        result = database.health_check()
    except (PyMongoError, RuntimeError) as exc:
        logger.warning("MongoDB health check failed (%s).", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "unavailable",
                "database_connected": False,
                "message": "MongoDB is unavailable. Configure a reachable MongoDB Atlas connection.",
            },
        ) from exc

    return {
        "status": "ok",
        "database_connected": True,
        "database": result["database"],
        "users_collection": result["users_collection"],
        "users_email_unique_index": result["users_email_unique_index"],
    }
