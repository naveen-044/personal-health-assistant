import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.auth.dependencies import get_optional_mongo_store
from backend.app import app


class RouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_root_endpoint(self) -> None:
        res = self.client.get('/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('status', res.json())

    def test_health_endpoints(self) -> None:
        res1 = self.client.get('/health')
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.json().get('status'), 'ok')

        res2 = self.client.get('/api/health')
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json().get('status'), 'ok')

    def test_database_health_reports_connected_store(self) -> None:
        class HealthyStore:
            def health_check(self) -> dict:
                return {
                    'database': 'personal_health_assistant',
                    'users_collection': True,
                    'users_email_unique_index': True,
                    'read_write': False,
                }

        with patch.dict(app.dependency_overrides, {get_optional_mongo_store: lambda: HealthyStore()}):
            response = self.client.get(
                '/api/health/database',
                headers={'Origin': 'http://localhost:5173'},
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['database_connected'])
        self.assertEqual(response.json()['database'], 'personal_health_assistant')
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:5173')
        self.assertEqual(response.headers['access-control-allow-credentials'], 'true')

    def test_database_health_reports_unavailable_store(self) -> None:
        with patch.dict(app.dependency_overrides, {get_optional_mongo_store: lambda: None}):
            response = self.client.get('/api/health/database')

        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()['detail']['database_connected'])

    def test_database_health_reports_live_store_failure(self) -> None:
        class UnhealthyStore:
            def health_check(self) -> dict:
                raise RuntimeError('database unavailable')

        with patch.dict(app.dependency_overrides, {get_optional_mongo_store: lambda: UnhealthyStore()}):
            response = self.client.get('/api/health/database')

        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()['detail']['database_connected'])

    def test_cors_does_not_allow_unconfigured_vercel_origins(self) -> None:
        response = self.client.options(
            '/api/auth/register',
            headers={
                'Origin': 'https://attacker.vercel.app',
                'Access-Control-Request-Method': 'POST',
            },
        )

        self.assertNotEqual(
            response.headers.get('access-control-allow-origin'),
            'https://attacker.vercel.app',
        )

    def test_api_info_endpoint(self) -> None:
        res = self.client.get('/api')
        self.assertEqual(res.status_code, 200)
        self.assertIn('endpoints', res.json())

    def test_chat_history_requires_authentication(self) -> None:
        res1 = self.client.get('/api/chat/history')
        self.assertEqual(res1.status_code, 401)

        res2 = self.client.get('/chat/history')
        self.assertEqual(res2.status_code, 401)

        res3 = self.client.get('/api/chat/usage')
        self.assertEqual(res3.status_code, 401)

        res4 = self.client.post('/api/chat/feedback', json={})
        self.assertEqual(res4.status_code, 401)

    def test_delete_history_requires_authentication(self) -> None:
        res = self.client.delete('/api/chat/history/non-existent-id')
        self.assertEqual(res.status_code, 401)

    def test_document_routes_require_authentication(self) -> None:
        res1 = self.client.get('/api/documents')
        self.assertEqual(res1.status_code, 401)

        res2 = self.client.get('/documents')
        self.assertEqual(res2.status_code, 401)

    def test_profile_routes_require_authentication(self) -> None:
        res1 = self.client.get('/api/profile')
        self.assertEqual(res1.status_code, 401)

        res2 = self.client.get('/profile')
        self.assertEqual(res2.status_code, 401)

    def test_client_supplied_user_id_does_not_authenticate(self) -> None:
        response = self.client.get('/api/chat/history', headers={'X-User-Id': 'somebody-else'})
        self.assertEqual(response.status_code, 401)
