# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TherapyCoach is a local web-based therapeutic chat application powered by Claude. It provides direct, challenging therapeutic support using CBT and psychodynamic approaches, with persistent context from user profile and session history.

## Architecture

- **Backend**: Python/FastAPI with PostgreSQL via Neon DB (`backend/`)
- **Frontend**: React 18 + TypeScript + Tailwind CSS via Vite (`frontend/`)
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Database**: Neon DB (cloud-hosted PostgreSQL)

Key architectural decisions:
- User profile is built via a one-time conversational intake on first run and stored in the `user_profile` table
- That profile is loaded into every API call as `<user_profile>` context
- Session summaries and pattern tags stored for continuity across sessions
- Pattern recognition runs at session end to identify recurring themes
- The living profile self-updates after each session via `services/profile_update.py`

## Development Commands

### Quick Start (Recommended)
From the project root, run a single command to start both backend and frontend:
```bash
npm run dev
```

This will start:
- **Backend** on port 8001 (FastAPI/uvicorn)
- **Frontend** on port 5173 (Vite dev server, proxies `/api` to backend)

### Individual Services

**Backend only:**
```bash
npm run backend
```

**Frontend only:**
```bash
npm run frontend
```

### Initial Setup

**Install Python dependencies:**
```bash
cd backend
pip install -r requirements.txt
```

**Install Node dependencies:**
```bash
npm install
```

This installs both root-level dependencies (concurrently) and frontend dependencies.

## Key Files

- `backend/services/claude.py` - Claude API integration and therapeutic system prompt
- `backend/services/context.py` - Context builder (loads profile + session history)
- `backend/services/patterns.py` - Session analysis and pattern extraction
- `backend/services/intake.py` - First-run conversational intake + profile generator
- `backend/services/profile_update.py` - Living profile updater (runs after each session)
- `backend/routers/profile.py` - Profile + intake API endpoints
- `frontend/src/components/IntakeFlow.tsx` - First-run intake UI
- `frontend/src/components/ChatWindow.tsx` - Main chat interface

## Environment

Create a `.env.local` file in the project root with the following variables:

```bash
# Anthropic API Key (required for Claude integration)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Neon DB Connection String (required for database)
# Get this from your Neon DB dashboard: https://console.neon.tech/
# Format: postgresql://user:password@host:port/database?sslmode=require
DATABASE_URL=postgresql://username:password@ep-example-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
```

Both environment variables are required for the application to function.

## The Therapeutic System Prompt

The system prompt in `backend/services/claude.py` is critical - it defines the direct, challenging therapeutic voice. Key elements:
- References the user's documented patterns by name (pulled from the profile)
- Calls out rationalizations and avoidance immediately
- Connects new content to known patterns from the profile
- Prioritizes accountability over comfort

## First-run setup

If this is a fresh install, follow `SETUP.md` — it walks through Neon setup, env vars, installing dependencies, and starting the app. The intake flow runs automatically on first launch when no profile exists in the database.
