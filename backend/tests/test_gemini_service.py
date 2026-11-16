import unittest
from unittest.mock import MagicMock, patch

from backend.services.gemini_service import (
    GeminiConfigError,
    GeminiQuotaError,
    call_gemini_api,
    parse_image_payload,
)


class GeminiServiceTests(unittest.TestCase):
    def test_parse_image_payload_with_data_url(self):
        data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"
        result = parse_image_payload(data_url)
        self.assertIsNotNone(result)
        self.assertEqual(result['mime_type'], 'image/png')
        self.assertEqual(result['data'], 'iVBORw0KGgoAAAANSUhEUgAAAAUA')

    def test_parse_image_payload_with_raw_base64(self):
        result = parse_image_payload("aGVsbG8=")
        self.assertEqual(result['mime_type'], 'image/jpeg')
        self.assertEqual(result['data'], 'aGVsbG8=')

    def test_missing_api_key_raises_config_error(self):
        with patch('backend.services.gemini_service.settings.GEMINI_API_KEY', ''):
            with self.assertRaises(GeminiConfigError):
                call_gemini_api(prompt="What is aspirin?", api_key=None)

    @patch('httpx.Client')
    def test_call_gemini_api_success(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            'candidates': [
                {
                    'content': {
                        'parts': [{'text': '### Aspirin Information\nAspirin is an NSAID.'}]
                    }
                }
            ]
        }
        mock_client = MagicMock()
        mock_client.post.return_value = mock_resp
        mock_client_cls.return_value.__enter__.return_value = mock_client

        result = call_gemini_api(
            prompt="What is aspirin?",
            api_key="test-gemini-key",
        )
        self.assertIn("Aspirin Information", result['answer'])
        self.assertTrue(result['model'].startswith('gemini'))

    @patch('httpx.Client')
    def test_call_gemini_api_quota_error(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_client = MagicMock()
        mock_client.post.return_value = mock_resp
        mock_client_cls.return_value.__enter__.return_value = mock_client

        with self.assertRaises(GeminiQuotaError):
            call_gemini_api(
                prompt="What is aspirin?",
                api_key="test-gemini-key",
            )
