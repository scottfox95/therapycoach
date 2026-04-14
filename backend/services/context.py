"""Context builder for Claude conversations.

Loads user profile and session history to provide therapeutic context.
"""

import json
from typing import List, Dict, Optional

from ..database import get_db


def load_user_profile() -> str:
    """Load the user's profile markdown from the database."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT profile_markdown FROM user_profile WHERE id = 1"
        )
        row = cursor.fetchone()
        cursor.close()
    return row["profile_markdown"] if row else ""


def user_profile_exists() -> bool:
    """Return True if the user has completed intake."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM user_profile WHERE id = 1")
        exists = cursor.fetchone() is not None
        cursor.close()
    return exists


def save_user_profile(profile_markdown: str, display_name: Optional[str] = None) -> None:
    """Insert or update the single user profile row."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO user_profile (id, display_name, profile_markdown, updated_at)
            VALUES (1, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                profile_markdown = EXCLUDED.profile_markdown,
                updated_at = CURRENT_TIMESTAMP
            """,
            (display_name, profile_markdown),
        )
        cursor.close()


def get_recent_session_summaries(limit: int = 5) -> List[Dict]:
    """Get summaries from recent sessions."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, title, summary, patterns, ended_at
            FROM sessions
            WHERE summary IS NOT NULL
            ORDER BY ended_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cursor.fetchall()
        cursor.close()

    return [
        {
            "id": row["id"],
            "title": row["title"],
            "summary": row["summary"],
            "patterns": json.loads(row["patterns"]) if row["patterns"] else [],
            "ended_at": row["ended_at"],
        }
        for row in rows
    ]


def get_session_messages(session_id: str) -> List[Dict]:
    """Get all messages from a session."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, role, content, created_at
            FROM messages
            WHERE session_id = %s
            ORDER BY created_at ASC
            """,
            (session_id,),
        )
        rows = cursor.fetchall()
        cursor.close()

    return [dict(row) for row in rows]


def get_document_metadata(limit: int = 20) -> List[Dict]:
    """Get metadata for all uploaded documents (no content)."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, summary, uploaded_at, session_id
            FROM documents
            ORDER BY uploaded_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cursor.fetchall()
        cursor.close()
    return [dict(row) for row in rows]


def build_context(session_id: Optional[str] = None) -> str:
    """Build full context for Claude including profile and session history."""
    parts = []

    profile = load_user_profile()
    if profile:
        parts.append(f"<user_profile>\n{profile}\n</user_profile>")

    summaries = get_recent_session_summaries()
    if summaries:
        summary_text = "\n\n".join(
            f"Session: {s['title'] or 'Untitled'} ({s['ended_at']})\n"
            f"Patterns: {', '.join(s['patterns']) if s['patterns'] else 'None identified'}\n"
            f"Summary: {s['summary']}"
            for s in summaries
        )
        parts.append(f"<recent_sessions>\n{summary_text}\n</recent_sessions>")

    docs = get_document_metadata()
    if docs:
        doc_text = "\n\n".join(
            f"Document: {d['filename']} (uploaded {d['uploaded_at']})\n"
            f"ID: {d['id']}\n"
            f"Summary: {d['summary'] or 'Summary pending...'}"
            for d in docs
        )
        parts.append(
            f"<uploaded_documents>\n"
            f"The client has uploaded these documents. Their full content was included "
            f"when first discussed. You can reference them by name. If the client asks "
            f"about a specific document, the full content may be included in their message.\n\n"
            f"{doc_text}\n"
            f"</uploaded_documents>"
        )

    return "\n\n".join(parts)
