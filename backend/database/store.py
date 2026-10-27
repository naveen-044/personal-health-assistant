from __future__ import annotations

from copy import deepcopy
import logging
from threading import Lock
from typing import Any

logger = logging.getLogger('uvicorn.error')


class InMemoryStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.users = {}
        self.conversations = {}
        self.documents = {}

    def get_or_create_profile(self, user_id: str) -> dict[str, Any]:
        with self._lock:
            profile = self.users.setdefault(user_id, {
                'user_id': user_id,
                'name': '',
                'age_range': '',
                'allergies': '',
                'conditions': '',
                'medications': '',
                'preferences': '',
            })
            return deepcopy(profile)

    def update_profile(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            profile = self.users.setdefault(user_id, {
                'user_id': user_id,
                'name': '',
                'age_range': '',
                'allergies': '',
                'conditions': '',
                'medications': '',
                'preferences': '',
            })
            for key, value in updates.items():
                if key in profile:
                    profile[key] = value
            self.users[user_id] = profile
            return deepcopy(profile)

    def get_conversations(self, user_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return deepcopy(self.conversations.get(user_id, []))

    def create_conversation(self, user_id: str, conversation_id: str, question: str, answer: str, sources: list[dict[str, Any]]) -> dict[str, Any]:
        with self._lock:
            thread = self.conversations.setdefault(user_id, [])
            entry = {
                'conversation_id': conversation_id,
                'messages': [
                    {'role': 'user', 'content': question, 'created_at': 'just now'},
                    {'role': 'assistant', 'content': answer, 'created_at': 'just now'}
                ],
                'title': question[:48] or 'New conversation',
                'updated_at': 'just now',
                'sources': sources,
            }
            thread.append(entry)
            return deepcopy(entry)

    def append_turn(self, user_id: str, conversation_id: str, question: str, answer: str, sources: list[dict[str, Any]]) -> dict[str, Any]:
        with self._lock:
            thread = self.conversations.setdefault(user_id, [])
            match = None
            for item in thread:
                if item['conversation_id'] == conversation_id:
                    match = item
                    break
            if match is None:
                return self.create_conversation(user_id, conversation_id, question, answer, sources)
            match['messages'].append({'role': 'user', 'content': question, 'created_at': 'just now'})
            match['messages'].append({'role': 'assistant', 'content': answer, 'created_at': 'just now'})
            match['updated_at'] = 'just now'
            match['title'] = match['title'] or question[:48]
            match['sources'] = sources
            return deepcopy(match)

    def delete_conversation(self, user_id: str, conversation_id: str) -> bool:
        with self._lock:
            conversations = self.conversations.get(user_id, [])
            remaining = [item for item in conversations if item['conversation_id'] != conversation_id]
            if len(remaining) == len(conversations):
                return False
            self.conversations[user_id] = remaining
            return True

    def list_documents(self, user_id: str) -> list[dict[str, Any]]:
        with self._lock:
            user_docs = self.documents.get(user_id, [])
            return deepcopy(user_docs)

    def add_document(self, user_id: str, document_id: str, filename: str, status: str = 'indexed') -> dict[str, Any]:
        with self._lock:
            docs = self.documents.setdefault(user_id, [])
            item = {'document_id': document_id, 'filename': filename, 'status': status}
            if not any(existing['document_id'] == document_id for existing in docs):
                docs.append(item)
            return deepcopy(item)

    def remove_document(self, user_id: str, document_id: str) -> bool:
        with self._lock:
            docs = self.documents.get(user_id, [])
            updated = [item for item in docs if item['document_id'] != document_id]
            if len(updated) == len(docs):
                return False
            self.documents[user_id] = updated
            return True


class MongoStore:
    def __init__(self, uri: str, db_name: str = 'health_assistant') -> None:
        import pymongo
        self.client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=5000)
        self.client.admin.command('ping')
        try:
            default_db = self.client.get_default_database()
            self.db = default_db if default_db is not None else self.client[db_name]
        except Exception:
            self.db = self.client[db_name]

        self.profiles = self.db['profiles']
        self.conversations = self.db['conversations']
        self.documents = self.db['documents']

    def get_or_create_profile(self, user_id: str) -> dict[str, Any]:
        profile = self.profiles.find_one({'user_id': user_id}, {'_id': False})
        if not profile:
            profile = {
                'user_id': user_id,
                'name': '',
                'age_range': '',
                'allergies': '',
                'conditions': '',
                'medications': '',
                'preferences': '',
            }
            self.profiles.insert_one(deepcopy(profile))
            profile.pop('_id', None)
        return profile

    def update_profile(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        self.get_or_create_profile(user_id)
        clean_updates = {k: v for k, v in updates.items() if k != '_id'}
        if clean_updates:
            self.profiles.update_one({'user_id': user_id}, {'$set': clean_updates})
        return self.get_or_create_profile(user_id)

    def get_conversations(self, user_id: str) -> list[dict[str, Any]]:
        cursor = self.conversations.find({'user_id': user_id}, {'_id': False, 'user_id': False})
        return list(cursor)

    def create_conversation(self, user_id: str, conversation_id: str, question: str, answer: str, sources: list[dict[str, Any]]) -> dict[str, Any]:
        entry = {
            'user_id': user_id,
            'conversation_id': conversation_id,
            'messages': [
                {'role': 'user', 'content': question, 'created_at': 'just now'},
                {'role': 'assistant', 'content': answer, 'created_at': 'just now'}
            ],
            'title': question[:48] or 'New conversation',
            'updated_at': 'just now',
            'sources': sources,
        }
        self.conversations.insert_one(deepcopy(entry))
        result = deepcopy(entry)
        result.pop('_id', None)
        result.pop('user_id', None)
        return result

    def append_turn(self, user_id: str, conversation_id: str, question: str, answer: str, sources: list[dict[str, Any]]) -> dict[str, Any]:
        existing = self.conversations.find_one({'user_id': user_id, 'conversation_id': conversation_id})
        if not existing:
            return self.create_conversation(user_id, conversation_id, question, answer, sources)

        new_messages = [
            {'role': 'user', 'content': question, 'created_at': 'just now'},
            {'role': 'assistant', 'content': answer, 'created_at': 'just now'}
        ]
        title = existing.get('title') or question[:48]
        self.conversations.update_one(
            {'user_id': user_id, 'conversation_id': conversation_id},
            {
                '$push': {'messages': {'$each': new_messages}},
                '$set': {
                    'updated_at': 'just now',
                    'title': title,
                    'sources': sources,
                }
            }
        )
        updated = self.conversations.find_one({'user_id': user_id, 'conversation_id': conversation_id}, {'_id': False, 'user_id': False})
        return updated or {}

    def delete_conversation(self, user_id: str, conversation_id: str) -> bool:
        result = self.conversations.delete_one({'user_id': user_id, 'conversation_id': conversation_id})
        return result.deleted_count > 0

    def list_documents(self, user_id: str) -> list[dict[str, Any]]:
        cursor = self.documents.find({'user_id': user_id}, {'_id': False, 'user_id': False})
        return list(cursor)

    def add_document(self, user_id: str, document_id: str, filename: str, status: str = 'indexed') -> dict[str, Any]:
        item = {'user_id': user_id, 'document_id': document_id, 'filename': filename, 'status': status}
        self.documents.update_one(
            {'user_id': user_id, 'document_id': document_id},
            {'$set': item},
            upsert=True
        )
        result = deepcopy(item)
        result.pop('user_id', None)
        return result

    def remove_document(self, user_id: str, document_id: str) -> bool:
        result = self.documents.delete_one({'user_id': user_id, 'document_id': document_id})
        return result.deleted_count > 0


def create_store() -> InMemoryStore | MongoStore:
    from backend.config import settings
    if settings.MONGODB_URI:
        try:
            mongo = MongoStore(settings.MONGODB_URI)
            host_info = settings.MONGODB_URI.split('@')[-1] if '@' in settings.MONGODB_URI else 'MongoDB'
            print(f"[Database] Connected to MongoDB: {host_info}")
            return mongo
        except Exception as exc:
            print(f"[Database] MongoDB connection failed ({exc}). Falling back to InMemoryStore.")
    return InMemoryStore()


store = create_store()
