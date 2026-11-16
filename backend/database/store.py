from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import logging
from threading import Lock
from typing import Any
import uuid

logger = logging.getLogger('uvicorn.error')


class InMemoryStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.users = {}
        self.conversations = {}
        self.documents = {}
        self.daily_usage = {}
        self.feedback = []

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
            now_str = datetime.now(timezone.utc).strftime('%d-%m-%Y %I:%M %p')
            entry = {
                'conversation_id': conversation_id,
                'messages': [
                    {'role': 'user', 'content': question, 'created_at': now_str},
                    {'role': 'assistant', 'content': answer, 'created_at': now_str}
                ],
                'title': question[:48] or 'New conversation',
                'updated_at': now_str,
                'sources': sources,
            }
            thread.append(entry)
            return deepcopy(entry)

    def append_turn(self, user_id: str, conversation_id: str, question: str, answer: str, sources: list[dict[str, Any]], image: str | None = None) -> dict[str, Any]:
        with self._lock:
            thread = self.conversations.setdefault(user_id, [])
            match = None
            for item in thread:
                if item['conversation_id'] == conversation_id:
                    match = item
                    break
            now_str = datetime.now(timezone.utc).strftime('%d-%m-%Y %I:%M %p')
            user_msg = {'role': 'user', 'content': question, 'created_at': now_str}
            if image:
                user_msg['image'] = image
            if match is None:
                match = {
                    'conversation_id': conversation_id,
                    'messages': [
                        user_msg,
                        {'role': 'assistant', 'content': answer, 'created_at': now_str}
                    ],
                    'title': question[:48] or 'New conversation',
                    'updated_at': now_str,
                    'sources': sources,
                }
                thread.append(match)
                return deepcopy(match)
            match['messages'].append(user_msg)
            match['messages'].append({'role': 'assistant', 'content': answer, 'created_at': now_str})
            match['updated_at'] = now_str
            match['title'] = match['title'] or question[:48]
            match['sources'] = sources
            return deepcopy(match)

    def get_daily_usage(self, user_id: str, service: str = 'gemini', limit: int = 20) -> dict[str, Any]:
        today = datetime.now(timezone.utc).strftime('%d-%m-%Y')
        with self._lock:
            count = self.daily_usage.get((user_id, service, today), 0)
        return {
            'service': service,
            'used': count,
            'limit': limit,
            'remaining': max(0, limit - count),
            'date': today,
        }

    def increment_daily_usage(self, user_id: str, service: str = 'gemini', limit: int = 20) -> dict[str, Any]:
        today = datetime.now(timezone.utc).strftime('%d-%m-%Y')
        with self._lock:
            key = (user_id, service, today)
            self.daily_usage[key] = self.daily_usage.get(key, 0) + 1
            count = self.daily_usage[key]
        return {
            'service': service,
            'used': count,
            'limit': limit,
            'remaining': max(0, limit - count),
            'date': today,
        }

    def save_feedback(
        self,
        user_id: str,
        conversation_id: str,
        message_index: int,
        rating: str,
        feedback_text: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            record = {
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'conversation_id': conversation_id,
                'message_index': message_index,
                'rating': rating,
                'feedback_text': feedback_text or '',
                'created_at': datetime.now(timezone.utc).strftime('%d-%m-%Y %I:%M %p'),
            }
            self.feedback.append(record)
            return deepcopy(record)

    def get_conversation(self, user_id: str, conversation_id: str) -> dict[str, Any] | None:
        with self._lock:
            for item in self.conversations.get(user_id, []):
                if item['conversation_id'] == conversation_id:
                    return deepcopy(item)
            return None

    def get_public_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        with self._lock:
            for user_convs in self.conversations.values():
                for item in user_convs:
                    if item['conversation_id'] == conversation_id:
                        return deepcopy(item)
            return None

    def update_conversation_title(self, user_id: str, conversation_id: str, title: str) -> bool:
        with self._lock:
            conversations = self.conversations.get(user_id, [])
            for item in conversations:
                if item['conversation_id'] == conversation_id:
                    item['title'] = (title or '').strip() or 'Untitled Chat'
                    return True
            return False

    def delete_conversation(self, user_id: str, conversation_id: str) -> bool:
        with self._lock:
            conversations = self.conversations.get(user_id, [])
            remaining = [item for item in conversations if item['conversation_id'] != conversation_id]
            if len(remaining) == len(conversations):
                return False
            self.conversations[user_id] = remaining
            return True

    def clear_conversations(self, user_id: str) -> bool:
        with self._lock:
            if user_id in self.conversations:
                self.conversations[user_id] = []
                return True
            return False

    def list_documents(self, user_id: str) -> list[dict[str, Any]]:
        with self._lock:
            user_docs = self.documents.get(user_id, [])
            return deepcopy(user_docs)

    def get_document(self, user_id: str, document_id: str) -> dict[str, Any] | None:
        with self._lock:
            for item in self.documents.get(user_id, []):
                if item['document_id'] == document_id:
                    return deepcopy(item)
        return None

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

    def close(self) -> None:
        pass


class MongoStore:
    def __init__(self, uri: str, db_name: str = 'personal_health_assistant') -> None:
        import pymongo
        self.client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=5000)
        self.client.admin.command('ping')
        self.db = self.client[db_name]
        self.database_name = self.db.name

        self.profiles = self.db['profiles']
        self.conversations = self.db['conversations']
        self.documents = self.db['documents']
        self.auth_users = self.db['users']
        self.auth_sessions = self.db['auth_sessions']
        try:
            self.daily_usage = self.db['daily_usage']
            self.daily_usage.create_index([('user_id', 1), ('service', 1), ('date', 1)], unique=True, name='daily_usage_user_service_date')
        except Exception:
            self.daily_usage = None
        try:
            self.feedback = self.db['chat_feedback']
        except Exception:
            self.feedback = None
        self.auth_users.create_index('email', unique=True, name='users_email_unique')
        self.auth_sessions.create_index('token_hash', unique=True, name='auth_sessions_token_hash_unique')
        self.auth_sessions.create_index('expires_at', expireAfterSeconds=0, name='auth_sessions_expiry')
        self.auth_sessions.create_index('user_id', name='auth_sessions_user_id')

    def health_check(self, verify_write: bool = False) -> dict[str, Any]:
        self.client.admin.command('ping')
        collections = self.db.list_collection_names()
        if 'users' not in collections:
            raise RuntimeError('The users collection is unavailable.')

        indexes = self.auth_users.index_information()
        if not any(
            index.get('key') == [('email', 1)] and index.get('unique') is True
            for index in indexes.values()
        ):
            raise RuntimeError('The users email unique index is unavailable.')

        self.auth_users.find_one({}, {'_id': True})
        if verify_write:
            checks = self.db['_health_checks']
            probe_id = f'mongodb-health-{uuid.uuid4()}'
            try:
                checks.insert_one({'_id': probe_id, 'created_at': datetime.now(timezone.utc)})
                if checks.find_one({'_id': probe_id}, {'_id': True}) is None:
                    raise RuntimeError('MongoDB health-check read did not return the written probe.')
            finally:
                checks.delete_one({'_id': probe_id})

        return {
            'database': self.database_name,
            'users_collection': True,
            'users_email_unique_index': True,
            'read_write': verify_write,
        }

    def create_auth_user(self, user: dict[str, Any]) -> dict[str, Any]:
        record = deepcopy(user)
        result = self.auth_users.insert_one(record)
        record['_id'] = result.inserted_id
        return record

    def find_auth_user_by_email(self, email: str) -> dict[str, Any] | None:
        return self.auth_users.find_one({'email': email})

    def find_auth_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        from bson import ObjectId
        from bson.errors import InvalidId

        try:
            object_id = ObjectId(user_id)
        except (InvalidId, TypeError):
            return None
        return self.auth_users.find_one({'_id': object_id})

    def create_auth_session(
        self,
        user_id: str,
        token_hash: str,
        expires_at: datetime,
        remember_me: bool,
    ) -> str:
        result = self.auth_sessions.insert_one({
            'user_id': user_id,
            'token_hash': token_hash,
            'expires_at': expires_at,
            'remember_me': remember_me,
            'created_at': datetime.now(timezone.utc),
        })
        return str(result.inserted_id)

    def consume_auth_session(self, token_hash: str) -> dict[str, Any] | None:
        from pymongo import ReturnDocument

        return self.auth_sessions.find_one_and_delete({
            'token_hash': token_hash,
            'expires_at': {'$gt': datetime.now(timezone.utc)},
        }, return_document=ReturnDocument.BEFORE)

    def auth_session_exists(self, session_id: str, user_id: str) -> bool:
        from bson import ObjectId
        from bson.errors import InvalidId

        try:
            object_id = ObjectId(session_id)
        except (InvalidId, TypeError):
            return False
        return self.auth_sessions.find_one({
            '_id': object_id,
            'user_id': user_id,
            'expires_at': {'$gt': datetime.now(timezone.utc)},
        }, {'_id': True}) is not None

    def revoke_auth_session(self, token_hash: str) -> None:
        self.auth_sessions.delete_one({'token_hash': token_hash})

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
        now_str = datetime.now(timezone.utc).strftime('%d-%m-%Y %I:%M %p')
        entry = {
            'user_id': user_id,
            'conversation_id': conversation_id,
            'messages': [
                {'role': 'user', 'content': question, 'created_at': now_str},
                {'role': 'assistant', 'content': answer, 'created_at': now_str}
            ],
            'title': question[:48] or 'New conversation',
            'updated_at': now_str,
            'sources': sources,
        }
        self.conversations.insert_one(deepcopy(entry))
        result = deepcopy(entry)
        result.pop('_id', None)
        result.pop('user_id', None)
        return result

    def append_turn(self, user_id: str, conversation_id: str, question: str, answer: str, sources: list[dict[str, Any]], image: str | None = None) -> dict[str, Any]:
        existing = self.conversations.find_one({'user_id': user_id, 'conversation_id': conversation_id})
        now_str = datetime.now(timezone.utc).strftime('%d-%m-%Y %I:%M %p')
        user_msg = {'role': 'user', 'content': question, 'created_at': now_str}
        if image:
            user_msg['image'] = image
        if not existing:
            entry = {
                'user_id': user_id,
                'conversation_id': conversation_id,
                'messages': [
                    user_msg,
                    {'role': 'assistant', 'content': answer, 'created_at': now_str}
                ],
                'title': question[:48] or 'New conversation',
                'updated_at': now_str,
                'sources': sources,
            }
            self.conversations.insert_one(deepcopy(entry))
            result = deepcopy(entry)
            result.pop('_id', None)
            result.pop('user_id', None)
            return result

        new_messages = [
            user_msg,
            {'role': 'assistant', 'content': answer, 'created_at': now_str}
        ]
        title = existing.get('title') or question[:48]
        self.conversations.update_one(
            {'user_id': user_id, 'conversation_id': conversation_id},
            {
                '$push': {'messages': {'$each': new_messages}},
                '$set': {
                    'updated_at': now_str,
                    'title': title,
                    'sources': sources,
                }
            }
        )
        updated = self.conversations.find_one({'user_id': user_id, 'conversation_id': conversation_id}, {'_id': False, 'user_id': False})
        return updated or {}

    def get_daily_usage(self, user_id: str, service: str = 'gemini', limit: int = 20) -> dict[str, Any]:
        today = datetime.now(timezone.utc).strftime('%d-%m-%Y')
        try:
            record = self.daily_usage.find_one({'user_id': user_id, 'service': service, 'date': today})
            count = record.get('count', 0) if record else 0
        except Exception:
            count = 0
        return {
            'service': service,
            'used': count,
            'limit': limit,
            'remaining': max(0, limit - count),
            'date': today,
        }

    def increment_daily_usage(self, user_id: str, service: str = 'gemini', limit: int = 20) -> dict[str, Any]:
        from pymongo import ReturnDocument
        today = datetime.now(timezone.utc).strftime('%d-%m-%Y')
        try:
            record = self.daily_usage.find_one_and_update(
                {'user_id': user_id, 'service': service, 'date': today},
                {'$inc': {'count': 1}},
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            count = record.get('count', 1) if record else 1
        except Exception:
            count = 1
        return {
            'service': service,
            'used': count,
            'limit': limit,
            'remaining': max(0, limit - count),
            'date': today,
        }

    def save_feedback(
        self,
        user_id: str,
        conversation_id: str,
        message_index: int,
        rating: str,
        feedback_text: str | None = None,
    ) -> dict[str, Any]:
        record = {
            'user_id': user_id,
            'conversation_id': conversation_id,
            'message_index': message_index,
            'rating': rating,
            'feedback_text': feedback_text or '',
            'created_at': datetime.now(timezone.utc).strftime('%d-%m-%Y %I:%M %p'),
        }
        if self.feedback is not None:
            try:
                self.feedback.insert_one(deepcopy(record))
            except Exception as exc:
                logger.warning('Feedback insert error: %s', exc)
        return record

    def get_conversation(self, user_id: str, conversation_id: str) -> dict[str, Any] | None:
        return self.conversations.find_one(
            {'user_id': user_id, 'conversation_id': conversation_id},
            {'_id': False, 'user_id': False},
        )

    def get_public_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        return self.conversations.find_one(
            {'conversation_id': conversation_id},
            {'_id': False, 'user_id': False},
        )

    def update_conversation_title(self, user_id: str, conversation_id: str, title: str) -> bool:
        result = self.conversations.update_one(
            {'user_id': user_id, 'conversation_id': conversation_id},
            {'$set': {'title': (title or '').strip() or 'Untitled Chat'}},
        )
        return result.modified_count > 0 or result.matched_count > 0

    def delete_conversation(self, user_id: str, conversation_id: str) -> bool:
        result = self.conversations.delete_one({'user_id': user_id, 'conversation_id': conversation_id})
        return result.deleted_count > 0

    def clear_conversations(self, user_id: str) -> bool:
        result = self.conversations.delete_many({'user_id': user_id})
        return result.deleted_count > 0

    def list_documents(self, user_id: str) -> list[dict[str, Any]]:
        cursor = self.documents.find({'user_id': user_id}, {'_id': False, 'user_id': False})
        return list(cursor)

    def get_document(self, user_id: str, document_id: str) -> dict[str, Any] | None:
        return self.documents.find_one(
            {'user_id': user_id, 'document_id': document_id},
            {'_id': False, 'user_id': False},
        )

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

    def close(self) -> None:
        if hasattr(self, 'client') and self.client:
            try:
                self.client.close()
            except Exception:
                pass


def create_store() -> InMemoryStore | MongoStore:
    from backend.config import settings
    if settings.MONGODB_URI:
        try:
            mongo = MongoStore(settings.MONGODB_URI, settings.DATABASE_NAME)
            logger.info('Connected to the configured MongoDB database.')
            return mongo
        except Exception as exc:
            logger.error(
                'MongoDB connection failed (%s). MongoDB-backed authentication is unavailable.',
                type(exc).__name__,
            )
    else:
        logger.warning('MONGODB_URI is not configured. MongoDB-backed authentication is unavailable.')
    return InMemoryStore()


store = create_store()
