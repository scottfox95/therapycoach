"""Intake service — conversational profile builder for first-run users."""

import re
from typing import Dict, List, Optional, Tuple

from .claude import claude_service


INTAKE_READY_TOKEN = "[INTAKE_READY]"


INTAKE_SYSTEM_PROMPT = """You are conducting a therapeutic intake interview with a new client. Your job is to gather enough information to build a rich clinical profile that a therapist will reference in every future session. You have roughly 10-14 exchanges to learn about them across five areas:

1. **Basics** — what they want to be called, rough life stage (age band is fine), current situation (work, living, partnership status)
2. **Presenting concerns** — what brought them here right now, what's heaviest, what keeps recurring
3. **Patterns & history** — family dynamics that still echo, formative experiences, prior therapy, how they typically cope when things get hard
4. **Relationships** — partner, family, key friends, work dynamics — who matters and how those relationships feel
5. **Goals & style** — what they want this to help with, how direct they want the therapist to be, what they'd consider progress

## Your voice

- Warm but efficient. This is intake, not therapy yet.
- Ask ONE focused question per turn. Occasionally two short related ones if they naturally belong together.
- Follow up on interesting threads briefly — don't let them monologue forever, but don't cut off emotion.
- Use their own words back to show you're listening.
- If an answer is vague, ask for one concrete example.
- Do NOT give advice, interpretation, or therapy during intake. That comes in real sessions.
- Do NOT use forms, numbered lists, or scales. This is a conversation.
- Match their energy: if they're brief, stay brief; if they open up, make space.

## Coverage

Keep a mental checklist of the five areas. Don't move on until you have something real in each. If they skip one, circle back: "Before we wrap, I want to ask about [area]."

## Ending the intake

When you have enough across all five areas — usually 10-14 exchanges in — tell them something like:

"Okay, I have a good picture. You can click 'Complete Intake' when you're ready, or keep going if there's something important I missed."

Then end that message with this exact token on its own line:

""" + INTAKE_READY_TOKEN + """

Do NOT emit the token until you have at least: their name, the core presenting concerns, some relationship context, some history, and a sense of what they want from therapy. Once emitted, it's fine to keep talking — but they now have the option to finalize.

## First message

Open with: "I'm going to ask you some questions so I can actually be useful to you across future sessions. It takes about 10-15 minutes and feels like a conversation. Let's start simple — what should I call you, and what's bringing you here today?"
"""


PROFILE_GENERATION_PROMPT = """You just completed an intake interview with a new client. Your task now is to produce a comprehensive clinical profile in markdown format that will be loaded as context into every future therapy session.

The profile should be organized with clear headed sections and include everything substantive from the intake:

- **Basics** — name, pronouns (if stated), rough age/life stage, current situation
- **Presenting concerns** — what brought them here, what's heaviest right now
- **Patterns** — emotional, behavioral, and cognitive patterns you observed or they described. NAME each pattern with a short label (2-3 words) the therapist can reference back to the client in real-time. Give each pattern a one-sentence description.
- **History & developmental context** — family, formative experiences, anything that still echoes
- **Relationships** — partner/dating, family, close friends, work dynamics — use real names the client gave
- **Core beliefs** — stated or clearly implied beliefs about themselves, others, the world
- **Coping strategies** — both healthy ones and defensive ones
- **Goals for therapy** — what they said they want from this
- **Therapist notes** — how direct they asked you to be, what style fits them, what to watch for

Use the client's own evocative phrases where they used them. Be specific — names, details, concrete examples. The therapist who reads this in future sessions should feel like they already know this person.

Return ONLY the markdown profile. No preamble, no code fences, no commentary.

Start with: `# Client Profile: [Name]`
"""


def run_intake_turn(history: List[Dict]) -> Tuple[str, bool]:
    """Run one turn of the intake conversation.

    Args:
        history: List of {role, content} dicts from the intake conversation so far.
                 Pass an empty list to get the opening message.

    Returns:
        (assistant_message, intake_ready)
    """
    if not history:
        messages = [{"role": "user", "content": "Start the intake."}]
    else:
        messages = history

    response = claude_service.client.messages.create(
        model=claude_service.model,
        max_tokens=1024,
        system=INTAKE_SYSTEM_PROMPT,
        messages=messages,
    )

    raw = response.content[0].text
    ready = INTAKE_READY_TOKEN in raw
    cleaned = raw.replace(INTAKE_READY_TOKEN, "").rstrip()
    return cleaned, ready


def generate_profile_from_intake(history: List[Dict]) -> Tuple[str, Optional[str]]:
    """Generate a structured profile markdown from the intake conversation.

    Returns:
        (profile_markdown, display_name)
    """
    transcript = "\n\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in history
    )

    response = claude_service.client.messages.create(
        model=claude_service.model,
        max_tokens=4096,
        system=PROFILE_GENERATION_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Here is the full intake conversation:\n\n{transcript}\n\nNow produce the profile markdown.",
            }
        ],
    )

    profile_markdown = response.content[0].text.strip()
    profile_markdown = _strip_code_fences(profile_markdown)
    display_name = _extract_name(profile_markdown)
    return profile_markdown, display_name


def _strip_code_fences(text: str) -> str:
    """Strip leading/trailing markdown code fences if Claude wrapped output."""
    text = text.strip()
    if text.startswith("```"):
        match = re.match(r"^```(?:markdown|md)?\s*\n(.*?)\n```\s*$", text, re.DOTALL)
        if match:
            return match.group(1).strip()
    return text


def _extract_name(profile_markdown: str) -> Optional[str]:
    """Pull the display name out of the `# Client Profile: <Name>` header."""
    match = re.search(r"^#\s*Client Profile:\s*(.+)$", profile_markdown, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return None
