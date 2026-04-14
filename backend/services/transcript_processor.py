"""Audio diarization and transcript processing via AssemblyAI."""

import os
from typing import Dict, List, Tuple

import assemblyai as aai


def _get_client():
    """Initialize AssemblyAI with API key."""
    api_key = os.environ.get("ASSEMBLYAI_API_KEY")
    if not api_key:
        raise ValueError(
            "ASSEMBLYAI_API_KEY environment variable is not set. "
            "Get a free key at https://www.assemblyai.com"
        )
    aai.settings.api_key = api_key


def diarize_audio(
    file_path: str, expected_speakers: int = 3
) -> Tuple[List[Dict], List[str], str]:
    """Send audio to AssemblyAI for transcription with speaker diarization.

    Args:
        file_path: Path to the audio file (.m4a, .mp3, .wav, etc.)
        expected_speakers: Expected number of distinct speakers.

    Returns:
        Tuple of (utterances, speaker_labels, raw_transcript) where:
        - utterances: List of dicts with speaker, text, start, end
        - speaker_labels: Sorted list of unique speaker labels found
        - raw_transcript: Full transcript text without speaker labels
    """
    _get_client()

    config = aai.TranscriptionConfig(
        speaker_labels=True,
        speakers_expected=expected_speakers,
        speech_models=["universal-3-pro", "universal-2"],
        language_detection=True,
    )

    transcriber = aai.Transcriber(config=config)
    transcript = transcriber.transcribe(file_path)

    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(f"Transcription failed: {transcript.error}")

    utterances = []
    speaker_labels = set()

    for utterance in transcript.utterances:
        utterances.append(
            {
                "speaker": utterance.speaker,
                "text": utterance.text,
                "start": utterance.start,
                "end": utterance.end,
            }
        )
        speaker_labels.add(utterance.speaker)

    raw_transcript = transcript.text or ""

    return utterances, sorted(speaker_labels), raw_transcript


def build_labeled_transcript(
    utterances: List[Dict], speaker_mapping: Dict[str, Dict]
) -> str:
    """Apply speaker names to diarized utterances and produce a labeled transcript.

    Args:
        utterances: List of dicts with speaker, text, start, end.
        speaker_mapping: Maps speaker labels to name/role info.
            e.g. {"A": {"name": "Maria", "role": "Therapist"}}

    Returns:
        Formatted transcript with speaker names.
    """
    lines = []
    for utt in utterances:
        speaker_label = utt["speaker"]
        mapping = speaker_mapping.get(speaker_label, {})
        name = mapping.get("name", f"Speaker {speaker_label}")
        role = mapping.get("role")

        if role:
            label = f"**{name} ({role}):**"
        else:
            label = f"**{name}:**"

        lines.append(f"{label} {utt['text']}")

    return "\n\n".join(lines)
