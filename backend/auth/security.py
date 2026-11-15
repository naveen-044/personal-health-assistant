from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets

import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError

from backend.config import settings


class AuthenticationConfigurationError(RuntimeError):
    pass


def _jwt_secret() -> str:
    secret = settings.JWT_SECRET_KEY
    if len(secret.encode('utf-8')) < 32 or secret == 'replace-with-at-least-32-random-bytes':
        raise AuthenticationConfigurationError(
            'Set JWT_SECRET_KEY to a random secret of at least 32 bytes.'
        )
    return secret


def validate_auth_configuration() -> None:
    _jwt_secret()
    if settings.ACCESS_TOKEN_EXPIRE_MINUTES < 1 or settings.REFRESH_TOKEN_EXPIRE_DAYS < 1:
        raise AuthenticationConfigurationError('Authentication token lifetimes must be positive.')
    if settings.AUTH_COOKIE_SAMESITE not in {'lax', 'strict', 'none'}:
        raise AuthenticationConfigurationError('AUTH_COOKIE_SAMESITE must be lax, strict, or none.')
    if settings.AUTH_COOKIE_SAMESITE == 'none' and not settings.AUTH_COOKIE_SECURE:
        raise AuthenticationConfigurationError('AUTH_COOKIE_SECURE must be true when SameSite is none.')


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('ascii')


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('ascii'))
    except (ValueError, TypeError, UnicodeEncodeError):
        return False


def create_access_token(user_id: str, session_id: str) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({
        'sub': user_id,
        'sid': session_id,
        'type': 'access',
        'iat': now,
        'exp': expires_at,
    }, _jwt_secret(), algorithm='HS256')


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=['HS256'])
    except AuthenticationConfigurationError:
        raise
    except InvalidTokenError as exc:
        raise ValueError('Invalid or expired access token.') from exc
    if payload.get('type') != 'access' or not payload.get('sub') or not payload.get('sid'):
        raise ValueError('Invalid access token.')
    return payload


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def public_user(user: dict) -> dict[str, str | bool]:
    return {
        'id': str(user['_id']),
        'full_name': user['full_name'],
        'email': user['email'],
        'phone_number': user.get('phone_number') or '',
        'is_active': bool(user.get('is_active', True)),
    }
