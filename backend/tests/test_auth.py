from __future__ import annotations

from datetime import datetime, timezone
import unittest
import uuid
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

from backend.auth.dependencies import get_mongo_store, get_optional_mongo_store
from backend.auth.security import verify_password
from backend.config import settings
from backend.database.store import InMemoryStore
from backend.routers import chat, documents
from backend.app import app


class FakeMongoStore:
    def __init__(self) -> None:
        self.users_by_email = {}
        self.users_by_id = {}
        self.sessions = {}

    def create_auth_user(self, user: dict) -> dict:
        if user['email'] in self.users_by_email:
            raise DuplicateKeyError('duplicate email')
        record = dict(user, _id=str(uuid.uuid4()))
        self.users_by_email[record['email']] = record
        self.users_by_id[record['_id']] = record
        return record

    def find_auth_user_by_email(self, email: str) -> dict | None:
        return self.users_by_email.get(email)

    def find_auth_user_by_id(self, user_id: str) -> dict | None:
        return self.users_by_id.get(user_id)

    def create_auth_session(
        self,
        user_id: str,
        token_hash: str,
        expires_at: datetime,
        remember_me: bool,
    ) -> str:
        session_id = str(uuid.uuid4())
        self.sessions[token_hash] = {
            '_id': session_id,
            'user_id': user_id,
            'expires_at': expires_at,
            'remember_me': remember_me,
        }
        return session_id

    def consume_auth_session(self, token_hash: str) -> dict | None:
        session = self.sessions.pop(token_hash, None)
        if session and session['expires_at'] > datetime.now(timezone.utc):
            return session
        return None

    def auth_session_exists(self, session_id: str, user_id: str) -> bool:
        return any(
            session['_id'] == session_id
            and session['user_id'] == user_id
            and session['expires_at'] > datetime.now(timezone.utc)
            for session in self.sessions.values()
        )

    def revoke_auth_session(self, token_hash: str) -> None:
        self.sessions.pop(token_hash, None)

    def update_auth_user_password(self, email: str, hashed_password: str) -> bool:
        user = self.users_by_email.get(email)
        if user:
            user['hashed_password'] = hashed_password
            return True
        return False


class AuthenticationRouteTests(unittest.TestCase):
    registration = {
        'full_name': '  Alex   Example ',
        'email': 'Alex.Example@example.com',
        'phone_number': '+1 (555) 010-1234',
        'password': 'HealthSecure9!',
        'confirm_password': 'HealthSecure9!',
        'accept_terms': True,
    }

    def setUp(self) -> None:
        self.database = FakeMongoStore()
        app.dependency_overrides[get_mongo_store] = lambda: self.database
        app.dependency_overrides[get_optional_mongo_store] = lambda: self.database
        self.secret_patch = patch.object(settings, 'JWT_SECRET_KEY', 'test-secret-with-more-than-32-random-bytes')
        self.secret_patch.start()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        app.dependency_overrides.clear()
        self.secret_patch.stop()

    def register_and_login(self, email: str = 'alex.example@example.com') -> tuple[str, str]:
        payload = {**self.registration, 'email': email}
        registered = self.client.post('/api/auth/register', json=payload)
        self.assertEqual(registered.status_code, 201)
        response = self.client.post('/api/auth/login', json={
            'email': email,
            'password': payload['password'],
            'remember_me': True,
        })
        self.assertEqual(response.status_code, 200)
        return response.json()['access_token'], response.json()['user']['id']

    def test_registration_hashes_password_and_does_not_return_it(self) -> None:
        response = self.client.post('/api/auth/register', json=self.registration)

        self.assertEqual(response.status_code, 201)
        user = self.database.find_auth_user_by_email('alex.example@example.com')
        self.assertEqual(user['full_name'], 'Alex Example')
        self.assertNotEqual(user['hashed_password'], self.registration['password'])
        self.assertTrue(verify_password(self.registration['password'], user['hashed_password']))
        self.assertTrue(user['is_active'])
        self.assertIsNotNone(user['created_at'])
        self.assertIsNotNone(user['updated_at'])
        self.assertNotIn('hashed_password', response.json())

    def test_registration_rejects_unconfigured_vercel_origin(self) -> None:
        response = self.client.post(
            '/api/auth/register',
            json=self.registration,
            headers={'Origin': 'https://attacker.vercel.app'},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.database.users_by_email, {})

    def test_duplicate_email_is_rejected_after_normalization(self) -> None:
        first = self.client.post('/api/auth/register', json=self.registration)
        duplicate = self.client.post('/api/auth/register', json={
            **self.registration,
            'email': 'ALEX.EXAMPLE@EXAMPLE.COM',
        })

        self.assertEqual(first.status_code, 201)
        self.assertEqual(duplicate.status_code, 409)

    def test_registration_validates_password_confirmation_and_terms(self) -> None:
        mismatch = self.client.post('/api/auth/register', json={
            **self.registration,
            'confirm_password': 'a-different-password',
        })
        terms = self.client.post('/api/auth/register', json={
            **self.registration,
            'accept_terms': False,
        })

        self.assertEqual(mismatch.status_code, 422)
        self.assertEqual(terms.status_code, 422)
        self.assertEqual(self.database.users_by_email, {})

    def test_login_validates_password_and_sets_http_only_refresh_cookie(self) -> None:
        self.client.post('/api/auth/register', json=self.registration)
        invalid = self.client.post('/api/auth/login', json={
            'email': self.registration['email'],
            'password': 'incorrect-password',
        })
        valid = self.client.post('/api/auth/login', json={
            'email': self.registration['email'],
            'password': self.registration['password'],
            'remember_me': True,
        })

        self.assertEqual(invalid.status_code, 401)
        self.assertEqual(valid.status_code, 200)
        self.assertEqual(valid.json()['token_type'], 'bearer')
        self.assertNotIn('hashed_password', valid.json()['user'])
        self.assertIn('httponly', valid.headers['set-cookie'].lower())
        self.assertIn('max-age=', valid.headers['set-cookie'].lower())

    def test_refresh_rotates_session_and_logout_revokes_access(self) -> None:
        access_token, _ = self.register_and_login()
        old_response = self.client.get('/api/auth/me', headers={'Authorization': f'Bearer {access_token}'})
        refreshed = self.client.post('/api/auth/refresh')
        new_token = refreshed.json()['access_token']
        new_response = self.client.get('/api/auth/me', headers={'Authorization': f'Bearer {new_token}'})
        old_after_rotation = self.client.get('/api/auth/me', headers={'Authorization': f'Bearer {access_token}'})
        logout = self.client.post('/api/auth/logout')
        new_after_logout = self.client.get('/api/auth/me', headers={'Authorization': f'Bearer {new_token}'})

        self.assertEqual(old_response.status_code, 200)
        self.assertEqual(refreshed.status_code, 200)
        self.assertEqual(new_response.status_code, 200)
        self.assertEqual(old_after_rotation.status_code, 401)
        self.assertEqual(logout.status_code, 204)
        self.assertEqual(new_after_logout.status_code, 401)

    def test_users_cannot_select_another_users_chat_or_documents(self) -> None:
        token_a, user_a = self.register_and_login()
        token_b, user_b = self.register_and_login('second@example.com')
        isolated_store = InMemoryStore()
        isolated_store.create_conversation(user_a, 'private-a', 'My private question', 'Private answer', [])
        isolated_store.create_conversation(user_b, 'private-b', 'Another private question', 'Other answer', [])
        isolated_store.add_document(user_a, 'doc-a', 'a-health.txt')
        isolated_store.add_document(user_b, 'doc-b', 'b-health.txt')

        with (
            patch.object(chat, 'store', isolated_store),
            patch.object(documents, 'store', isolated_store),
        ):
            history = self.client.get('/api/chat/history', headers={
                'Authorization': f'Bearer {token_a}',
                'X-User-Id': user_b,
            })
            library = self.client.get('/api/documents', headers={
                'Authorization': f'Bearer {token_a}',
                'X-User-Id': user_b,
            })
            other_document = self.client.delete(
                '/api/documents/doc-b',
                headers={'Authorization': f'Bearer {token_a}'},
            )

        self.assertEqual([item['conversation_id'] for item in history.json()['conversations']], ['private-a'])
        self.assertEqual([item['document_id'] for item in library.json()['documents']], ['doc-a'])
        self.assertEqual(other_document.status_code, 404)

    def test_untrusted_origin_cannot_create_auth_session_or_account(self) -> None:
        response = self.client.post(
            '/api/auth/register',
            json=self.registration,
            headers={'Origin': 'https://attacker.example'},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.database.users_by_email, {})

    def test_authentication_fails_closed_without_mongodb(self) -> None:
        with patch('backend.auth.dependencies.store', InMemoryStore()):
            with self.assertRaises(HTTPException) as error:
                get_mongo_store()

        self.assertEqual(error.exception.status_code, 503)

    def test_captcha_generation_and_password_reset_flow(self) -> None:
        from backend.services.captcha_service import _CAPTCHA_STORE

        # 1. Register a user
        reg_resp = self.client.post('/api/auth/register', json=self.registration)
        self.assertEqual(reg_resp.status_code, 201)

        # 2. Get CAPTCHA
        captcha_resp = self.client.get('/api/auth/captcha')
        self.assertEqual(captcha_resp.status_code, 200)
        data = captcha_resp.json()
        self.assertIn('captcha_id', data)
        self.assertIn('captcha_image', data)
        captcha_id = data['captcha_id']

        # Look up true code from internal store for test verification
        correct_code = _CAPTCHA_STORE[captcha_id]['code']

        # 3. Test wrong captcha fails
        wrong_verify = self.client.post(
            '/api/auth/forgot-password/verify',
            json={
                'email': 'alex.example@example.com',
                'captcha_id': captcha_id,
                'captcha_text': 'WRONG99',
            },
        )
        self.assertEqual(wrong_verify.status_code, 400)

        # Get fresh captcha since previous was consumed on failure
        fresh_captcha = self.client.get('/api/auth/captcha').json()
        correct_code = _CAPTCHA_STORE[fresh_captcha['captcha_id']]['code']

        # 4. Correct captcha and email verification
        verify_resp = self.client.post(
            '/api/auth/forgot-password/verify',
            json={
                'email': 'alex.example@example.com',
                'captcha_id': fresh_captcha['captcha_id'],
                'captcha_text': correct_code,
            },
        )
        self.assertEqual(verify_resp.status_code, 200)
        verify_data = verify_resp.json()
        self.assertTrue(verify_data['success'])
        reset_token = verify_data['reset_token']

        # 5. Reset password with new password
        new_pwd = 'BrandNewPassword2026!'
        reset_resp = self.client.post(
            '/api/auth/reset-password',
            json={
                'email': 'alex.example@example.com',
                'reset_token': reset_token,
                'new_password': new_pwd,
                'confirm_password': new_pwd,
            },
        )
        self.assertEqual(reset_resp.status_code, 200)

        # 6. Verify old password no longer works, and new password logs in successfully
        old_login = self.client.post(
            '/api/auth/login',
            json={'email': 'alex.example@example.com', 'password': 'HealthSecure9!'},
        )
        self.assertEqual(old_login.status_code, 401)

        new_login = self.client.post(
            '/api/auth/login',
            json={'email': 'alex.example@example.com', 'password': new_pwd},
        )
        self.assertEqual(new_login.status_code, 200)


if __name__ == '__main__':
    unittest.main()
