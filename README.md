# Secure & Proctored AI Mock Interview Platform

End-to-end web app from the project synopsis: React/Next.js frontend, FastAPI backend, PostgreSQL,
JWT auth, OpenCV + MediaPipe face monitoring, Whisper transcription, Gemini evaluation, browser proctoring.

```
browser (Next.js, TypeScript, Tailwind)
   │  /api/*
   ▼
nginx ──► backend (FastAPI, JWT, SQLAlchemy) ──► PostgreSQL
               │            └──► LLM API (Gemini primary, Groq fallback)
              ▼
          worker (OpenCV + MediaPipe, Whisper)   ← separate container, as in the synopsis
```

## Run it (Docker)

1. `cp .env.example .env` and fill in `SECRET_KEY` and `GEMINI_API_KEY`.
2. `docker compose up --build`  (the first build downloads PyTorch and, on first use, the Whisper model)
3. Open http://localhost

Browsers only allow camera/microphone on `localhost` or HTTPS. If you serve this on another host,
put TLS in front of nginx.

## Run it without Docker (development)

Three terminals, plus a local PostgreSQL:

```bash
# 1. worker (needs ffmpeg installed; use Python 3.11)
cd worker && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --port 8001

# 2. backend
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg2://USER:PASS@localhost:5432/mockinterview
export SECRET_KEY=$(openssl rand -hex 32) GEMINI_API_KEY=your-key WORKER_URL=http://localhost:8001
uvicorn app.main:app --port 8000

# 3. frontend (proxies /api to localhost:8000)
cd frontend && corepack pnpm install && corepack pnpm dev   # http://localhost:3000
```

Tables are created automatically on backend start.

## Tests
```bash
cd backend && pytest
cd frontend && corepack pnpm test      # vitest: auth/api contract + provider
```

25 backend tests cover registration/login (TC01, TC02), JWT protection, device-check gating (TC03), multiple-face
and tab-switch events (TC04, TC05), answer submission (TC06), full session to stored report (TC07),
scoring maths and per-user data isolation. Gemini and the worker are mocked in these tests. The frontend
suite (`corepack pnpm test`) covers the bearer-token API layer and the auth provider.

## How it maps to the synopsis

| Synopsis module | Where |
| --- | --- |
| Authentication | `backend/app/routers/auth.py`, `security.py` (bcrypt, JWT with expiry) |
| Interview engine | `backend/app/routers/interviews.py`, `frontend/app/interview/[id]` |
| AI question and answer analysis | `backend/app/services/gemini.py` (Gemini primary, Groq fallback) |
| Computer vision | `worker/app/vision.py` (MediaPipe Face Mesh: face count + head orientation) |
| Speech analysis | `worker/app/speech.py` (Whisper), `backend/app/services/scoring.py` (rate, fillers) |
| Proctoring engine | `frontend/hooks/useProctoring.ts`, `backend/app/services/proctoring.py` |
| Report and analytics | `scoring.aggregate_scores`, `frontend/app/report/[id]` |
| Database | `backend/app/models.py` (USERS, INTERVIEWS, QUESTIONS, RESPONSES, PROCTORING_EVENTS, REPORTS) |

Scoring (Chapter 12): Answer Quality = mean of Gemini relevance and completeness; Response Structure from Gemini;
Speech Fluency = pace band (110-170 wpm) and filler frequency, plus a small consistency term; Gaze/Attention = share of
analysed frames with exactly one face facing the camera; Overall = weighted average (0.4 / 0.2 / 0.2 / 0.2).
Weights live in `backend/app/constants.py`. Proctoring is reported separately as an event count and indicator.

## Differences from the documents (please review)

- **Extra columns.** Three JSON columns (`responses.evaluation`, `responses.vision_stats`, `reports.details`)
  and two bookkeeping columns (`interviews.created_at`, `interviews.face_state`). The synopsis schema has no place
  for per-answer structure scores, frame counts, or debounced face events.
- **Session timer.** Each answer is limited to 2 minutes (auto-stops). The session clock is shown but there is no
  whole-session cut-off.
- **All five questions must be answered** before the report is generated.
- **Token storage.** The JWT is kept in `localStorage` and sent as a Bearer header. An httpOnly cookie would be
  safer against XSS but needs CSRF handling; say if you want that.
- **Encryption at rest** (Chapter 11) is not done in application code. Use an encrypted disk/volume or managed
  PostgreSQL for that.
- **Frames are not stored.** Webcam frames are analysed and discarded, and audio is deleted after transcription.
- **Gemini model name** defaults to `gemini-flash-latest`. Check it against AI Studio and set `GEMINI_MODEL`.
- **LLM fallback.** Question generation and answer evaluation try Gemini first, then Groq, when `GROQ_API_KEY`
  is set (`GROQ_MODEL` defaults to `openai/gpt-oss-120b`). Each provider is retried once before falling
  back, and both are prompted to return JSON only. With only `GEMINI_API_KEY` set, behaviour is unchanged.

## Not verified yet

The sandbox this was built in had no camera, microphone, or GPU, so these are untested end to end:
Whisper transcription of real browser audio and MediaPipe on a real face (the head-orientation thresholds
in `worker/app/vision.py` may need tuning for your camera). The backend tests, the frontend build/typecheck/lint
and vitest suite, the full Docker build, and the running stack (nginx → backend → PostgreSQL → worker health)
have all been exercised.
