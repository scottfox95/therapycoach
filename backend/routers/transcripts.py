"""Transcript diarization and processing endpoints."""

import asyncio
import os
import tempfile
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..database import get_db
from ..models import (
    DiarizeResponse,
    Document,
    TranscriptProcessResponse,
    TranscriptSaveRequest,
    Utterance,
)
from ..services.transcript_processor import build_labeled_transcript, diarize_audio
from .documents import _ensure_session, _generate_document_summary

router = APIRouter()

ALLOWED_AUDIO_EXTENSIONS = {".m4a", ".mp3", ".wav", ".mp4", ".flac", ".ogg", ".webm"}
MAX_AUDIO_SIZE = 200_000_000  # 200MB


def _get_extension(filename: str) -> str:
    dot_idx = filename.rfind(".")
    if dot_idx == -1:
        return ""
    return filename[dot_idx:].lower()


@router.post("/diarize", response_model=DiarizeResponse)
async def diarize_transcript(
    file: UploadFile = File(...),
    expected_speakers: int = Form(3),
):
    """Upload audio and run speaker diarization via AssemblyAI.

    This can take 1-5 minutes depending on audio length.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = _get_extension(file.filename)
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}",
        )

    if expected_speakers < 2 or expected_speakers > 10:
        raise HTTPException(
            status_code=400, detail="Expected speakers must be between 2 and 10"
        )

    # Read and validate file size
    content = await file.read()
    if len(content) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 200MB)")

    # Save to temp file for AssemblyAI
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            suffix=ext, delete=False
        ) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        # This blocks for 1-5 minutes while AssemblyAI processes
        utterances, speaker_labels, raw_transcript = diarize_audio(
            tmp_path, expected_speakers
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    return DiarizeResponse(
        speakers=speaker_labels,
        utterances=[Utterance(**u) for u in utterances],
        raw_transcript=raw_transcript,
    )


@router.post("/save", response_model=TranscriptProcessResponse)
async def save_transcript(request: TranscriptSaveRequest):
    """Apply speaker names to diarized transcript and save as a document."""
    if not request.utterances:
        raise HTTPException(status_code=400, detail="No utterances provided")

    if not request.speaker_mapping:
        raise HTTPException(status_code=400, detail="Speaker mapping is required")

    # Convert utterances to dicts for the processor
    utterance_dicts = [u.model_dump() for u in request.utterances]

    # Build the labeled transcript
    labeled_content = build_labeled_transcript(utterance_dicts, request.speaker_mapping)

    # Save as a document
    session_id = _ensure_session(request.session_id)
    doc_id = str(uuid.uuid4())
    now = datetime.utcnow()
    filename = f"labeled_{request.filename}"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO documents (id, filename, content, size_bytes, uploaded_at, session_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                doc_id,
                filename,
                labeled_content,
                len(labeled_content.encode("utf-8")),
                now,
                session_id,
            ),
        )
        cursor.close()

    # Generate summary in background
    asyncio.create_task(
        _generate_document_summary(doc_id, labeled_content, filename)
    )

    doc = Document(
        id=doc_id,
        filename=filename,
        size_bytes=len(labeled_content.encode("utf-8")),
        summary=None,
        uploaded_at=now,
        session_id=session_id,
        message_id=None,
    )

    return TranscriptProcessResponse(
        document=doc,
        labeled_content=labeled_content,
        session_id=session_id,
    )
