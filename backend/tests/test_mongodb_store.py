from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.database.store import MongoStore


class MongoStoreTests(unittest.TestCase):
    def make_client(self):
        client = MagicMock()
        database = MagicMock()
        database.name = 'personal_health_assistant'
        collections = {
            name: MagicMock()
            for name in ('profiles', 'conversations', 'documents', 'users', 'auth_sessions', '_health_checks', 'daily_usage', 'chat_feedback')
        }
        database.__getitem__.side_effect = collections.__getitem__
        database.list_collection_names.return_value = ['users', 'auth_sessions']
        collections['users'].index_information.return_value = {
            'users_email_unique': {'key': [('email', 1)], 'unique': True},
        }
        collections['_health_checks'].find_one.side_effect = lambda query, projection: {'_id': query['_id']}
        client.__getitem__.return_value = database
        client.admin.command.return_value = {'ok': 1}
        return client, database, collections

    def test_uses_configured_database_and_existing_mongo_client(self) -> None:
        client, database, collections = self.make_client()
        with patch('pymongo.MongoClient', return_value=client) as mongo_client:
            store = MongoStore('mongodb+srv://test.invalid', 'personal_health_assistant')

        mongo_client.assert_called_once_with('mongodb+srv://test.invalid', serverSelectionTimeoutMS=5000)
        client.__getitem__.assert_called_once_with('personal_health_assistant')
        self.assertIs(store.db, database)
        collections['users'].create_index.assert_called_once_with(
            'email',
            unique=True,
            name='users_email_unique',
        )

    def test_health_check_verifies_unique_index_and_cleans_up_probe(self) -> None:
        client, _, collections = self.make_client()
        with patch('pymongo.MongoClient', return_value=client):
            store = MongoStore('mongodb+srv://test.invalid', 'personal_health_assistant')

        result = store.health_check(verify_write=True)

        self.assertEqual(result['database'], 'personal_health_assistant')
        self.assertTrue(result['users_collection'])
        self.assertTrue(result['users_email_unique_index'])
        self.assertTrue(result['read_write'])
        collections['_health_checks'].insert_one.assert_called_once()
        collections['_health_checks'].delete_one.assert_called_once()


if __name__ == '__main__':
    unittest.main()
