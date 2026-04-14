"""Pydantic models for API schemas."""

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel


class MessageCreate(BaseModel):
    content: str


class Document(BaseModel):
    id: str
    filename: str
    size_bytes: int
    summary: Optional[str] = None
    uploaded_at: datetime
    session_id: Optional[str] = None
    message_id: Optional[str] = None


class DocumentUploadResponse(BaseModel):
    document: Document
    session_id: str


class Message(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    created_at: datetime
    documents: Optional[List[Document]] = None


class SessionCreate(BaseModel):
    title: Optional[str] = None


class Session(BaseModel):
    id: str
    title: Optional[str]
    created_at: datetime
    ended_at: Optional[datetime]
    summary: Optional[str]
    patterns: Optional[List[str]]
    message_count: Optional[int] = None
    first_message_preview: Optional[str] = None


class SessionWithMessages(Session):
    messages: List[Message]


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    document_ids: Optional[List[str]] = None


class ChatResponse(BaseModel):
    session_id: str
    message: Message
    response: Message


class SpeakerConfig(BaseModel):
    name: str
    role: Optional[str] = None


class Utterance(BaseModel):
    speaker: str
    text: str
    start: int  # milliseconds
    end: int  # milliseconds


class DiarizeResponse(BaseModel):
    speakers: List[str]
    utterances: List[Utterance]
    raw_transcript: str


class TranscriptSaveRequest(BaseModel):
    utterances: List[Utterance]
    speaker_mapping: dict  # {"A": {"name": "Maria", "role": "Therapist"}, ...}
    filename: Optional[str] = "transcript.md"
    session_id: Optional[str] = None


class TranscriptProcessResponse(BaseModel):
    document: Document
    labeled_content: str
    session_id: str
