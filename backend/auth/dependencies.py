from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.auth.security import AuthenticationConfigurationError, decode_access_token, validate_auth_configuration
from backend.database.store import MongoStore, store


bearer_scheme = HTTPBearer(auto_error=False)


def get_optional_mongo_store() -> MongoStore | None:
    return store if isinstance(store, MongoStore) else None


def get_mongo_store() -> MongoStore:
    database = get_optional_mongo_store()
    if database is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='MongoDB is unavailable. Configure a reachable MongoDB Atlas connection.',
        )
    try:
        validate_auth_configuration()
    except AuthenticationConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return database


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    database: MongoStore | None = Depends(get_optional_mongo_store),
) -> dict:
    if credentials is None or credentials.scheme.lower() != 'bearer':
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Authentication required.',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    try:
        payload = decode_access_token(credentials.credentials)
    except AuthenticationConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={'WWW-Authenticate': 'Bearer'},
        ) from exc

    if database is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='MongoDB is unavailable. Configure a reachable MongoDB Atlas connection.',
        )
    user_id = payload['sub']
    if not database.auth_session_exists(payload['sid'], user_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Session expired or revoked.',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    user = database.find_auth_user_by_id(user_id)
    if not user or not user.get('is_active', True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Account is unavailable.',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    return {
        'user_id': str(user['_id']),
        'full_name': user['full_name'],
        'email': user['email'],
        'phone_number': user.get('phone_number') or '',
        'is_active': bool(user.get('is_active', True)),
    }
