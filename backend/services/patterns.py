"""Pattern recognition and session summarization."""

import json
import re
from typing import List, Dict

from .claude import claude_service


PATTERN_EXTRACTION_PROMPT = """Analyze this therapy session transcript and provide:

1. A short 2-4 word session title
2. A concise 2-3 sentence summary of what was discussed
3. A list of patterns that appeared in this session (use short snake_case labels like "avoidance", "people_pleasing", "intellectualization")
4. The most important insight or moment from the session

Use pattern names that match any the client has already been using if possible. If a clearly new pattern emerged that isn't just a rename of an existing one, include it in new_patterns.

Respond with RAW JSON only. Do NOT wrap in markdown code blocks. Do NOT include ```json or ``` markers.
{
    "title": "2-4 word session title",
    "summary": "Brief summary of session content and key moments",
    "patterns": ["pattern_1", "pattern_2"],
    "new_patterns": ["any genuinely new patterns"],
    "key_insight": "The most important realization or moment from this session"
}"""


def _clean_json_response(text: str) -> str:
    """Strip markdown code blocks from Claude's response if present."""
    # Remove ```json ... ``` or ``` ... ``` wrappers
    text = text.strip()
    # Match ```json or ``` at start, and ``` at end
    pattern = r'^```(?:json)?\s*\n?(.*?)\n?```$'
    match = re.match(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text


async def analyze_session(messages: List[Dict]) -> Dict:
    """Analyze a completed session for patterns and summary."""
    transcript = "\n\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages
    )

    response = claude_service.client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=PATTERN_EXTRACTION_PROMPT,
        messages=[{"role": "user", "content": transcript}],
    )

    raw_text = response.content[0].text
    cleaned_text = _clean_json_response(raw_text)

    try:
        return json.loads(cleaned_text)
    except json.JSONDecodeError:
        # Fallback: try to extract just a summary from the text
        return {
            "summary": "Session ended. Analysis could not be parsed.",
            "patterns": [],
            "new_patterns": [],
            "key_insight": None,
        }
