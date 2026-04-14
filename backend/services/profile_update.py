"""Living profile updater — refreshes the user_profile row after each session."""

from typing import Dict, Optional

from .claude import claude_service
from .context import load_user_profile, save_user_profile


PROFILE_UPDATE_PROMPT = """You are updating a therapist's client profile after a therapy session. You have:

1. The CURRENT profile (comprehensive client history, patterns, relationships, core beliefs)
2. A SESSION ANALYSIS (summary of what was discussed, patterns that appeared)

Your task: produce an UPDATED profile that:
- Preserves all existing important information (history, relationships, core beliefs)
- Integrates new insights from this session into the appropriate sections
- Notes any progress, breakthroughs, or new patterns observed
- Keeps the document compact and well-organized (avoid bloat)
- Uses the same markdown structure and style as the original

Rules:
- DO NOT remove or significantly alter historical facts
- DO NOT add speculative interpretations — only what emerged in the session
- DO add new named patterns if genuinely new behaviors were identified
- DO update any "Current status" or "Recent sessions" section with recent developments
- If a section would grow too long, summarize older items to make room for new
- Keep total length similar to the original (within ~20%)

Return ONLY the updated markdown content. No preamble, no code fences."""


async def update_profile_after_session(
    session_analysis: Dict,
    session_messages: Optional[list] = None,
) -> bool:
    """Update the living profile with insights from a completed session.

    Args:
        session_analysis: Dict with 'summary', 'patterns', 'key_insight', etc.
        session_messages: Optional list of messages for additional context.

    Returns:
        True if the update was successful.
    """
    current_profile = load_user_profile()
    if not current_profile:
        return False

    session_context = f"""SESSION ANALYSIS:
Summary: {session_analysis.get('summary', 'No summary available')}
Patterns identified: {', '.join(session_analysis.get('patterns', [])) or 'None'}
New patterns: {', '.join(session_analysis.get('new_patterns', [])) or 'None'}
Key insight: {session_analysis.get('key_insight', 'None identified')}
"""

    try:
        response = claude_service.client.messages.create(
            model=claude_service.model,
            max_tokens=8192,
            system=PROFILE_UPDATE_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"CURRENT PROFILE:\n\n{current_profile}\n\n---\n\n"
                        f"{session_context}\n\n"
                        f"Please produce the updated profile:"
                    ),
                }
            ],
        )

        updated_profile = response.content[0].text.strip()

        if len(updated_profile) < 100:
            return False

        save_user_profile(updated_profile)
        return True

    except Exception as e:
        print(f"Failed to update profile: {e}")
        return False
