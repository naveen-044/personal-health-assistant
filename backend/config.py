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
    MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
    GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')
    LLM_MODEL = os.getenv('LLM_MODEL', 'openai/gpt-oss-20b').strip()
    ALLOW_EMBEDDING_DOWNLOAD = os.getenv('ALLOW_EMBEDDING_DOWNLOAD', 'true').strip().lower() in {'1', 'true', 'yes', 'on'}
    SECRET_KEY = os.getenv('SECRET_KEY', 'change-me-in-production')
    MAX_UPLOAD_SIZE_MB = int(os.getenv('MAX_UPLOAD_SIZE_MB', '10'))
    DATA_DIR = DATA_DIR
    CHROMA_PATH = CHROMA_PATH


settings = Settings()
