from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pymongo.errors import DuplicateKeyError

from backend.auth.dependencies import get_current_user, get_mongo_store, get_optional_mongo_store
from backend.auth.security import (
    AuthenticationConfigurationError,
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    public_user,
    validate_auth_configuration,
    verify_password,
)
from backend.config import settings
from backend.database.store import MongoStore
from backend.schemas.auth import LoginRequest, RegisterRequest

router = APIRouter(prefix='/api/auth', tags=['Authentication'])


def _validate_request_origin(request: Request) -> None:
    origin = request.headers.get('origin')
    if not origin:
        return
    if origin not in settings.FRONTEND_ORIGINS:
        raise HTTPException(status_code=403, detail='Request origin is not allowed.')


def _set_refresh_cookie(response: Response, token: str, remember_me: bool) -> None:
    expires_in = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        max_age=expires_in if remember_me else None,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path='/api/auth',
        domain=settings.AUTH_COOKIE_DOMAIN,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path='/api/auth',
        domain=settings.AUTH_COOKIE_DOMAIN,
    )


def _issue_session(
    user: dict,
    remember_me: bool,
    database: MongoStore,
    response: Response,
) -> dict:
    if settings.ACCESS_TOKEN_EXPIRE_MINUTES < 1 or settings.REFRESH_TOKEN_EXPIRE_DAYS < 1:
        raise HTTPException(status_code=503, detail='Authentication token lifetimes are not configured correctly.')
    refresh_token = new_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    session_id = database.create_auth_session(
        str(user['_id']),
        hash_refresh_token(refresh_token),
        expires_at,
        remember_me,
    )
    try:
        access_token = create_access_token(str(user['_id']), session_id)
    except AuthenticationConfigurationError as exc:
        database.revoke_auth_session(hash_refresh_token(refresh_token))
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    _set_refresh_cookie(response, refresh_token, remember_me)
    return {
        'access_token': access_token,
        'token_type': 'bearer',
        'user': public_user(user),
    }


@router.post('/register', status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    database: MongoStore = Depends(get_mongo_store),
) -> dict:
    _validate_request_origin(request)
    now = datetime.now(timezone.utc)
    user = {
        'full_name': payload.full_name,
        'email': str(payload.email),
        'phone_number': payload.phone_number,
        'hashed_password': hash_password(payload.password),
        'created_at': now,
        'updated_at': now,
        'is_active': True,
    }
    try:
        database.create_auth_user(user)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail='An account with this email already exists.') from exc
    return {'message': 'Account created successfully. Please sign in.'}


@router.post('/login')
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    database: MongoStore = Depends(get_mongo_store),
) -> dict:
    _validate_request_origin(request)
    user = database.find_auth_user_by_email(str(payload.email))
    if (
        not user
        or not user.get('is_active', True)
        or not verify_password(payload.password, user.get('hashed_password', ''))
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Incorrect email or password.',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    return _issue_session(user, payload.remember_me, database, response)


@router.get('/me')
def me(user: dict = Depends(get_current_user)) -> dict:
    return {'user': {
        'id': user['user_id'],
        'full_name': user['full_name'],
        'email': user['email'],
        'phone_number': user['phone_number'],
        'is_active': user['is_active'],
    }}


@router.post('/refresh')
def refresh_session(
    request: Request,
    response: Response,
    database: MongoStore | None = Depends(get_optional_mongo_store),
) -> dict:
    _validate_request_origin(request)
    refresh_token = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if not refresh_token:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail='Refresh session is missing.')
    if database is None:
        raise HTTPException(
            status_code=503,
            detail='MongoDB is unavailable. Configure a reachable MongoDB Atlas connection.',
        )
    try:
        validate_auth_configuration()
    except AuthenticationConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    session = database.consume_auth_session(hash_refresh_token(refresh_token))
    if not session:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail='Refresh session is expired or revoked.')
    user = database.find_auth_user_by_id(session['user_id'])
    if not user or not user.get('is_active', True):
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail='Account is unavailable.')
    return _issue_session(user, bool(session.get('remember_me')), database, response)


@router.post('/logout', status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    database: MongoStore | None = Depends(get_optional_mongo_store),
) -> Response:
    _validate_request_origin(request)
    refresh_token = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if refresh_token:
        if database is None:
            raise HTTPException(
                status_code=503,
                detail='MongoDB is unavailable. The server session could not be revoked.',
            )
        database.revoke_auth_session(hash_refresh_token(refresh_token))
    _clear_refresh_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
