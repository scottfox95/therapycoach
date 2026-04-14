"""Session management endpoints."""

import asyncio
import json
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException

from ..database import get_db
from ..models import Document, Session, SessionCreate, SessionWithMessages, Message
from ..services.context import get_session_messages
from ..services.patterns import analyze_session
from ..services.profile_update import update_profile_after_session

router = APIRouter()


@router.get("/", response_model=List[Session])
async def list_sessions():
    """List all sessions, most recent first."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.id, s.title, s.created_at, s.ended_at, s.summary, s.patterns,
                   (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count,
                   (SELECT SUBSTRING(m2.content, 1, 80)
                    FROM messages m2
                    WHERE m2.session_id = s.id AND m2.role = 'user'
                    ORDER BY m2.created_at ASC LIMIT 1) as first_message_preview
            FROM sessions s
            ORDER BY s.created_at DESC
            """
        )
        rows = cursor.fetchall()
        cursor.close()

    return [
        Session(
            id=row["id"],
            title=row["title"],
            created_at=row["created_at"],
            ended_at=row["ended_at"],
            summary=row["summary"],
            patterns=json.loads(row["patterns"]) if row["patterns"] else None,
            message_count=row["message_count"],
            first_message_preview=row["first_message_preview"],
        )
        for row in rows
    ]


@router.post("/", response_model=Session)
async def create_session(session: SessionCreate):
    """Create a new session."""
    session_id = str(uuid.uuid4())
    now = datetime.utcnow()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO sessions (id, title, created_at)
            VALUES (%s, %s, %s)
            """,
            (session_id, session.title, now),
        )
        cursor.close()

    return Session(
        id=session_id,
        title=session.title,
        created_at=now,
        ended_at=None,
        summary=None,
        patterns=None,
    )


@router.get("/{session_id}", response_model=SessionWithMessages)
async def get_session(session_id: str):
    """Get a session with all its messages."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, title, created_at, ended_at, summary, patterns
            FROM sessions
            WHERE id = %s
            """,
            (session_id,),
        )
        row = cursor.fetchone()
        cursor.close()

    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = get_session_messages(session_id)

    # Fetch documents for this session to attach to their messages
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, size_bytes, summary, uploaded_at, session_id, message_id
            FROM documents
            WHERE session_id = %s
            """,
            (session_id,),
        )
        doc_rows = cursor.fetchall()
        cursor.close()

    # Group documents by message_id
    docs_by_message: dict = {}
    for d in doc_rows:
        mid = d["message_id"]
        if mid:
            docs_by_message.setdefault(mid, []).append(
                Document(
                    id=d["id"],
                    filename=d["filename"],
                    size_bytes=d["size_bytes"],
                    summary=d["summary"],
                    uploaded_at=d["uploaded_at"],
                    session_id=d["session_id"],
                    message_id=d["message_id"],
                )
            )

    # Build message list — use actual message IDs from DB
    message_list = []
    for m in messages:
        msg_id = m["id"]
        msg = Message(
            id=msg_id,
            session_id=session_id,
            role=m["role"],
            content=m["content"],
            created_at=m["created_at"],
            documents=docs_by_message.get(msg_id),
        )
        message_list.append(msg)

    return SessionWithMessages(
        id=row["id"],
        title=row["title"],
        created_at=row["created_at"],
        ended_at=row["ended_at"],
        summary=row["summary"],
        patterns=json.loads(row["patterns"]) if row["patterns"] else None,
        messages=message_list,
    )


@router.post("/{session_id}/end", response_model=Session)
async def end_session(session_id: str):
    """End a session and generate summary."""
    messages = get_session_messages(session_id)

    if not messages:
        raise HTTPException(status_code=400, detail="Cannot end empty session")

    # Analyze session for patterns and summary
    analysis = await analyze_session(messages)

    now = datetime.utcnow()
    patterns_json = json.dumps(analysis.get("patterns", []))

    title = analysis.get("title")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE sessions
            SET ended_at = %s, summary = %s, patterns = %s, title = %s
            WHERE id = %s
            """,
            (now, analysis.get("summary"), patterns_json, title, session_id),
        )

        cursor.execute(
            "SELECT * FROM sessions WHERE id = %s", (session_id,)
        )
        row = cursor.fetchone()
        cursor.close()

    # Update the living profile in the background (don't wait for it)
    async def _update_profile_background():
        try:
            await update_profile_after_session(analysis, messages)
        except Exception as e:
            print(f"Warning: Failed to update living profile: {e}")

    asyncio.create_task(_update_profile_background())

    return Session(
        id=row["id"],
        title=row["title"],
        created_at=row["created_at"],
        ended_at=row["ended_at"],
        summary=row["summary"],
        patterns=json.loads(row["patterns"]) if row["patterns"] else None,
    )


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Delete a session and its messages."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM documents WHERE session_id = %s", (session_id,))
        cursor.execute("DELETE FROM messages WHERE session_id = %s", (session_id,))
        cursor.execute("DELETE FROM sessions WHERE id = %s", (session_id,))
        cursor.close()

    return {"status": "deleted"}


def _extract_summary_text(raw_summary: str) -> str:
    """Extract plain summary text, handling cases where raw JSON was stored."""
    text = raw_summary.strip()
    # If summary is raw JSON (e.g. ```json {...} ```), try to parse it
    if text.startswith("```"):
        import re
        match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
        if match:
            text = match.group(1).strip()
    if text.startswith("{"):
        try:
            parsed = json.loads(text)
            return parsed.get("summary", text)
        except (json.JSONDecodeError, AttributeError):
            pass
    return text


def _extract_title_from_summary(summary: str) -> str:
    """Extract a short 2-4 word title from a session summary."""
    text = _extract_summary_text(summary)

    # Remove common prefixes like "Client discussed", "User expressed", etc.
    import re
    text = re.sub(
        r'^(?:The\s+)?(?:client|user)\s+(?:discussed|expressed|explored|talked\s+about|shared|reflected\s+on|brought\s+up)\s+',
        '', text, flags=re.IGNORECASE
    ).strip()

    # Take text up to the first period, comma, or connecting word
    for sep in [".", ",", ";", " — ", " - ", " and ", " when ", " about ", " with "]:
        idx = text.lower().find(sep)
        if 0 < idx <= 40:
            fragment = text[:idx].strip()
            words = fragment.split()
            if 1 <= len(words) <= 4:
                # Capitalize first letter
                return fragment[0].upper() + fragment[1:]

    # Fallback: first 3 words
    words = text.split()[:3]
    result = " ".join(words)
    return result[0].upper() + result[1:] if result else "Session"


@router.post("/backfill-titles")
async def backfill_titles():
    """Generate titles for ended sessions that have summaries but no title.
    Also fixes summaries stored as raw JSON."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, summary FROM sessions WHERE summary IS NOT NULL"
        )
        rows = cursor.fetchall()

        updated = 0
        for row in rows:
            raw = row["summary"]
            clean_summary = _extract_summary_text(raw)
            title = _extract_title_from_summary(raw)

            # Fix the summary if it was stored as raw JSON, and set the title
            cursor.execute(
                "UPDATE sessions SET title = %s, summary = %s WHERE id = %s",
                (title, clean_summary, row["id"]),
            )
            updated += 1
        cursor.close()

    return {"status": "ok", "updated": updated}
