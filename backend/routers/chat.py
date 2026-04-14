"""Chat endpoints for sending messages and getting responses."""

import uuid
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..database import get_db
from ..models import ChatRequest, ChatResponse, Document, Message
from ..services.claude import claude_service
from ..services.context import get_session_messages

router = APIRouter()


def save_message(session_id: str, role: str, content: str) -> Message:
    """Save a message to the database."""
    message_id = str(uuid.uuid4())
    now = datetime.utcnow()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO messages (id, session_id, role, content, created_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (message_id, session_id, role, content, now),
        )
        cursor.close()

    return Message(
        id=message_id,
        session_id=session_id,
        role=role,
        content=content,
        created_at=now,
    )


def ensure_session(session_id: Optional[str]) -> str:
    """Ensure a session exists, creating one if needed."""
    if session_id:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT 1 FROM sessions WHERE id = %s", (session_id,)
            )
            exists = cursor.fetchone()
            cursor.close()
            if exists:
                return session_id

    # Create new session
    new_id = str(uuid.uuid4())
    now = datetime.utcnow()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO sessions (id, created_at) VALUES (%s, %s)",
            (new_id, now),
        )
        cursor.close()

    return new_id


def get_documents_by_ids(doc_ids: List[str]) -> List[Dict]:
    """Fetch documents by their IDs."""
    if not doc_ids:
        return []
    placeholders = ",".join(["%s"] * len(doc_ids))
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT id, filename, content, size_bytes, summary, uploaded_at, session_id, message_id "
            f"FROM documents WHERE id IN ({placeholders})",
            tuple(doc_ids),
        )
        rows = cursor.fetchall()
        cursor.close()
    return [dict(row) for row in rows]


def link_documents_to_message(message_id: str, doc_ids: List[str]):
    """Link documents to the message they were sent with."""
    with get_db() as conn:
        cursor = conn.cursor()
        for doc_id in doc_ids:
            cursor.execute(
                "UPDATE documents SET message_id = %s WHERE id = %s AND message_id IS NULL",
                (message_id, doc_id),
            )
        cursor.close()


def build_claude_message(user_text: str, attached_docs: List[Dict]) -> str:
    """Build the message content for Claude, including document content."""
    if not attached_docs:
        return user_text

    doc_sections = []
    for doc in attached_docs:
        doc_sections.append(
            f'<attached_document filename="{doc["filename"]}" id="{doc["id"]}">\n'
            f'{doc["content"]}\n'
            f"</attached_document>"
        )

    return "\n\n".join(doc_sections) + "\n\n" + user_text


def get_message_document_ids(message_id: str) -> List[str]:
    """Get document IDs linked to a specific message."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM documents WHERE message_id = %s",
            (message_id,),
        )
        rows = cursor.fetchall()
        cursor.close()
    return [row["id"] for row in rows]


@router.post("/send", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    """Send a message and get a response."""
    session_id = ensure_session(request.session_id)

    # Fetch attached documents if any
    attached_docs = get_documents_by_ids(request.document_ids or [])

    # Save user message (text only, no document content)
    user_message = save_message(session_id, "user", request.message)

    # Link documents to this message
    if attached_docs:
        link_documents_to_message(user_message.id, [d["id"] for d in attached_docs])
        user_message.documents = [
            Document(
                id=d["id"],
                filename=d["filename"],
                size_bytes=d["size_bytes"],
                summary=d["summary"],
                uploaded_at=d["uploaded_at"],
                session_id=d["session_id"],
                message_id=user_message.id,
            )
            for d in attached_docs
        ]

    # Get conversation history
    history = get_session_messages(session_id)
    messages = []
    for m in history:
        content = m["content"]
        # For the last message (the one we just saved), include document content
        if m == history[-1] and attached_docs:
            content = build_claude_message(content, attached_docs)
        messages.append({"role": m["role"], "content": content})

    # Get Claude response
    response_text = claude_service.send_message(messages, session_id)

    # Save assistant response
    assistant_message = save_message(session_id, "assistant", response_text)

    return ChatResponse(
        session_id=session_id,
        message=user_message,
        response=assistant_message,
    )


@router.post("/stream")
async def stream_message(request: ChatRequest):
    """Stream a response for better UX."""
    session_id = ensure_session(request.session_id)

    # Fetch attached documents if any
    attached_docs = get_documents_by_ids(request.document_ids or [])

    # Save user message (text only)
    user_msg = save_message(session_id, "user", request.message)

    # Link documents to this message
    if attached_docs:
        link_documents_to_message(user_msg.id, [d["id"] for d in attached_docs])

    # Get conversation history
    history = get_session_messages(session_id)
    messages = []
    for m in history:
        content = m["content"]
        if m == history[-1] and attached_docs:
            content = build_claude_message(content, attached_docs)
        messages.append({"role": m["role"], "content": content})

    async def generate():
        full_response = []
        async for chunk in claude_service.stream_message(messages, session_id):
            full_response.append(chunk)
            yield chunk

        # Save complete response after streaming
        save_message(session_id, "assistant", "".join(full_response))

    return StreamingResponse(
        generate(),
        media_type="text/plain",
        headers={"X-Session-ID": session_id},
    )
