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
    _jwt_secret,
)
from backend.config import settings
from backend.database.store import MongoStore
from backend.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    VerifyCaptchaResetRequest,
    ResetPasswordRequest,
)
from backend.services.captcha_service import (
    generate_captcha,
    verify_captcha,
    mark_reset_token_consumed,
    is_reset_token_consumed,
)
import jwt
import secrets

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


@router.get('/captcha')
def get_captcha() -> dict:
    """Generate a visual challenge CAPTCHA with noise distortion for bot prevention."""
    return generate_captcha()


@router.post('/forgot-password/verify')
def verify_forgot_password_captcha(
    payload: VerifyCaptchaResetRequest,
    request: Request,
    database: MongoStore = Depends(get_mongo_store),
) -> dict:
    """Verify email and captcha challenge before allowing password reset."""
    _validate_request_origin(request)

    if not verify_captcha(payload.captcha_id, payload.captcha_text):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Incorrect CAPTCHA code. Please check the characters and try again.',
        )

    user = database.find_auth_user_by_email(str(payload.email))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='No account registered with this email address.',
        )

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=15)
    reset_token = jwt.encode(
        {
            'sub': str(payload.email),
            'type': 'password_reset',
            'jti': secrets.token_urlsafe(16),
            'iat': now,
            'exp': expires_at,
        },
        _jwt_secret(),
        algorithm='HS256',
    )

    return {
        'success': True,
        'reset_token': reset_token,
        'message': 'Verification successful. Please enter your new password.',
    }


@router.post('/reset-password')
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    database: MongoStore = Depends(get_mongo_store),
) -> dict:
    """Reset account password using verified reset token."""
    _validate_request_origin(request)

    if is_reset_token_consumed(payload.reset_token):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='This password reset request has already been used. Please request a new one.',
        )

    try:
        token_data = jwt.decode(payload.reset_token, _jwt_secret(), algorithms=['HS256'])
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Password reset session has expired or is invalid. Please try again.',
        ) from exc

    if token_data.get('type') != 'password_reset' or token_data.get('sub') != str(payload.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Password reset token does not match this email address.',
        )

    mark_reset_token_consumed(payload.reset_token)

    hashed = hash_password(payload.new_password)
    updated = database.update_auth_user_password(str(payload.email), hashed)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='User account not found.',
        )

    return {
        'success': True,
        'message': 'Password has been reset successfully! You can now sign in with your new password.',
    }
