from pathlib import Path
import os
from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / '.env')
DATA_DIR = ROOT_DIR / 'data' / 'medical_documents'
CHROMA_PATH = ROOT_DIR / '.chroma'


class Settings:
    APP_TITLE = 'Personal Health Assistant API'
    APP_VERSION = '1.0.0'
    FRONTEND_ORIGINS = [
        origin.strip()
        for origin in os.getenv('FRONTEND_ORIGINS', 'http://localhost:5173').split(',')
        if origin.strip()
    ]
    MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
    GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')
    OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    MODEL_PROVIDER = os.getenv('MODEL_PROVIDER', 'ollama')
    LLM_MODEL = os.getenv('LLM_MODEL', 'llama3.2')
    SECRET_KEY = os.getenv('SECRET_KEY', 'change-me-in-production')
    MAX_UPLOAD_SIZE_MB = int(os.getenv('MAX_UPLOAD_SIZE_MB', '10'))
    DATA_DIR = DATA_DIR
    CHROMA_PATH = CHROMA_PATH


settings = Settings()
