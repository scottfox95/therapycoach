"""One-time migration: load an existing profile markdown file into the user_profile table.

Usage:
    python -m backend.scripts.import_profile_from_file [path_to_markdown]

Defaults to Therapist_Summary_Scott.md at the project root if no path given.
"""

import sys
from pathlib import Path

# Load env before importing the DB module.
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env.local")

from backend.database import init_db  # noqa: E402
from backend.services.context import load_user_profile, save_user_profile  # noqa: E402
from backend.services.intake import _extract_name  # noqa: E402


def main() -> int:
    init_db()

    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
    else:
        path = PROJECT_ROOT / "Therapist_Summary_Scott.md"

    if not path.exists():
        print(f"error: profile file not found at {path}")
        return 1

    existing = load_user_profile()
    if existing:
        response = input(
            "A profile already exists in the database. Overwrite? [y/N] "
        )
        if response.strip().lower() != "y":
            print("aborted.")
            return 0

    markdown = path.read_text()
    display_name = _extract_name(markdown)
    save_user_profile(markdown, display_name)

    print(f"imported profile from {path}")
    print(f"display_name: {display_name or '(not extracted)'}")
    print(f"length: {len(markdown)} chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
