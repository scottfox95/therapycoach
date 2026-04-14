"""User profile + intake endpoints."""

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.context import (
    load_user_profile,
    save_user_profile,
    user_profile_exists,
)
from ..services.intake import (
    generate_profile_from_intake,
    run_intake_turn,
)

router = APIRouter()


class IntakeMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class IntakeTurnRequest(BaseModel):
    history: List[IntakeMessage] = []


class IntakeTurnResponse(BaseModel):
    assistant_message: str
    intake_ready: bool


class IntakeFinalizeRequest(BaseModel):
    history: List[IntakeMessage]


class ProfileStatus(BaseModel):
    exists: bool
    profile_markdown: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    profile_markdown: str
    display_name: Optional[str] = None


@router.get("/status", response_model=ProfileStatus)
async def get_profile_status():
    """Check whether the user has completed intake."""
    exists = user_profile_exists()
    return ProfileStatus(
        exists=exists,
        profile_markdown=load_user_profile() if exists else None,
    )


@router.post("/intake/turn", response_model=IntakeTurnResponse)
async def intake_turn(request: IntakeTurnRequest):
    """Run one turn of the intake conversation."""
    if user_profile_exists():
        raise HTTPException(
            status_code=400,
            detail="Profile already exists. Delete it first to re-run intake.",
        )

    history_dicts = [{"role": m.role, "content": m.content} for m in request.history]
    assistant_message, ready = run_intake_turn(history_dicts)
    return IntakeTurnResponse(
        assistant_message=assistant_message,
        intake_ready=ready,
    )


@router.post("/intake/finalize", response_model=ProfileStatus)
async def intake_finalize(request: IntakeFinalizeRequest):
    """Generate the profile from the intake conversation and save it."""
    if user_profile_exists():
        raise HTTPException(
            status_code=400,
            detail="Profile already exists.",
        )

    if len(request.history) < 4:
        raise HTTPException(
            status_code=400,
            detail="Intake conversation is too short to generate a profile.",
        )

    history_dicts = [{"role": m.role, "content": m.content} for m in request.history]
    profile_markdown, display_name = generate_profile_from_intake(history_dicts)
    save_user_profile(profile_markdown, display_name)

    return ProfileStatus(exists=True, profile_markdown=profile_markdown)


@router.put("/", response_model=ProfileStatus)
async def update_profile(request: ProfileUpdateRequest):
    """Manually update the profile markdown (for editing later)."""
    save_user_profile(request.profile_markdown, request.display_name)
    return ProfileStatus(exists=True, profile_markdown=request.profile_markdown)


@router.delete("/")
async def delete_profile():
    """Delete the profile so intake can be re-run."""
    from ..database import get_db

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_profile WHERE id = 1")
        cursor.close()
    return {"status": "deleted"}
