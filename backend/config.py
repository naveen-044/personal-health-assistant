from pathlib import Path
import os
from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / '.env')
DATA_DIR = ROOT_DIR / 'data' / 'medical_documents'
CHROMA_PATH = ROOT_DIR / '.chroma'
DEFAULT_FRONTEND_ORIGINS = (
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
)


class Settings:
    APP_TITLE = 'Personal Health Assistant API'
    APP_VERSION = '1.0.0'
    FRONTEND_ORIGINS = list(dict.fromkeys(
        [
            origin.strip()
            for origin in os.getenv('FRONTEND_ORIGINS', '').split(',')
            if origin.strip()
        ]
        + list(DEFAULT_FRONTEND_ORIGINS)
    ))
    MONGODB_URI = os.getenv('MONGODB_URI', '').strip()
    DATABASE_NAME = os.getenv('DATABASE_NAME', 'personal_health_assistant').strip() or 'personal_health_assistant'
    GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')
    LLM_MODEL = os.getenv('LLM_MODEL', 'openai/gpt-oss-20b').strip()
    ALLOW_EMBEDDING_DOWNLOAD = os.getenv('ALLOW_EMBEDDING_DOWNLOAD', 'true').strip().lower() in {'1', 'true', 'yes', 'on'}
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', '')
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '15'))
    REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', '7'))
    AUTH_COOKIE_NAME = 'pha_refresh'
    AUTH_COOKIE_SAMESITE = os.getenv('AUTH_COOKIE_SAMESITE', 'lax').strip().lower()
    AUTH_COOKIE_SECURE = os.getenv('AUTH_COOKIE_SECURE', 'false').strip().lower() in {'1', 'true', 'yes', 'on'}
    AUTH_COOKIE_DOMAIN = os.getenv('AUTH_COOKIE_DOMAIN', '').strip() or None
    MAX_UPLOAD_SIZE_MB = int(os.getenv('MAX_UPLOAD_SIZE_MB', '10'))
    DATA_DIR = DATA_DIR
    CHROMA_PATH = CHROMA_PATH


settings = Settings()
