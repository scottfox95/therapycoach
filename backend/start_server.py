#!/usr/bin/env python3
"""Backend server startup script."""

import os
import sys
from pathlib import Path

# Check if venv exists
venv_path = Path(__file__).parent.parent / "venv"

# Determine Python executable
if sys.platform == "win32":
    python_exe = venv_path / "Scripts" / "python.exe"
    uvicorn_exe = venv_path / "Scripts" / "uvicorn.exe"
else:
    # Try python3 first (macOS/Linux), fall back to python
    python3_exe = venv_path / "bin" / "python3"
    python_exe = venv_path / "bin" / "python"
    if python3_exe.exists():
        python_exe = python3_exe
    uvicorn_exe = venv_path / "bin" / "uvicorn"

# Check if uvicorn is importable
try:
    import uvicorn
    uvicorn_available = True
except ImportError:
    uvicorn_available = False

# Try to use venv Python if available, otherwise use current Python
if python_exe.exists():
    python_cmd = str(python_exe)
else:
    python_cmd = sys.executable

# Build uvicorn command
if uvicorn_available:
    # Use Python module syntax
    cmd = [python_cmd, "-m", "uvicorn", "backend.main:app", "--reload", "--port", "8001"]
else:
    # Try direct uvicorn executable
    if uvicorn_exe.exists():
        cmd = [str(uvicorn_exe), "backend.main:app", "--reload", "--port", "8001"]
    else:
        print("ERROR: uvicorn not found. Please ensure:")
        print("  1. Virtual environment is activated")
        print("  2. Dependencies are installed: pip install -r backend/requirements.txt")
        sys.exit(1)

# Execute uvicorn
try:
    os.execvp(cmd[0], cmd)
except Exception as e:
    print(f"ERROR: Failed to start uvicorn: {e}")
    sys.exit(1)
