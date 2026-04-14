# Setup guide

> **This file is written to be handed to Claude Code.** Open this repo in Claude Code and say: *"Read SETUP.md and help me get this running."* Claude will walk you through it, run the commands, and answer questions along the way. You don't need to follow it manually — it's designed to be executed by an AI pair.

---

## What you're setting up

TherapyCoach is a local web-based therapeutic chat app powered by Claude. It runs on your laptop only — no data ever leaves your machine except the AI calls to Anthropic. Your sessions are stored in your own private database.

When you first launch it, it runs a 10–15 minute **intake conversation** to build a clinical profile of you. That profile is then loaded into every future chat session so the therapist remembers you and references your patterns by name.

---

## Instructions for Claude Code

You're helping the user get TherapyCoach running locally on their machine for the first time. Walk through each step below with them. Explain what you're doing before running commands. Don't run anything that touches the network or installs things without telling them first.

### Prerequisites — verify these first

Run these checks and tell the user what's missing:

```bash
python3 --version   # need 3.10 or newer
node --version      # need 18 or newer
npm --version
git --version
```

If any are missing, tell the user how to install (mac: `brew install python node git`). **Don't install anything for them without permission.**

### Step 1 — Get the two secrets from the user

This app needs two secret values before it can run:

1. **`ANTHROPIC_API_KEY`** — the Anthropic API key. Scott is providing this for you (he's paying for your usage). He should have sent it to you privately over Signal, iMessage, 1Password, or similar. **Do not ask Scott to post it in a public channel. Do not commit it to git.**

2. **`DATABASE_URL`** — a Postgres connection string from Neon DB. You need to create your own Neon account (free) so your sessions are stored in *your* private database, not someone else's.

Ask the user:
- "Do you already have the Anthropic API key Scott sent you? Paste it here and I'll put it in `.env.local`."
- "Do you already have a Neon database set up? If not, I'll walk you through it."

### Step 2 — Set up a Neon database (if they don't have one)

Neon is free and takes about 2 minutes. Walk the user through this:

1. Open https://console.neon.tech/ in a browser
2. Sign up (GitHub sign-in is easiest)
3. Create a new project — they can name it anything (e.g. "therapycoach")
4. On the project dashboard, find the **Connection string** (sometimes labeled "Connection details")
5. Copy the **Pooled connection** string — it should look like:
   `postgresql://username:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`
6. Paste it back to you (Claude) so you can put it in `.env.local`

### Step 3 — Create .env.local

Copy `.env.example` to `.env.local` in the project root, then fill in the two values the user just gave you:

```bash
cp .env.example .env.local
```

Then edit `.env.local` and set:
- `ANTHROPIC_API_KEY=` to the key from Scott
- `DATABASE_URL=` to the Neon connection string

**Verify `.env.local` is gitignored** before moving on:

```bash
git check-ignore .env.local
```

This should print `.env.local`. If it prints nothing, STOP and investigate — the gitignore is broken and secrets would get committed.

The `ASSEMBLYAI_API_KEY` in the example file is optional. Leave it blank unless the user wants to process audio recordings of group therapy sessions (most people don't need this).

### Step 4 — Install Python dependencies

The project uses Python 3 for the backend. Create a virtual environment and install:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

Tell the user that every time they want to run the backend manually they'll need to `source backend/venv/bin/activate` first — but with `npm run dev` (below), the start script handles that automatically via its own python invocation.

### Step 5 — Install Node dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### Step 6 — Start the app

```bash
npm run dev
```

This starts the backend on port 8001 and the frontend on port 5173. Watch the output for errors:
- If you see `DATABASE_URL environment variable is not set` — the `.env.local` didn't load; check step 3
- If you see `anthropic.AuthenticationError` — the API key is wrong or malformed
- If you see `psycopg2.OperationalError` — the Neon connection string is wrong, or Neon's project hasn't finished spinning up yet (wait 30s and retry)

Once both are running cleanly, open http://localhost:5173 in a browser.

### Step 7 — Complete intake

The app will detect it has no profile and route to the intake flow. The user should:

1. Read the opening question and answer honestly
2. Keep going — the intake takes 10–15 minutes and feels like a conversation
3. When the assistant signals it has enough, a **"Complete intake"** button appears at the top
4. Click it — Claude will generate a structured profile from the conversation (takes ~10 seconds)
5. The app switches to the main chat screen, and every future session will have the profile loaded as context

Encourage the user to be honest during intake. The profile shapes how the therapist engages with them across every future session — shallow intake, shallow future sessions.

### Step 8 — First real session (optional walkthrough)

After intake, help the user start their first real session if they want. Just type what's on their mind. At the end, they can click **"End session"** and the app will:
- Generate a session summary and pattern tags
- Update the living profile with new insights
- Make the session available in the sidebar for future reference

---

## Common issues

**"The backend says DATABASE_URL is not set" even though it's in .env.local**
Make sure the file is named exactly `.env.local` (not `.env.local.txt` on Windows, not `env.local`). Make sure it lives at the project root, not in `backend/`.

**"psycopg2 install fails"**
On Apple Silicon you might need to install postgres headers first: `brew install postgresql`. Then retry `pip install -r requirements.txt`.

**"The intake keeps starting over"**
That means profile saving failed. Check the backend console for the real error — usually a DB permission issue with Neon. Re-run Step 2 and generate a fresh connection string.

**"I want to re-run intake from scratch"**
Call the delete endpoint, then refresh the page:
```bash
curl -X DELETE http://localhost:8001/api/profile/
```

**"I want to update my profile manually later"**
The profile lives in the `user_profile` table in your Neon DB. You can edit it directly in the Neon SQL console. Also, the profile auto-updates at the end of every session based on what was discussed.

---

## Privacy notes

- Your sessions, messages, profile, and documents all live in **your** Neon database. Scott has no access to any of it.
- The only network calls this app makes are to `api.anthropic.com` (for the AI responses) and your Neon database. Nothing is sent anywhere else.
- Anthropic does see your messages (they route through their API), but they don't train on API traffic by default.
- The API key Scott gave you means he sees *aggregate usage and cost* on his Anthropic account, but **he does not see the content of your messages**. Anthropic's console only shows token counts, timestamps, and error logs — not prompts or responses.
- If Scott ever wants to stop paying, he can revoke the key from his Anthropic console, and the app will stop working until you put in your own key.

---

## Architecture at a glance (for Claude Code)

- Backend: FastAPI on port 8001. Entry point: `backend/main.py`. Routers in `backend/routers/`.
- Frontend: Vite + React on port 5173. Entry: `frontend/src/App.tsx`.
- DB schema is created automatically on first backend startup via `backend/database.py::init_db()`.
- The intake flow is gated by `GET /api/profile/status` — if `exists: false`, the frontend renders `IntakeFlow.tsx` instead of `ChatWindow.tsx`.
- The therapeutic system prompt is in `backend/services/claude.py`. The intake prompt is in `backend/services/intake.py`.
- See `CLAUDE.md` for deeper guidance on the codebase.
