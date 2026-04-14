"""PostgreSQL database setup and connection for Neon DB."""

import os
from contextlib import contextmanager
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Try to load .env.local file (in case main.py hasn't loaded it yet)
_env_path = Path(__file__).parent.parent / ".env.local"
if _env_path.exists():
    # Force reload to ensure we get the latest values
    load_dotenv(_env_path, override=True)


def get_connection():
    """Get a database connection with RealDictCursor for dict-like row access."""
    # Read DATABASE_URL at runtime (not at module import time)
    # This ensures environment variables loaded by dotenv are available
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        # Try loading one more time just in case
        if _env_path.exists():
            load_dotenv(_env_path, override=True)
            database_url = os.environ.get("DATABASE_URL")
        
        if not database_url:
            raise ValueError(
                f"DATABASE_URL environment variable is not set. "
                f"Please set it to your Neon DB connection string in .env.local file. "
                f"(Checked path: {_env_path}, exists: {_env_path.exists()})"
            )
    conn = psycopg2.connect(database_url, cursor_factory=RealDictCursor)
    return conn


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    """Initialize database schema."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Create sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMP,
                summary TEXT,
                patterns TEXT  -- JSON array of pattern tags
            )
        """)
        
        # Create messages table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT REFERENCES sessions(id),
                role TEXT NOT NULL,  -- 'user' or 'assistant'
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create index on session_id for faster message lookups
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_session
                ON messages(session_id)
        """)

        # Create documents table for uploaded files
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                content TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                summary TEXT,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                session_id TEXT REFERENCES sessions(id),
                message_id TEXT REFERENCES messages(id)
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_documents_session
                ON documents(session_id)
        """)

        # Create user_profile table (single-row table for the app's one user)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY DEFAULT 1,
                display_name TEXT,
                profile_markdown TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT user_profile_singleton CHECK (id = 1)
            )
        """)

        cursor.close()
