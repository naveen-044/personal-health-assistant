import unittest
from fastapi.testclient import TestClient

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

    def test_api_info_endpoint(self) -> None:
        res = self.client.get('/api')
        self.assertEqual(res.status_code, 200)
        self.assertIn('endpoints', res.json())

    def test_chat_history_routes(self) -> None:
        res1 = self.client.get('/api/chat/history')
        self.assertEqual(res1.status_code, 200)
        self.assertIn('conversations', res1.json())

        res2 = self.client.get('/chat/history')
        self.assertEqual(res2.status_code, 200)
        self.assertIn('conversations', res2.json())

    def test_delete_history_idempotent(self) -> None:
        res = self.client.delete('/api/chat/history/non-existent-id')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get('status'), 'deleted')

    def test_document_routes(self) -> None:
        res1 = self.client.get('/api/documents')
        self.assertEqual(res1.status_code, 200)
        self.assertIn('documents', res1.json())

        res2 = self.client.get('/documents')
        self.assertEqual(res2.status_code, 200)
        self.assertIn('documents', res2.json())

    def test_profile_routes(self) -> None:
        res1 = self.client.get('/api/profile')
        self.assertEqual(res1.status_code, 200)

        res2 = self.client.get('/profile')
        self.assertEqual(res2.status_code, 200)

        res_put = self.client.put('/api/profile', json={'name': 'Jane Doe'})
        self.assertEqual(res_put.status_code, 200)
        self.assertEqual(res_put.json().get('name'), 'Jane Doe')

        res_post = self.client.post('/api/profile', json={'name': 'Jane Post'})
        self.assertEqual(res_post.status_code, 200)
        self.assertEqual(res_post.json().get('name'), 'Jane Post')
