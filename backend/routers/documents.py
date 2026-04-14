"""Document upload and management endpoints."""

import asyncio
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..database import get_db
from ..models import Document, DocumentUploadResponse
from ..services.claude import claude_service

router = APIRouter()

ALLOWED_EXTENSIONS = {".txt", ".md", ".markdown"}
MAX_FILE_SIZE = 1_000_000  # 1MB


def _get_extension(filename: str) -> str:
    """Get lowercase file extension."""
    dot_idx = filename.rfind(".")
    if dot_idx == -1:
        return ""
    return filename[dot_idx:].lower()


async def _generate_document_summary(doc_id: str, content: str, filename: str):
    """Generate a Claude summary of the document for future context use."""
    try:
        response = claude_service.client.messages.create(
            model=claude_service.model,
            max_tokens=512,
            system=(
                "Summarize this document in 2-3 sentences. Focus on the key themes, "
                "topics discussed, and any therapeutic insights. This summary will be "
                "used to decide when to include the full document in future therapy "
                "conversations."
            ),
            messages=[
                {
                    "role": "user",
                    "content": f"Document: {filename}\n\n{content[:50000]}",
                }
            ],
        )
        summary = response.content[0].text

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE documents SET summary = %s WHERE id = %s",
                (summary, doc_id),
            )
            cursor.close()
    except Exception as e:
        print(f"Failed to generate document summary: {e}")


def _ensure_session(session_id: Optional[str]) -> str:
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


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
):
    """Upload a text/markdown file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = _get_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Only {', '.join(ALLOWED_EXTENSIONS)} files are supported",
        )

    content_bytes = await file.read()
    if len(content_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 1MB)")

    try:
        text_content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text_content = content_bytes.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=400, detail="Could not decode file as text"
            )

    session_id = _ensure_session(session_id)

    doc_id = str(uuid.uuid4())
    now = datetime.utcnow()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO documents (id, filename, content, size_bytes, uploaded_at, session_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (doc_id, file.filename, text_content, len(content_bytes), now, session_id),
        )
        cursor.close()

    # Generate summary in the background
    asyncio.create_task(
        _generate_document_summary(doc_id, text_content, file.filename)
    )

    doc = Document(
        id=doc_id,
        filename=file.filename,
        size_bytes=len(content_bytes),
        summary=None,
        uploaded_at=now,
        session_id=session_id,
        message_id=None,
    )

    return DocumentUploadResponse(document=doc, session_id=session_id)


@router.get("/", response_model=List[Document])
async def list_documents():
    """List all uploaded documents (metadata only)."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, size_bytes, summary, uploaded_at, session_id, message_id
            FROM documents
            ORDER BY uploaded_at DESC
            """
        )
        rows = cursor.fetchall()
        cursor.close()

    return [
        Document(
            id=row["id"],
            filename=row["filename"],
            size_bytes=row["size_bytes"],
            summary=row["summary"],
            uploaded_at=row["uploaded_at"],
            session_id=row["session_id"],
            message_id=row["message_id"],
        )
        for row in rows
    ]


@router.get("/{document_id}", response_model=Document)
async def get_document(document_id: str):
    """Get a single document's metadata."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, size_bytes, summary, uploaded_at, session_id, message_id
            FROM documents
            WHERE id = %s
            """,
            (document_id,),
        )
        row = cursor.fetchone()
        cursor.close()

    if not row:
        raise HTTPException(status_code=404, detail="Document not found")

    return Document(
        id=row["id"],
        filename=row["filename"],
        size_bytes=row["size_bytes"],
        summary=row["summary"],
        uploaded_at=row["uploaded_at"],
        session_id=row["session_id"],
        message_id=row["message_id"],
    )


@router.get("/{document_id}/content")
async def get_document_content(document_id: str):
    """Get a document's full text content."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, filename, content FROM documents WHERE id = %s",
            (document_id,),
        )
        row = cursor.fetchone()
        cursor.close()

    if not row:
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "id": row["id"],
        "filename": row["filename"],
        "content": row["content"],
    }


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """Delete a document."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM documents WHERE id = %s", (document_id,))
        cursor.close()

    return {"status": "deleted"}
