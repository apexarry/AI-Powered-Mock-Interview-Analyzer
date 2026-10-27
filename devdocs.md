# Secure & Proctored AI Mock Interview Platform

**Implementation Documentation and Synopsis Conformance Report**

| | |
| --- | --- |
| **Project title** | Secure & Proctored AI-Powered Mock Interview and Performance Evaluation Platform |
| **Working product name** | `signal` |
| **Repository root** | `mock-interview-platform/` |
| **Source documents** | `Project_Synopsis_AI_Mock_Interview_Platform.docx` (17 chapters), `Revised_Secure_Proctored_AI_Mock_Interview_Proposal.pdf` |
| **Document scope** | Every file in the repository, cross-referenced against the synopsis requirements |
| **Status** | Implementation complete and documented; not a git repository at the time of writing |

This document has two parts. **Part A** documents the system as it is actually built: architecture, data model, every API route, the scoring and proctoring algorithms, deployment topology and test coverage. **Part B** maps the implementation back to the synopsis chapter by chapter, with a requirements traceability matrix that records, for each stated requirement, where it is implemented and which test demonstrates it.

Every behavioural claim in this document is traceable to a source file and line. Section numbers in the form `file.py:120` refer to that file at that line in the current tree.

---

## Table of contents

**Part A — System documentation**

1. [Overview](#1-overview)
2. [System architecture](#2-system-architecture)
3. [Repository layout](#3-repository-layout)
4. [Backend (FastAPI)](#4-backend-fastapi)
5. [Worker (computer vision and speech)](#5-worker-computer-vision-and-speech)
6. [Frontend (Next.js)](#6-frontend-nextjs)
7. [Scoring and evaluation methodology](#7-scoring-and-evaluation-methodology)
8. [Proctoring and integrity model](#8-proctoring-and-integrity-model)
9. [Deployment and operations](#9-deployment-and-operations)
10. [Testing](#10-testing)
11. [Security and data-handling posture](#11-security-and-data-handling-posture)

**Part B — Synopsis conformance**

12. [Chapter-by-chapter mapping](#12-chapter-by-chapter-mapping)
13. [Requirements traceability matrix](#13-requirements-traceability-matrix)
14. [Test-case conformance](#14-test-case-conformance)
15. [MVP scope and future scope status](#15-mvp-scope-and-future-scope-status)
16. [Documented deviations from the synopsis](#16-documented-deviations-from-the-synopsis)
17. [Glossary](#17-glossary)

---

# Part A — System documentation

## 1. Overview

### 1.1 What the platform does

The platform is a browser-based mock interview tool. A candidate registers, selects an interview role and difficulty, passes a camera/microphone/face device check, then answers five spoken questions in a fullscreen proctored session. The system transcribes each spoken answer, evaluates it with a generative LLM, measures speech delivery, monitors session integrity through browser APIs and webcam face analysis, and produces a persistently stored performance report.

The product framing is deliberately coaching-oriented rather than punitive. The interface states what is monitored and shows the candidate their own proctoring log rather than blocking them, and the proctoring summary is reported *beside* the performance score, never folded into it.

### 1.2 End-to-end session flow

```
 1. Register / login            POST /api/auth/register | /api/auth/login
        │                       → JWT (HS256, 120 min default expiry)
        ▼
 2. Configure session           GET  /api/interviews/options
                               POST /api/interviews          → 5 questions generated
        ▼
 3. Device check                POST /api/interviews/{id}/device-check
                               (1 frame → worker → face count + head orientation)
        ▼
 4. Start                       POST /api/interviews/{id}/start      → status in_progress
        ▼
 5. Answer loop (×5)            POST /api/interviews/{id}/frames          every 2 s
                               POST /api/interviews/{id}/events         on browser events
                               POST /api/interviews/{id}/questions/{qid}/answer
        ▼
 6. Complete                    POST /api/interviews/{id}/complete       → ReportOut
        ▼
 7. Report                      GET  /api/interviews/{id}/report
```

### 1.3 Code metrics

Measured across the repository, excluding `node_modules`, `.next`, `.venv` and `__pycache__`:

| Area | Files | Lines |
| --- | ---: | ---: |
| `backend/app` | 17 | 1,052 |
| `backend/tests` | 6 | 384 |
| `worker/app` | 4 | 105 |
| `frontend/app` | 16 | 1,947 |
| `frontend/components` | 8 | 436 |
| `frontend/hooks` | 4 | 221 |
| `frontend/lib` | 7 | 316 |

---

## 2. System architecture

### 2.1 Deployment topology

The synopsis specifies a layered architecture (Ch. 7.1) with independently deployable services (NFR5). The implementation is realised as five containers behind an nginx reverse proxy.

```
                    ┌───────────────────────────┐
   browser  ──────► │  nginx  :80               │
   (Next.js)        │  /api/*  → backend:8000   │
                    │  /*      → frontend:3000  │
                    └────────────┬──────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              ▼                                     ▼
   ┌────────────────────┐                ┌────────────────────┐
   │ frontend :3000     │                │ backend :8000      │
   │ Next.js 16 (SSR)   │                │ FastAPI            │
   │ React 19 client    │                │ SQLAlchemy ORM     │
   └────────────────────┘                └──────┬──────┬──────┘
                                                 │      │
                          ┌──────────────────────┘      └───────────────┐
                          ▼                                             ▼
              ┌────────────────────┐                    ┌─────────────────────┐
              │ db :5432           │                    │ worker :8001        │
              │ PostgreSQL 16      │                    │ OpenCV + MediaPipe  │
              │ volume: pgdata     │                    │ Whisper (PyTorch)   │
              └────────────────────┘                    └─────────────────────┘
                                                                  │
                                                                  ▼
                                                  ┌───────────────────────────┐
                                                  │ External LLM providers    │
                                                  │ Gemini API (primary)     │
                                                  │ Groq API (fallback)      │
                                                  └───────────────────────────┘
```

The frontend calls the backend through a Next.js rewrite rather than by contacting the API directly from the browser. `frontend/next.config.mjs:8-10` rewrites `/api/:path*` to `${BACKEND_URL}/api/:path*`, where `BACKEND_URL` is `http://backend:8000` in Compose and `http://localhost:8000` in development. This keeps the API same-origin for the browser, so no CORS configuration is required and the `Authorization` header is never a third-party request.

### 2.2 Service inventory

| Service | Image / build | Port | Persistent volume | Health check | Depends on |
| --- | --- | ---: | --- | --- | --- |
| `db` | `postgres:16-alpine` | 5432 | `pgdata:/var/lib/postgresql/data` | `pg_isready` every 5 s, 10 retries (`docker-compose.yml:10-12`) | — |
| `worker` | `./worker` (Python 3.11-slim) | 8001 | `whisper_cache:/root/.cache/whisper` | `/health` endpoint exposed; Compose uses `service_started` | — |
| `backend` | `./backend` (Python 3.11-slim) | 8000 | none | `/api/health` | `db` (healthy), `worker` (started) |
| `frontend` | `./frontend` (Node 20-alpine, 3 stages) | 3000 | none | none defined | `backend` |
| `nginx` | `nginx:1.27-alpine` | 80 | none | none defined | `frontend`, `backend` |

The worker volume exists so the Whisper model download (`WHISPER_MODEL`, default `base`) is cached between container restarts rather than re-fetched on every run.

### 2.3 Request flow per operation

**Interview creation** — `backend/app/routers/interviews.py:208-242`
The client sends role and difficulty. The server validates both against the constant lists (`constants.py:1-9`), calls `gemini.generate_questions()` to obtain five questions, then writes one `Interview` row, five `Question` rows and five placeholder `Response` rows in a single transaction. A placeholder response is created per question so that the response primary key order matches the question order; `answered` is derived from `responses.transcript IS NULL` (`interviews.py:100`).

**Device check** — `interviews.py:263-282`
One JPEG frame is uploaded. The backend forwards it to the worker and applies three gates: exactly one face must be present, and the head must be front-facing. A pass moves the interview from `created` to `ready`. A failure returns HTTP 200 with `ok: false` and a user-facing message — the request itself did not error, the check simply did not pass.

**Per-frame proctoring** — `interviews.py:297-330`
Each frame is forwarded to the worker for face analysis. The result is used twice: to increment the per-question frame counters (`frames`, `attentive`), and to drive the debounced face-state machine. A proctoring event is only written when the state machine emits a transition.

**Answer submission** — `interviews.py:349-418`
The audio blob is uploaded to the backend, forwarded to the worker for Whisper transcription, then scored locally for speech metrics. If the transcript contains fewer than `MIN_ANSWER_WORDS` (default 3) words, the answer is marked as "no clear speech" and the LLM is not called. Otherwise the transcript is sent to the LLM for evaluation, and the response row is updated with the transcript, duration, speaking rate, filler count, answer score and the full evaluation JSON.

**Report generation** — `interviews.py:421-470`
Completion requires every question to have been answered (`interviews.py:430-431`). The server aggregates per-answer rows into the four component scores, summarises the proctoring events, and writes a single `Report` row. The endpoint is idempotent: calling it again on a completed interview returns the stored report without recomputation (`interviews.py:424-426`).

### 2.4 Timeout behaviour

Three timeouts are set deliberately:

| Setting | Value | Where | Reason |
| --- | --- | --- | --- |
| nginx read/send timeout | 300 s | `nginx/nginx.conf:12-13` | CPU-bound Whisper transcription of a 2-minute answer can be slow on a weak machine |
| Worker client timeout | 300 s read, 5 s connect | `backend/app/services/worker_client.py:10` | Same reason, with a fast failure if the worker is down |
| Groq request timeout | 60 s | `backend/app/services/gemini.py:63` | LLM calls should not hold a request open indefinitely |

---

## 3. Repository layout

```
mock-interview-platform/
├── .env                          Local secrets (gitignored). Never committed.
├── .gitignore                    .env, __pycache__, node_modules, .next
├── docker-compose.yml            Five-service orchestration
├── README.md                     Run instructions, synopsis mapping, known deviations
├── devdocs.md                    This document
│
├── backend/                      FastAPI application
│   ├── Dockerfile                python:3.11-slim, uvicorn on :8000
│   ├── requirements.txt          14 pinned dependencies
│   ├── app/
│   │   ├── main.py               App factory, lifespan, /api router mount
│   │   ├── config.py             Pydantic Settings, env loading
│   │   ├── constants.py          Roles, difficulties, event types, severity, weights
│   │   ├── database.py           Engine, session factory, Base, get_db
│   │   ├── models.py             Six SQLAlchemy tables
│   │   ├── schemas.py            Pydantic request/response models
│   │   ├── security.py           bcrypt hashing, JWT issue/verify
│   │   ├── deps.py               get_current_user dependency
│   │   ├── routers/
│   │   │   ├── auth.py           Register, login, me
│   │   │   └── interviews.py     All 10 interview routes
│   │   └── services/
│   │       ├── gemini.py         LLM client, provider fallback, JSON parsing
│   │       ├── proctoring.py     Face-state debounce, integrity summary
│   │       ├── scoring.py        Speech metrics, score aggregation
│   │       └── worker_client.py  HTTP client for the CV/speech worker
│   └── tests/                    35 pytest tests (SQLite, external services mocked)
│
├── worker/                       Computer-vision and speech service
│   ├── Dockerfile                Python 3.11 + ffmpeg + libgl1 + libglib2.0-0
│   ├── requirements.txt          torch (CPU), openai-whisper, mediapipe, opencv
│   └── app/
│       ├── main.py               /health, /analyze-frame, /transcribe
│       ├── vision.py             MediaPipe Face Mesh analysis
│       └── speech.py             Whisper transcription
│
├── frontend/                     Next.js 16 App Router application
│   ├── Dockerfile                3-stage: deps → builder → standalone runner
│   ├── package.json              pnpm 9.15.4, scripts: dev/build/start/lint/typecheck/test
│   ├── next.config.mjs           standalone output, /api rewrite proxy
│   ├── vitest.config.ts          jsdom environment, @ alias
│   ├── eslint.config.mjs         eslint-config-next core-web-vitals + typescript
│   ├── app/
│   │   ├── layout.tsx            Root layout, providers, metadata
│   │   ├── page.tsx              Public landing page
│   │   ├── login/ register/      Guest-only
│   │   ├── dashboard/ history/   RequireAuth
│   │   ├── profile/ setup/       RequireAuth
│   │   ├── interview/[id]/       The live session (603 lines, the core screen)
│   │   ├── processing/[id]/      Completion + progress screen
│   │   ├── report/ report/[id]/  Static demo report, and the real report
│   │   └── error/ loading/ not-found/
│   ├── components/               auth-provider, require-auth, page-shell, theme-provider, ui/
│   ├── hooks/                    useMediaStream, useMicLevel, useRecorder, useProctoring
│   └── lib/                      api.ts, auth.ts, types.ts, capture.ts, utils.ts
│
└── nginx/nginx.conf              Reverse proxy: /api → backend, / → frontend
```

---

## 4. Backend (FastAPI)

### 4.1 Application assembly

`backend/app/main.py` builds the app in three steps:

- A `lifespan` context manager calls `Base.metadata.create_all(bind=engine)` on startup (`main.py:9-12`), so tables are created automatically on first run. There is no migration tool in the project; schema changes are applied by adding or altering the model and restarting.
- Two routers are mounted under a shared `/api` prefix: `auth.router` and `interviews.router` (`main.py:17-19`).
- `GET /api/health` returns `{"status": "ok"}` (`main.py:22-24`). It is the only route that requires no authentication and touches no data.

### 4.2 Configuration

`backend/app/config.py` defines a `Settings` class based on `pydantic_settings.BaseSettings`, reading from a `.env` file in the working directory with `extra="ignore"` so unrelated environment variables do not break startup (`config.py:22`).

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+psycopg2://postgres:postgres@localhost:5432/mockinterview` | SQLAlchemy connection string |
| `SECRET_KEY` | `change-me-in-env` | HMAC key for signing JWTs |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `120` | Token lifetime |
| `GEMINI_API_KEY` | *(empty)* | Primary LLM provider key |
| `GEMINI_MODEL` | `gemini-flash-latest` | Primary model name |
| `GROQ_API_KEY` | *(empty)* | Fallback provider key |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Fallback model name |
| `WORKER_URL` | `http://localhost:8001` | Base URL of the CV/speech worker |
| `QUESTIONS_PER_INTERVIEW` | `5` | Questions generated per session |
| `MIN_ANSWER_WORDS` | `3` | Below this, an answer is treated as no clear speech |

If `SECRET_KEY` is left at its default, a warning is logged at import time (`config.py:27-28`).

The Compose file additionally consumes `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` to build the backend's `DATABASE_URL` (`docker-compose.yml:26`), and `WHISPER_MODEL` for the worker (`docker-compose.yml:19`).

### 4.3 Data model

Six tables, matching the synopsis Ch. 10 schema.

```
users ──1:N──► interviews ──1:N──► responses ──N:1──► questions
                    │  ▲                 │
                    │  └──1:N───────────┘
                    ├──1:N──► proctoring_events
                    └──1:1──► reports
```

| Table | Columns |
| --- | --- |
| `users` | `user_id` (PK), `name` String(100), `email` String(255) unique + indexed, `password_hash` String(255), `role` String(30) default `candidate`, `created_at` timestamptz |
| `interviews` | `interview_id` (PK), `user_id` (FK → `users`), `role` String(60), `difficulty` String(20), `status` String(20) default `created`, `start_time`, `end_time`, `created_at`, `face_state` String(20) default `ok` |
| `questions` | `question_id` (PK), `role` String(60), `difficulty` String(20), `category` String(30), `question_text` Text |
| `responses` | `response_id` (PK), `interview_id` (FK, indexed), `question_id` (FK), `transcript` Text nullable, `speaking_rate` Float, `filler_count` Integer, `duration_sec` Float, `answer_score` Float, `evaluation` JSON, `vision_stats` JSON |
| `proctoring_events` | `event_id` (PK), `interview_id` (FK, indexed), `event_type` String(30), `severity` String(10), `timestamp` timestamptz |
| `reports` | `report_id` (PK), `interview_id` (FK, unique), `answer_quality`, `speech_fluency`, `response_structure`, `gaze_attention` (nullable), `overall_score`, `integrity_summary` JSON, `details` JSON |

Three design points are worth recording because they are not obvious from the column names:

- **`responses.transcript IS NULL` means "unanswered."** This is the single source of truth for question progress, used by the API to derive `answered` (`interviews.py:100`) and by the frame counter to identify the question currently being answered (`interviews.py:312-317`).
- **`responses.vision_stats` holds `{"frames": n, "attentive": n}`** and is the per-question input to the gaze/attention score. It is initialised to `{"frames": 0, "attentive": 0}` at interview creation (`interviews.py:238`).
- **`interviews.face_state` stores the debounce state** for the whole session, so the face-state machine persists across frame requests instead of being re-derived each time.

Five columns exist beyond the synopsis Ch. 10 schema: `interviews.created_at`, `interviews.face_state`, `responses.evaluation`, `responses.vision_stats`, `reports.details`. These are recorded in [Section 16](#16-documented-deviations-from-the-synopsis).

### 4.4 Authentication

Implemented across `backend/app/security.py` and `backend/app/deps.py`.

**Password hashing** — bcrypt with a per-password salt (`security.py:13-14`). The 72-byte bcrypt input limit is enforced at the schema layer (`schemas.py:20-25`), because bcrypt silently truncates beyond 72 bytes and the platform prefers to reject the request instead.

**Login timing** — `verify_password` compares against a pre-computed dummy hash when the email is unknown or no hash is supplied (`security.py:10`, `security.py:17-23`). This makes an unknown-email login cost the same as a wrong-password login, so response timing does not reveal whether an account exists. `test_login_unknown_email_same_error` (`backend/tests/test_auth.py:17-19`) asserts both return 401 with the same message.

**Token** — HS256 JWT carrying `sub` (user id), `iat` and `exp` (`security.py:26-33`). Default lifetime is 120 minutes. Decoding failures of any kind — bad signature, expiry, missing claim, non-integer subject — return `None` rather than raising (`security.py:36-41`).

**Enforcement** — `get_current_user` (`deps.py:12-29`) is a FastAPI dependency that reads the `Authorization: Bearer` header, decodes the token, loads the user, and raises `401` with a `WWW-Authenticate: Bearer` header if any step fails. `HTTPBearer(auto_error=False)` is used so the application controls the error shape.

**Registration** — the email is lowercased before the uniqueness check and before storage (`routers/auth.py:17-19`), and the uniqueness constraint is caught as an `IntegrityError` to handle two simultaneous registrations of the same address (`auth.py:24-26`).

### 4.5 Interview state machine

```
        create_interview
              │
              ▼
          ┌────────┐  device-check passes  ┌────────┐
          │created │ ────────────────────► │ ready  │
          └────────┘                       └────────┘
              │                                │ start
              │ abandon                         ▼
              │                          ┌─────────────┐
              │                          │ in_progress │
              │                          └─────────────┘
              │                            │        │
              │  abandon                   │        │ complete
              ▼                            ▼        ▼
          ┌──────────┐              ┌──────────┐
          │ abandoned │              │ completed│
          └──────────┘              └──────────┘
```

Status is enforced server-side on every mutating route through `_require_status` (`interviews.py:53-58`), which returns HTTP 409 when the current status is not in the allowed set. Specific transitions:

| Route | Allowed from | Rejects |
| --- | --- | --- |
| `POST /device-check` | `created`, `ready` | 409 otherwise |
| `POST /start` | `ready` only | 409 with "Complete the device check before starting." |
| `POST /frames` | `in_progress` only | 409 otherwise |
| `POST /events` | `in_progress` only | 409 otherwise |
| `POST /questions/{qid}/answer` | `in_progress` only | 409 otherwise |
| `POST /complete` | `in_progress` (or `completed`, idempotent) | 409 otherwise, 400 if any question is unanswered |
| `POST /abandon` | any non-completed status | 400 if already completed |

### 4.6 API reference

All routes are under `/api`. All routes except `GET /api/health`, `POST /api/auth/register` and `POST /api/auth/login` require `Authorization: Bearer <jwt>`.

**Authentication**

| Method | Path | Request | Success | Notable errors |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/register` | JSON `{name, email, password}` | `201` `{access_token, token_type, user}` | `409` email in use; `422` invalid email, name blank, password < 8 chars or > 72 bytes |
| `POST` | `/auth/login` | JSON `{email, password}` | `200` `{access_token, token_type, user}` | `401` incorrect email or password |
| `GET` | `/auth/me` | — | `200` `{user_id, name, email}` | `401` missing/invalid token |

**Interviews**

| Method | Path | Request | Success | Notable errors |
| --- | --- | --- | --- | --- |
| `GET` | `/interviews/options` | — | `200` `{roles[], difficulties[], questions_per_interview}` | `401` |
| `GET` | `/interviews` | — | `200` `[InterviewSummary]` (own sessions only, newest first) | `401` |
| `POST` | `/interviews` | JSON `{role, difficulty}` | `201` `InterviewOut` with 5 questions | `422` unknown role/difficulty; `502` LLM unavailable |
| `GET` | `/interviews/{id}` | — | `200` `InterviewOut` | `404` not yours or does not exist |
| `POST` | `/interviews/{id}/abandon` | — | `200` `InterviewOut` (status `abandoned`) | `400` already completed |
| `POST` | `/interviews/{id}/device-check` | multipart `image` (≤ 2 MB) | `200` `{ok, face_count, message}` | `409` wrong status; `413` file too large; `503` worker unreachable |
| `POST` | `/interviews/{id}/start` | — | `200` `InterviewOut` (status `in_progress`, `start_time` set) | `409` device check not passed |
| `POST` | `/interviews/{id}/frames` | multipart `image` (≤ 2 MB) | `200` `{face_count, attentive, event_logged}` | `409` wrong status; `503` worker unreachable |
| `POST` | `/interviews/{id}/events` | JSON `{event_type}` | `201` `{event_type, severity, timestamp}` | `422` unknown event type; `409` wrong status |
| `POST` | `/interviews/{id}/questions/{qid}/answer` | multipart `audio` (≤ 20 MB) | `200` `AnswerOut` | `404` question not in session; `409` already answered or wrong status; `503` worker unreachable; `502` LLM unavailable |
| `POST` | `/interviews/{id}/complete` | — | `200` `ReportOut` | `400` unanswered questions; `409` wrong status |
| `GET` | `/interviews/{id}/report` | — | `200` `ReportOut` | `404` not completed or not yours |

**Data isolation.** `_get_interview` (`interviews.py:46-50`) loads the interview and compares `interview.user_id` to the authenticated user, returning 404 — not 403 — when they differ. The same helper guards every interview-scoped route, so a user cannot observe the existence of another user's sessions. `test_interviews_are_private_to_their_owner` (`backend/tests/test_interview_flow.py:149-155`) verifies this across a read, a write and the list endpoint.

**Upload limits.** `_read_upload` (`interviews.py:71-77`) reads `limit + 1` bytes, so it detects over-limit files without loading them fully into memory, and returns 413 for oversize and 400 for empty.

### 4.7 LLM integration

`backend/app/services/gemini.py` implements provider selection, retries and response validation.

**Provider order.** `_providers()` (`gemini.py:70-77`) returns the configured providers in priority order: Gemini if `GEMINI_API_KEY` is set, then Groq if `GROQ_API_KEY` is set. If neither is configured, `LLMError` is raised with an actionable message (`gemini.py:84`).

**Retry and fallback.** `_complete_json` (`gemini.py:80-95`) tries each provider twice — one initial attempt plus one retry — and moves to the next provider only after both attempts fail. A failure is anything raised by the SDK, by `httpx`, or by the response parser, so malformed JSON from a provider is treated the same as a network error. The final error message names every provider that was tried and why (`gemini.py:95`).

**Response cleaning.** `_clean_json` (`gemini.py:33-36`) strips a surrounding ```` ```json ```` or ```` ``` ```` fence and then parses. Gemini is additionally instructed to return JSON via `response_mime_type="application/json"` and Groq via a system message (`gemini.py:46`, `gemini.py:58`).

**Gemini client.** The `google.genai` client is created lazily and cached behind a module-level lock (`gemini.py:19-30`), so the SDK client is constructed once per process.

**Validation.** Responses are clamped and normalised rather than trusted:

- `_parse_questions` (`gemini.py:98-113`) requires a JSON array, drops non-object entries, strips text, maps unknown categories to `technical`, and **raises if fewer than the requested number of usable questions are returned** — a short response is treated as a provider failure and triggers the retry/fallback path rather than producing a short interview.
- `_parse_evaluation` (`gemini.py:142-152`) clamps each score into 0–100 and rounds it, trims the feedback string, and caps `strengths` and `improvements` at three items each.

**Prompt design.** The evaluation prompt (`gemini.py:155-179`) wraps the transcript in explicit `<<<TRANSCRIPT ... TRANSCRIPT>>>` markers and instructs the model to treat it strictly as data and to ignore any instructions inside it. The same prompt tells the model not to judge personality or confidence and not to penalise single mis-heard words, both of which the synopsis Ch. 12 explicitly rules out. The generation prompt (`gemini.py:116-126`) requests a mix of categories, requires at least one behavioural question, restricts the "HR / Behavioural" role to behavioural and situational questions, and asks for questions answerable in one to two minutes — matching the platform's two-minute answer limit.

### 4.8 Worker client

`backend/app/services/worker_client.py` is a thin, synchronous `httpx` wrapper with a module-level client (`worker_client.py:10`). It converts transport errors and non-200 responses into a single `WorkerError` exception type, which the routers translate into HTTP 503 (`interviews.py:80-85`, `interviews.py:373-374`). This keeps transport concerns out of the router layer and gives one place to adjust the timeout.

---

## 5. Worker (computer vision and speech)

The worker is a separate FastAPI service on port 8001. It has no database access, no authentication and no persistent state beyond the loaded models — it is a pure function service over uploaded bytes.

### 5.1 Endpoints

| Method | Path | Input | Output | Errors |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | — | `{"status": "ok"}` | — |
| `POST` | `/analyze-frame` | multipart `file` (≤ 25 MB) | `{"face_count": int, "frontal": bool}` | `422` if the image cannot be decoded |
| `POST` | `/transcribe` | multipart `file` (≤ 25 MB) | `{"text": str, "duration_sec": float}` | `422` if the audio cannot be decoded |

Both heavy modules are imported lazily inside the request handler (`worker/app/main.py:18`, `worker/app/main.py:31`) so that the container starts even before the OpenCV/Whisper stack is resident in memory, and so an import failure surfaces as a request error rather than a crash loop.

### 5.2 Face analysis

`worker/app/vision.py` uses MediaPipe Face Mesh.

**Configuration** (`vision.py:22-27`):

| Parameter | Value | Effect |
| --- | --- | --- |
| `static_image_mode` | `True` | Treats each frame as an independent still image; no temporal tracking |
| `max_num_faces` | `4` | Up to four faces are detected, so a group of three is still reported as "multiple" |
| `refine_landmarks` | `False` | Skips the 468-point refinement pass — the four landmarks used here do not need it |
| `min_detection_confidence` | `0.5` | Minimum detector confidence |

**Landmarks** (`vision.py:12`): nose tip `1`, left eye outer corner `33`, right eye outer corner `263`, chin `152`.

**Head orientation** (`vision.py:31-42`). Two normalised ratios are computed:

```
eye_span = |right_eye.x − left_eye.x|
yaw      = (nose.x − min(left_eye.x, right_eye.x)) / eye_span
face_h   = chin.y − mean(left_eye.y, right_eye.y)
pitch    = (nose.y − eye_y) / face_h
```

A face is considered front-facing when `0.35 ≤ yaw ≤ 0.65` **and** `0.25 ≤ pitch ≤ 0.75` (`vision.py:15-16`). The nominal centred value is `yaw = 0.5`. Both ratios are scale-invariant, so the check is independent of how far the candidate sits from the camera. Degenerate geometry (zero eye span or zero face height) returns "not frontal" rather than raising.

`frontal` is only true when exactly one face is present (`vision.py:54`), because "facing the camera" is not meaningful for a frame with several people.

**Thread safety.** MediaPipe graph instances are not thread-safe, so `process()` is called under a module-level lock (`vision.py:51-52`). The model itself is created lazily on first use.

### 5.3 Speech transcription

`worker/app/speech.py` runs OpenAI Whisper locally.

**Model loading.** `_get_model()` (`speech.py:17-21`) loads the model named by `WHISPER_MODEL` (default `base`) on first use and caches it. The Compose file mounts a volume at `/root/.cache/whisper` so the download survives restarts.

**Decoding.** The uploaded bytes are written to a temporary file with the original suffix, then `whisper.load_audio()` decodes it through ffmpeg to 16 kHz mono float32 (`speech.py:24-30`). Using a file rather than a buffer is required because ffmpeg needs a seekable source for browser-produced WebM.

**Duration.** Derived from the decoded sample count: `len(audio) / whisper.audio.SAMPLE_RATE` (`speech.py:30`).

**Short audio.** Recordings shorter than 0.5 seconds return an empty transcript immediately, with the duration still reported (`speech.py:31-32`).

**Silence filtering.** Segments whose `no_speech_prob` exceeds `0.6` are dropped (`speech.py:11`, `speech.py:37-41`). This is what prevents Whisper from hallucinating text into silent passages, which would otherwise inflate the word count and distort the speaking rate.

**Transcription options** (`speech.py:34-36`): `language="en"` fixes the language, `fp16=False` because CPU inference has no float16 path, and `condition_on_previous_text=False` prevents the model from being biased by its own prior output.

**Thread safety.** A module-level lock serialises transcriptions (`speech.py:33`), so one worker process handles one transcription at a time. This is the main reason the worker is a separate service: it can be replicated horizontally instead of being widened.

---

## 6. Frontend (Next.js)

### 6.1 Framework configuration

`frontend/next.config.mjs` sets `output: "standalone"` for the container build, `reactStrictMode: true`, unoptimised images, and the `/api` rewrite described in [Section 2.1](#21-deployment-topology).

`frontend/package.json` pins the toolchain: Next.js 16.3.0, React 19, TypeScript 5.7.3, Tailwind CSS 4.3.3 via `@tailwindcss/postcss`, `@base-ui/react` 1.5.0 for primitives, `shadcn` 4.8.0, `lucide-react` for icons, and `class-variance-authority` + `clsx` + `tailwind-merge` for styling. The package manager is pinned to `pnpm@9.15.4`, and a `pnpm.overrides` block pins `hono` to `4.12.25`.

### 6.2 Route map

| Route | File | Guard | Purpose |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | public | Marketing landing page with a sample report preview |
| `/login` | `app/login/page.tsx` | `GuestOnly` | Sign in |
| `/register` | `app/register/page.tsx` | `GuestOnly` | Create account |
| `/dashboard` | `app/dashboard/page.tsx` | `RequireAuth` | Stats, recent sessions, start new interview |
| `/history` | `app/history/page.tsx` | `RequireAuth` | Full session table |
| `/profile` | `app/profile/page.tsx` | `RequireAuth` | Account details (read-only) |
| `/setup` | `app/setup/page.tsx` | `RequireAuth` | Role and difficulty selection |
| `/interview/[id]` | `app/interview/[id]/page.tsx` | `RequireAuth` | Device check and live session |
| `/processing/[id]` | `app/processing/[id]/page.tsx` | `RequireAuth` | Completion request and progress |
| `/report` | `app/report/page.tsx` | public | Static demonstration report |
| `/report/[id]` | `app/report/[id]/page.tsx` | `RequireAuth` | The candidate's real report |

`app/error.tsx`, `app/loading.tsx` and `app/not-found.tsx` provide the global error, loading and 404 boundaries.

**Route guards** are implemented in `frontend/components/require-auth.tsx`. `RequireAuth` redirects to `/login` when the user is not authenticated; `GuestOnly` redirects to `/dashboard` when they are. Both render a spinner while `loading` is true, so no protected content ever flashes before the session is resolved.

### 6.3 Authentication flow

**Token storage.** The JWT is kept in `localStorage` under the key `mock-interview-token` (`frontend/lib/api.ts:1`, `api.ts:13-18`).

**The API helper.** `api<T>(path, options)` (`api.ts:47-81`) is the single network entry point for the whole application:

- Prefixes the path with `/api`.
- Attaches `Authorization: Bearer <token>` when a token is present.
- Accepts either a JSON body or a `FormData` upload; for `FormData` no `Content-Type` header is set, so the browser supplies the multipart boundary.
- Defaults the method to `POST` when a body is present, otherwise `GET`.
- Converts a network failure into `ApiError(0, "Could not reach the server…")`.
- On a 401 with a token present, clears the token and dispatches a window `auth:expired` event.
- Throws `ApiError` carrying the backend's `detail` string. FastAPI validation errors (a list of `{loc, msg}` objects) are flattened into `"field: message"` form (`api.ts:20-31`).

**The provider.** `frontend/components/auth-provider.tsx` exposes `{user, loading, login, register, logout}` through context. On mount it calls `fetchMe()` to restore the session from a stored token; on failure it clears the token (`auth-provider.tsx:24-39`). It listens for `auth:expired` and redirects to `/login` (`auth-provider.tsx:41-48`). `useAuth()` throws if called outside the provider, so a mis-wired tree fails loudly rather than silently.

**Provider composition** (`app/layout.tsx:43-52`): `ThemeProvider` → `AuthProvider` → page content. Vercel Analytics is mounted only in production (`layout.tsx:48`).

### 6.4 Hooks

| Hook | File | Responsibility |
| --- | --- | --- |
| `useMediaStream` | `hooks/useMediaStream.ts` | Acquires and releases camera/microphone; detects mid-session track loss |
| `useMicLevel` | `hooks/useMicLevel.ts` | Live microphone level and a "speech heard" latch |
| `useRecorder` | `hooks/useRecorder.ts` | Records one answer at a time as a `MediaRecorder` blob |
| `useProctoring` | `hooks/useProctoring.ts` | Browser proctoring events and periodic frame upload |

**`useMediaStream`** requests `getUserMedia` with ideal 640×480 video at `facingMode: "user"` and echo-cancelled, noise-suppressed audio (`useMediaStream.ts:31-34`). It maps `DOMException` names to human-readable messages for `NotAllowedError`, `NotFoundError` and `NotReadableError` (`useMediaStream.ts:5-11`). It listens for the `ended` event on every track and sets a `lost` flag when the camera or microphone is unplugged or revoked mid-session (`useMediaStream.ts:46-52`), which drives the reconnect banner. Tracks are stopped on unmount (`useMediaStream.ts:54`).

**`useMicLevel`** creates an `AudioContext` with an `AnalyserNode` (`fftSize = 512`) and samples RMS amplitude every 100 ms (`useMicLevel.ts:18-32`). The level is scaled by 6 and clamped to 1. A latch sets `heard` once the scaled level exceeds 0.15 (`useMicLevel.ts:31`), and the interview cannot start until it does. The context is resumed on the first pointerdown because browsers suspend audio contexts until a user gesture.

**`useRecorder`** records only the audio track of the stream (`useRecorder.ts:19`), choosing the best supported MIME type from `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4` (`useRecorder.ts:5-8`). It calls `recorder.start(1000)` so chunks arrive every second (`useRecorder.ts:24`), and `stop()` resolves with the assembled blob (`useRecorder.ts:29-45`).

**`useProctoring`** is the browser-side integrity layer:

- `visibilitychange` → reports `tab_switch` when the document becomes hidden (`useProctoring.ts:49-51`).
- `fullscreenchange` → reports `fullscreen_exit` when no element is in fullscreen (`useProctoring.ts:52-54`).
- `MediaStreamTrack` `ended` events → reports `camera_interrupted` or `mic_interrupted` (`useProctoring.ts:66-72`).
- A 2-second interval captures a 480 px-wide JPEG from the video element and posts it to `/frames` (`useProctoring.ts:17`, `useProctoring.ts:76-101`). A `busy` flag prevents overlapping uploads, and a failed frame is silently skipped so a transient network error never interrupts the interview.

When the server reports that an event was logged, the hook surfaces a notice (`useProctoring.ts:91-93`), and `EVENT_LABELS` (`useProctoring.ts:8-15`) supplies the human-readable wording used in both the toast and the report table.

### 6.5 The interview screen

`frontend/app/interview/[id]/page.tsx` is the largest component in the project at 603 lines. Its structure follows the server state machine exactly.

**On mount** the page loads the interview and redirects away if it is already `completed` (to the report) or `abandoned` (to the dashboard) (`page.tsx:73-81`), then requests camera and microphone access (`page.tsx:84-86`).

**Pre-session state** (`!live`) presents a three-step checklist (`page.tsx:344-438`):

1. *Camera and microphone* — shows the live level meter and whether speech has been detected.
2. *Face check* — a button that posts one frame to `/device-check` and renders the server's message.
3. *What is monitored* — an explicit disclosure of the five monitored behaviours.

The **Begin interview** button is disabled unless the face check passed, the microphone was tested, the camera is live, and the session is not already starting (`page.tsx:430`).

**Starting** requests fullscreen and refuses to continue if fullscreen was refused, because fullscreen exit is a monitored proctoring event (`page.tsx:157-176`).

**Answering** shows the current question, a **Start answer** button, and a per-question countdown from `QUESTION_LIMIT_SECONDS = 120` (`page.tsx:19`). The countdown auto-stops the recording and submits at zero (`page.tsx:239-252`). Submitting a failed answer preserves the blob and offers a **Retry submitting this answer** button rather than losing the recording (`page.tsx:201-203`, `page.tsx:476-480`).

**After each answer** the candidate sees the answer score, structure score, speaking rate, the LLM feedback, the suggested improvements, and the transcript behind a disclosure (`page.tsx:490-530`). This immediate feedback loop is the core of the product experience.

**Live status panel** (the right-hand column) shows camera, microphone, face and fullscreen state continuously (`page.tsx:567-589`), satisfying NFR4. A banner appears if fullscreen is lost, and another if the camera or microphone disconnects, with a reconnect button (`page.tsx:323-342`).

**Finishing** exits fullscreen, stops the media tracks and navigates to the processing screen (`page.tsx:254-265`).

### 6.6 Processing and report screens

`app/processing/[id]/page.tsx` issues the completion request and shows a three-stage progress indicator — transcribing, evaluating, generating — driven by timed transitions that are superseded the moment the real request resolves (`page.tsx:36-57`). The actual report is computed synchronously by the backend during `/complete`; this screen is a presentation of the wait, and it redirects to `/report/[id]` on success.

`app/report/[id]/page.tsx` renders the report: overall score, the four component bars, the proctoring summary with a timestamped event table, the aggregated strengths and improvements, and a per-question breakdown with the transcript behind a disclosure (`page.tsx:88-228`). A **Save as PDF** button uses `window.print()` (`page.tsx:99-101`). The proctoring indicator is described in plain language, with the weakest case phrased as "in a real assessment this session would likely be flagged" (`page.tsx:15-20`).

### 6.7 Design system

The theme is defined entirely in CSS custom properties in `app/globals.css`, in OKLCH colour space. A light palette is defined on `:root` and a dark palette on `.dark` (`globals.css:93-120`), with the Tailwind v4 `@theme inline` block mapping the tokens to utility classes (`globals.css:7-47`).

| Token | Light | Purpose |
| --- | --- | --- |
| `--primary` | `oklch(0.42 0.09 190)` | Teal, used for scores, primary actions, "attention" states |
| `--coral` | `oklch(0.62 0.17 28)` | Warm accent, used for warnings and violations |
| `--background` | `oklch(0.98 0.008 185)` | Page canvas |
| `--card` | `oklch(1 0 0)` | Panel surface |
| `--muted-foreground` | `oklch(0.48 0.025 220)` | Secondary text |
| `--border` | `oklch(0.88 0.02 190)` | Hairline borders |

The visual language is a single light canvas with teal for positive signal and coral for anything requiring attention, with no shadows, square corners and hairline borders.

`components/theme-provider.tsx` persists the day/night choice to `localStorage` under `signal-theme` and toggles the `dark` and `light` classes on `<html>`. The `Button` component (`components/ui/button.tsx`) is a shadcn-style variant set built on `@base-ui/react` with `class-variance-authority`, offering `default`, `outline`, `secondary`, `ghost`, `destructive` and `link` variants and seven sizes, with an `asChild` escape hatch that renders the child element instead of a `<button>`.

---

## 7. Scoring and evaluation methodology

This section corresponds to the synopsis Ch. 12. The implementation deliberately reports only measurable or explicitly AI-evaluated indicators and never claims to measure personality or confidence.

### 7.1 Indicator definitions

| Indicator | Range | Source | Weight |
| --- | --- | --- | ---: |
| Answer Quality | 0–100 | LLM relevance + completeness | 0.40 |
| Response Structure | 0–100 | LLM structure | 0.20 |
| Speech Fluency | 0–100 | Whisper transcript + audio timing | 0.20 |
| Gaze / Attention | 0–100 | Share of analysed frames with exactly one front-facing face | 0.20 |
| Overall Interview Performance | 0–100 | Weighted average of the four | — |
| Proctoring / Integrity Summary | Event count + indicator | Proctoring event log | *reported separately, not weighted* |

Weights are defined once in `backend/app/constants.py:28-33`.

### 7.2 Speech metrics

`backend/app/services/scoring.py`.

**Word counting** uses the pattern `[A-Za-z0-9']+` (`scoring.py:13`, `scoring.py:20-21`), so contractions count as one word and punctuation is excluded.

**Filler detection** uses a case-insensitive pattern covering single-word fillers and multi-word phrases (`scoring.py:9-12`):

```
um+ | uh+ | erm | hmm+ | like | you know | i mean | basically | actually | sort of | kind of
```

**Speaking rate** is `words / (duration_sec / 60)` (`scoring.py:31`), reported to one decimal place.

**Filler density** is `fillers / words × 100` (`scoring.py:36`), used by the fluency score.

### 7.3 Speech fluency score

Two components, equally weighted (`scoring.py:55-56`):

```
rate_score(wpm):
    wpm <= 0                       -> 0
    wpm < 110                      -> clamp((wpm - 50) / 60 × 100)
    110 <= wpm <= 170              -> 100
    wpm > 170                      -> clamp((250 - wpm) / 80 × 100)

filler_score(filler_per_100)       = clamp(100 - filler_per_100 × 10)

per_answer_fluency = 0.5 × rate_score + 0.5 × filler_score
```

The pace band of 110–170 wpm scores the full 100; the curve tapers linearly to 0 at 50 wpm and at 250 wpm (`scoring.py:40-48`). A candidate who says "um" five times in a hundred words loses 50 points of the filler half.

### 7.4 Session-level aggregation

`aggregate_scores` (`scoring.py:59-99`) combines the per-answer rows:

```
answer_quality    = mean(answer_score)
response_structure = mean(structure)

spread            = std(speaking_rate across answers)
consistency       = clamp(100 - spread × 2)
speech_fluency    = 0.85 × mean(per_answer_fluency) + 0.15 × consistency

gaze_attention    = attentive_frames / total_frames × 100     (None if no frames)
```

The consistency term rewards a steady pace across the session, penalising the standard deviation of the per-answer speaking rates at 2 points per wpm of spread.

**Weight renormalisation.** If no frames were analysed, `gaze_attention` is `None` and the component is dropped from the weighted average; the remaining weights are renormalised to sum to 1 (`scoring.py:88-91`). The overall score therefore remains comparable across sessions regardless of whether vision was available.

**Answer quality** is the mean of the LLM's relevance and completeness for each answer (`interviews.py:401`), so a single answer's score is the average of its two LLM sub-scores.

### 7.5 Report construction

`complete_interview` (`interviews.py:421-470`) builds the report from the stored rows. The `details` JSON column holds the deduplicated, merged `strengths` and `improvements` lists, capped at four items each, collected across all answers by `_collect` (`interviews.py:167-173`). The `integrity_summary` JSON column holds the event count, indicator, points and breakdowns.

The report is read back and re-assembled on every request by `_report_out` (`interviews.py:118-164`), which joins the responses with their questions, unfolds the stored evaluation JSON into the per-question result shape, and attaches the ordered proctoring event list. Because the report is always rebuilt from the source tables rather than from a stored snapshot, the numbers shown in the UI and the numbers in the database cannot drift apart.

---

## 8. Proctoring and integrity model

This section corresponds to the synopsis Ch. 11 and Ch. 6.6.

### 8.1 Event catalogue

| Event type | Source | Severity | Points |
| --- | --- | --- | ---: |
| `fullscreen_exit` | Fullscreen API | low | 1 |
| `tab_switch` | Page Visibility API | medium | 3 |
| `mic_interrupted` | MediaDevices API | medium | 3 |
| `face_absent` | Computer vision | medium | 3 |
| `camera_interrupted` | MediaDevices API | high | 5 |
| `multiple_faces` | Computer vision | high | 5 |

Defined in `backend/app/constants.py:12-25`. Every event is stored with a timestamp and a severity label in `proctoring_events` (`models.py:71-78`).

### 8.2 Face-state debounce

Raw per-frame face detection is too noisy to log directly — a single missed detection would produce a spurious event. `proctoring.next_face_state` (`services/proctoring.py:6-21`) is a state machine that requires **two consecutive** bad frames before emitting an event, and emits only once per episode:

```
state "ok"  + observed "absent"   -> ("absent_pending",  None)
state "absent_pending" + "absent" -> ("absent",         "absent")
state "absent" + observed "absent" -> ("absent",         None)   # already logged
state "absent" + observed "ok"     -> ("ok",             None)   # episode ends
```

The current state is persisted on the interview row (`interviews.face_state`), so the debounce spans frame requests rather than resetting on each one. `test_face_state_debounce` (`backend/tests/test_scoring.py:44-57`) asserts each transition, including that a single missed frame produces no event.

The episode also ends on a good frame, so a candidate who leaves the frame, returns, and leaves again produces two events, not one.

### 8.3 Integrity summary

`proctoring.integrity_summary` (`services/proctoring.py:24-43`) converts the event list into the reported summary:

```
points = Σ SEVERITY_POINTS[severity]

points == 0        -> "clean"
points <= 5         -> "minor"
points <= 15        -> "moderate"
otherwise           -> "significant"
```

The summary also carries the total event count and breakdowns by type and by severity, and is stored verbatim in `reports.integrity_summary`.

**Proctoring is deliberately excluded from the performance score.** The overall score is a weighted average of the four skill indicators only. The report page states this explicitly to the candidate (`app/report/[id]/page.tsx:136-139`), which matches the synopsis requirement to keep integrity monitoring "transparent and distinct from skill assessment" (Ch. 12.2).

### 8.4 Failure handling

Every proctoring call is designed to fail quietly rather than interrupt the interview. The frontend swallows reporting errors (`useProctoring.ts:40-42`), skips failed frames (`useProctoring.ts:94-96`), and the backend raises 503 for worker failures while still leaving previously captured data intact — satisfying NFR2, which requires that camera or microphone interruptions do not lose already-captured session data.

---

## 9. Deployment and operations

### 9.1 Container builds

**Backend** (`backend/Dockerfile`): `python:3.11-slim`, dependencies installed from `requirements.txt` with `--no-cache-dir`, application copied to `/srv/app`, and `uvicorn app.main:app --host 0.0.0.0 --port 8000` as the entrypoint.

**Worker** (`worker/Dockerfile`): `python:3.11-slim` plus three system packages — `ffmpeg` for Whisper's audio decoding, and `libgl1` and `libglib2.0-0` for the MediaPipe runtime (`worker/Dockerfile:4-7`). The build then pins `setuptools<81` and installs with `--no-build-isolation` (`worker/Dockerfile:9-13`): `openai-whisper` ships only an sdist whose `setup.py` imports `pkg_resources`, which was removed in setuptools 81. Pinning an older setuptools and disabling build isolation is what allows Whisper to build while every other dependency installs from a prebuilt wheel.

**Frontend** (`frontend/Dockerfile`): a three-stage build. The `deps` stage installs from the committed `pnpm-lock.yaml` with `--frozen-lockfile`. The `builder` stage runs `pnpm build` and produces the Next.js standalone output. The `runner` stage copies only `.next/standalone`, `.next/static` and `public` onto a clean `node:20-alpine` image and starts `node server.js` (`frontend/Dockerfile:18-22`). The final image contains no source, no dev dependencies and no package manager.

### 9.2 Reverse proxy

`nginx/nginx.conf` defines a single server block on port 80:

- `client_max_body_size 25m` (`nginx.conf:3`) — above the backend's own 20 MB audio limit, so the backend's precise 413 response is what the client sees rather than nginx's generic rejection.
- `location /api/` proxies to `http://backend:8000` with `X-Real-IP`, `X-Forwarded-For` and `X-Forwarded-Proto` headers, and a 300-second read/send timeout (`nginx.conf:6-14`).
- `location /` proxies to `http://frontend:3000` (`nginx.conf:16-20`).

No TLS is terminated in the container. The README notes that browsers only permit camera and microphone access on `localhost` or over HTTPS, so any deployment on a real host requires TLS in front of nginx. This is the one place where the NFR1 requirement of "all client-server communication shall use HTTPS" is not met by the application itself.

### 9.3 Local development

Three terminals plus a local PostgreSQL, as documented in `README.md:25-44`:

```bash
# worker — needs ffmpeg on the host; Python 3.11
cd worker && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --port 8001

# backend
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg2://USER:PASS@localhost:5432/mockinterview
export SECRET_KEY=$(openssl rand -hex 32) GEMINI_API_KEY=your-key WORKER_URL=http://localhost:8001
uvicorn app.main:app --port 8000

# frontend — proxies /api to localhost:8000
cd frontend && corepack pnpm install && corepack pnpm dev
```

Tables are created automatically on backend start via the `lifespan` hook, so no separate migration step is required for a fresh database.

### 9.4 Environment variables

`.env` in the repository root holds `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `SECRET_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL` and `WHISPER_MODEL`. It is listed in `.gitignore` and must never be committed. The values themselves are deliberately not reproduced in this document; the purposes and defaults are in [Section 4.2](#42-configuration).

The README's first instruction is `cp .env.example .env`, but the repository contains `.env` itself and no `.env.example` template.

---

## 10. Testing

### 10.1 Backend

35 pytest tests across four files. The suite runs against an in-memory SQLite database with `StaticPool` so that the schema and the session share one connection (`backend/tests/conftest.py:19-23`). The `get_db` dependency is overridden per test (`conftest.py:25-32`).

**All external services are mocked** (`conftest.py:34-68`):

| Dependency | Mock | Behaviour |
| --- | --- | --- |
| `gemini.generate_questions` | `monkeypatch.setattr` | Returns `count` deterministic questions alternating technical/behavioural |
| `gemini.evaluate_answer` | `monkeypatch.setattr` | Returns fixed scores: relevance 80, completeness 70, structure 60 |
| `worker_client.analyze_frame` | `monkeypatch.setattr` | Returns a mutable `{"faces": n, "frontal": bool}` state the test can change |
| `worker_client.transcribe` | `monkeypatch.setattr` | Returns a fixed transcript containing one filler word and a 6-second duration |

The mutable face state is exposed to tests as `client.worker_state` (`conftest.py:70`), which is how the multiple-face and face-absent scenarios are driven.

| File | Tests | Subject |
| --- | ---: | --- |
| `tests/test_auth.py` | 7 | Registration, login, token handling, route protection |
| `tests/test_interview_flow.py` | 13 | Full session lifecycle and data isolation |
| `tests/test_llm.py` | 8 | Provider priority, fallback, retry, JSON validation, prompt hygiene |
| `tests/test_scoring.py` | 7 | Speech metrics, score bands, aggregation, debounce, integrity summary |

Running them:

```bash
cd backend && pytest
```

### 10.2 Frontend

10 Vitest tests across three files, in a jsdom environment with `@testing-library/react` and the `@` path alias resolved to the project root (`frontend/vitest.config.ts`).

| File | Tests | Subject |
| --- | ---: | --- |
| `lib/api.test.ts` | 4 | Bearer header attachment, JSON body, `ApiError` detail extraction, 401 → token clear + `auth:expired` |
| `lib/auth.test.ts` | 4 | Login, register and `me` request shapes |
| `components/auth-provider.test.tsx` | 2 | Session restoration on mount, signed-out state |

Running them:

```bash
cd frontend && corepack pnpm test
```

The provider test mocks `next/navigation` (`auth-provider.test.tsx:26-28`) so that router transitions do not require a Next.js runtime.

### 10.3 What the tests exercise and what they do not

**Covered.** The full candidate journey from registration through to a stored report, with the LLM and the worker mocked. Authentication edge cases including the timing-equalised unknown-email path. The device-check gate. The debounced face-event state machine. Idempotent completion. Abandoned-session handling. Cross-user data isolation. The LLM provider fallback and retry logic including the case where Gemini returns unusable JSON. Every scoring formula.

**Not covered by automated tests.** The README records that the build environment had no camera, microphone or GPU, so the following have not been exercised end to end: Whisper transcription of real browser audio, MediaPipe on a real face, and the head-orientation thresholds in `worker/app/vision.py`, which may need tuning for a particular camera and lighting setup. The frontend has no component tests for the interview, report, dashboard or history screens; the hooks (`useProctoring`, `useRecorder`, `useMediaStream`) are not directly unit-tested. There is no browser-level end-to-end test, no load test and no CI configuration in the repository.

---

## 11. Security and data-handling posture

This section records what the implementation does. Chapter 11 of the synopsis lists a target security posture; the mapping between the two is in [Section 13](#13-requirements-traceability-matrix).

### 11.1 Authentication and access control

- Passwords are hashed with bcrypt and a per-password salt; the plaintext is never stored or logged (`security.py:13-14`).
- The password hash is excluded from every response schema. `UserOut` contains only `user_id`, `name` and `email` (`schemas.py:33-37`), and `test_password_never_returned` (`test_auth.py:31-34`) asserts the string `password` appears nowhere in the response body.
- All routes touching personal data require a valid JWT (`deps.py:12-29`).
- Interview access is scoped to the owning user, and a mismatch returns 404 rather than 403 so that another user's session identifiers are not confirmable (`interviews.py:46-50`).
- Password length is capped at 72 bytes to match the bcrypt limit rather than allowing silent truncation (`schemas.py:20-25`).
- Login does not reveal whether an email is registered, in either the message or the timing (`security.py:10`, `security.py:17-23`).
- SQL injection is avoided by using the SQLAlchemy ORM and parameterised expressions throughout; no string-built SQL exists in the codebase.

### 11.2 Token handling

The JWT is stored in `localStorage` and sent as a bearer token. `localStorage` is readable by any script running on the origin, so this is a known exposure to XSS; an httpOnly cookie would be safer against script injection but would require CSRF handling. The README raises this explicitly as a decision point for the reviewer. Tokens expire after 120 minutes by default, and a 401 clears the stored token and redirects to the login page.

### 11.3 Data retention

- **Webcam frames are not stored.** Frames are captured in the browser, analysed by the worker, and discarded. Only the derived counts (`frames`, `attentive`) are persisted, in `responses.vision_stats`. The interview screen states this to the candidate (`app/interview/[id]/page.tsx:590-592`) and the setup page repeats it (`app/setup/page.tsx:134-136`).
- **Audio is not stored.** The uploaded blob is written to a temporary file for ffmpeg decoding, transcribed, and the temporary file is discarded when the `with` block exits (`worker/app/speech.py:25-29`). Only the resulting transcript is persisted.
- **Transcripts are retained** in `responses.transcript` and shown in the report.

### 11.4 Upload and resource limits

| Limit | Value | Enforced at |
| --- | --- | --- |
| Answer audio | 20 MB | `interviews.py:37`, `interviews.py:71-77` |
| Frame / check image | 2 MB | `interviews.py:38` |
| Worker upload | 25 MB | `worker/app/main.py:8` |
| nginx body | 25 MB | `nginx/nginx.conf:3` |

Over-limit uploads return HTTP 413 before the payload is fully read.

### 11.5 LLM prompt hygiene

The evaluation prompt treats the candidate's transcript as untrusted data: it is wrapped in `<<<TRANSCRIPT` / `TRANSCRIPT>>>` markers and the model is instructed to treat it strictly as data and to ignore any instructions appearing inside it (`services/gemini.py:162-165`). This is the one place where candidate-controlled free text reaches a model prompt.

### 11.6 Encryption at rest

The synopsis Ch. 11 requires "server-side, encrypted-at-rest storage of interview results and session metadata". The application code does not perform encryption at rest. Password hashes are one-way by construction, and everything else — transcripts, scores, reports, proctoring logs — is stored as plaintext in PostgreSQL. The README states that this is delegated to the infrastructure layer, recommending an encrypted disk or volume, or a managed PostgreSQL service with encryption at rest.

### 11.7 Transport security

TLS is not terminated by the application or by the bundled nginx configuration. The Compose stack serves plain HTTP on port 80. A deployment to any host other than `localhost` requires TLS in front of nginx, both to satisfy NFR1 and because browsers refuse to grant camera and microphone access over plain HTTP on a non-localhost origin.

### 11.8 LLM key handling

`GEMINI_API_KEY` and `GROQ_API_KEY` are read from the environment and used only in server-side request headers (`gemini.py:54`, `gemini.py:29`). They are never exposed to the browser, never logged, and never included in any API response. The frontend receives no API keys — it only talks to the backend, which proxies the LLM call.

---

# Part B — Synopsis conformance

## 12. Chapter-by-chapter mapping

| Synopsis chapter | Implementation | Status |
| --- | --- | --- |
| **Ch. 1** Introduction | — | Proposal-side; no code artefact |
| **Ch. 2** Literature survey | — | Proposal-side; no code artefact |
| **Ch. 3** Problem statement | — | Proposal-side; addressed by the delivered system |
| **Ch. 4** Objectives (8) | See [Section 13](#13-requirements-traceability-matrix) | All 8 met |
| **Ch. 5** Scope | [Section 15](#15-mvp-scope-and-future-scope-status) | In-scope delivered; out-of-scope items correctly absent |
| **Ch. 6.1** Functional requirements | [Section 13](#13-requirements-traceability-matrix) | FR1–FR13 all implemented |
| **Ch. 6.2** Non-functional requirements | [Section 13](#13-requirements-traceability-matrix) | 6 of 7 fully met; NFR1 partially met (HTTPS not terminated in-app) |
| **Ch. 6.3–6.4** Hardware / software requirements | `docker-compose.yml`, Dockerfiles | Met; all software requirements are containerised |
| **Ch. 7.1** System architecture | [Section 2](#2-system-architecture) | Met — layered, five-container deployment |
| **Ch. 7.2** End-to-end workflow | [Section 1.2](#12-end-to-end-session-flow) | Met |
| **Ch. 7.3–7.4** DFD Level 0 and Level 1 | [Section 2.3](#23-request-flow-per-operation) | Met; six internal processes present as backend routes and services |
| **Ch. 7.5** Use case diagram | [Section 4.6](#46-api-reference), frontend routes | Candidate actor fully implemented; Admin actor correctly deferred to future scope |
| **Ch. 7.6** ER diagram | [Section 4.3](#43-data-model) | Met, with five additional columns (Section 16) |
| **Ch. 7.7** Deployment diagram | [Section 2.1](#21-deployment-topology), [Section 9](#9-deployment-and-operations) | Met |
| **Ch. 8** Technology stack | [Section 4](#4-backend-fastapi), [Section 5](#5-worker-computer-vision-and-speech), [Section 6](#6-frontend-nextjs) | Met. Versions are newer than the synopsis assumed; Groq is an addition as a fallback provider |
| **Ch. 9** Module description (8 modules) | [Section 12.1](#121-module-mapping) | All 8 modules implemented |
| **Ch. 10** Database design | [Section 4.3](#43-data-model) | Met; 3NF structure preserved, 5 extra columns |
| **Ch. 11** Proctoring and security | [Section 8](#8-proctoring-and-integrity-model), [Section 11](#11-security-and-data-handling-posture) | 8 of 9 features implemented; encrypted-at-rest storage is delegated to infrastructure |
| **Ch. 12** Evaluation methodology | [Section 7](#7-scoring-and-evaluation-methodology) | Met; integrity reported separately from the score, as specified |
| **Ch. 13** Implementation plan | — | Planning document; the delivered code covers the full MVP |
| **Ch. 14** Testing strategy | [Section 10](#10-testing), [Section 14](#14-test-case-conformance) | Met; TC01–TC07 all implemented, plus 28 additional tests |
| **Ch. 15** Expected outcome | — | The described candidate journey is delivered end to end |
| **Ch. 16** MVP and future scope | [Section 15](#15-mvp-scope-and-future-scope-status) | MVP delivered; future-scope items correctly not built |
| **Ch. 17** Conclusion | — | — |
| **References** | Whisper, MediaPipe, OpenCV, Gemini, FastAPI, PostgreSQL, React/Next.js, MDN, Docker | All cited technologies are used in the implementation |

### 12.1 Module mapping

| Synopsis module (Ch. 9) | Backend | Worker | Frontend |
| --- | --- | --- | --- |
| 9.1 Authentication & User Management | `routers/auth.py`, `security.py`, `deps.py` | — | `components/auth-provider.tsx`, `components/require-auth.tsx` |
| 9.2 Interview Engine | `routers/interviews.py` | — | `app/setup/page.tsx`, `app/interview/[id]/page.tsx` |
| 9.3 AI Question & Answer Analysis | `services/gemini.py` | — | `app/interview/[id]/page.tsx` (answer review card) |
| 9.4 Computer Vision | `services/worker_client.py` | `app/vision.py` | `hooks/useProctoring.ts` |
| 9.5 Speech Analysis | `services/scoring.py` | `app/speech.py` | `hooks/useRecorder.ts`, `hooks/useMicLevel.ts` |
| 9.6 Proctoring Engine | `services/proctoring.py` | `app/vision.py` (face events) | `hooks/useProctoring.ts` |
| 9.7 Report & Analytics | `services/scoring.py`, `routers/interviews.py` | — | `app/report/[id]/page.tsx` |
| 9.8 Database Layer | `models.py`, `database.py` | — | — |

---

## 13. Requirements traceability matrix

### 13.1 Functional requirements (Ch. 6.1)

| ID | Requirement | Implementation | Evidence | Status |
| --- | --- | --- | --- | --- |
| **FR1** | Register with a unique email and a securely hashed password | `routers/auth.py:15-27`, `security.py:13-14` | `test_register_duplicate_email_rejected`, `test_short_password_rejected` | Met |
| **FR2** | Authenticate returning users and issue a JWT | `routers/auth.py:30-35`, `security.py:26-33` | `test_login_success_and_me` | Met |
| **FR3** | Select an interview role and difficulty before starting | `routers/interviews.py:208-242`, `constants.py:1-9` | `test_create_validates_role_and_difficulty` | Met |
| **FR4** | Pre-session check of camera, microphone and single-face presence | `routers/interviews.py:263-282`; camera/mic checks in `app/interview/[id]/page.tsx:352-380` | `test_cannot_start_without_device_check`, `test_device_check_fails_without_single_face` | Met |
| **FR5** | Generate role- and difficulty-appropriate questions with a generative AI model | `services/gemini.py:116-126` | `test_gemini_is_primary`, `test_falls_back_when_gemini_json_is_unusable` | Met |
| **FR6** | Capture webcam video and microphone audio during each response | `hooks/useRecorder.ts`, `hooks/useProctoring.ts` (frames), `lib/capture.ts` | `test_answer_and_double_submit` | Met |
| **FR7** | Transcribe each spoken response using an ASR engine | `services/worker_client.py:30-32` → `worker/app/speech.py:24-41` | Worker mocked in tests; real path untested (§10.3) | Met, real path unverified |
| **FR8** | Compute speaking rate, filler-word frequency and response duration | `services/scoring.py:20-37` | `test_speech_metrics_rate`, `test_filler_and_word_counts` | Met |
| **FR9** | Evaluate relevance, completeness and structure with a generative AI model | `services/gemini.py:155-179` | `test_evaluate_answer_clamps_and_limits` | Met |
| **FR10** | Continuously monitor and log proctoring events with timestamp and severity | `services/proctoring.py`, `routers/interviews.py:297-346`, `hooks/useProctoring.ts` | `test_multiple_faces_logged_after_two_frames`, `test_tab_switch_event_logged` | Met |
| **FR11** | Aggregate answer-quality, speech-fluency, response-structure, gaze and integrity into one report | `routers/interviews.py:421-470`, `services/scoring.py:59-99` | `test_full_session_produces_stored_report` | Met |
| **FR12** | Persist users, sessions, responses, scores, events and reports relationally | `models.py` (6 tables) | Full-session test reads the report back from the database | Met |
| **FR13** | Allow an authenticated user to view their historical reports | `GET /interviews`, `GET /interviews/{id}/report` | `test_full_session_produces_stored_report` (history assertion), `test_interviews_are_private_to_their_owner` | Met |

### 13.2 Non-functional requirements (Ch. 6.2)

| ID | Requirement | Implementation | Status |
| --- | --- | --- | --- |
| **NFR1** | Security: one-way password hashing; JWT on all personal-data routes; HTTPS for all client-server communication | bcrypt (`security.py:13-14`) and JWT guards (`deps.py`) are met. HTTPS is **not** terminated by the app or the bundled nginx; it is expected in front of nginx (§11.7) | Partially met — the HTTPS obligation is an infrastructure responsibility |
| **NFR2** | Reliability: handle camera/microphone interruptions without losing captured data | The `lost` flag drives a reconnect banner (`useMediaStream.ts:46-52`, `app/interview/[id]/page.tsx:335-342`); stored responses are untouched by a track ending; failed proctoring calls are swallowed (`useProctoring.ts:40-42`) | Met |
| **NFR3** | Performance: proctoring checks reflected in the interface with minimal perceptible delay (target 1–2 s) | Frames are posted on a 2-second interval (`useProctoring.ts:17`); the live status panel updates on each response (`app/interview/[id]/page.tsx:567-589`) | Met |
| **NFR4** | Usability: the interface shall always indicate microphone/camera status, the current question and time remaining | Live status rows for camera, microphone, face and fullscreen; question counter; per-answer countdown from 120 s and a session clock | Met |
| **NFR5** | Scalability: independently deployable API, CV/speech worker and database services | Three separate containers plus the frontend and proxy; the worker holds no state and is horizontally replicable | Met |
| **NFR6** | Maintainability: modular structure separating authentication, interview logic, AI integration, proctoring and reporting | `routers/`, `services/`, `models.py`, `schemas.py`, `security.py` are separate concerns; the worker is isolated from the database | Met |
| **NFR7** | Portability: containerised with Docker for consistent behaviour | Five service definitions in `docker-compose.yml`; three Dockerfiles; pinned dependency versions | Met |

### 13.3 Objectives (Ch. 4)

| # | Objective | Implementation | Status |
| --- | --- | --- | --- |
| 1 | A complete frontend, backend, database and AI-integrated web product | Five-container stack; 10 API routes; 11 frontend routes | Met |
| 2 | Secure registration and login, token-based session protection | `routers/auth.py`, `security.py`, `deps.py` | Met |
| 3 | Role-based interviews with AI-generated questions per role and difficulty | `services/gemini.py:116-126` | Met |
| 4 | Continuous webcam and microphone capture during responses | `hooks/useProctoring.ts` (2 s frames), `hooks/useRecorder.ts` (audio) | Met |
| 5 | Monitor face absence, multiple faces, tab switching, fullscreen exit, camera/mic interruption | Six event types in `constants.py:12-24` | Met |
| 6 | Transcribe speech; measure speaking rate, filler frequency and duration | `worker/app/speech.py`, `services/scoring.py` | Met |
| 7 | Evaluate relevance, completeness and structure with a generative AI model | `services/gemini.py:155-179` | Met |
| 8 | Store sessions and generate category-wise performance and integrity reports | `models.py` (`reports`), `routers/interviews.py:421-470` | Met |

---

## 14. Test-case conformance

The synopsis Ch. 14.6 lists seven illustrative test cases. All seven are implemented in the backend suite.

| ID | Synopsis test case | Expected result | Implemented test | File |
| --- | --- | --- | --- | --- |
| **TC01** | Register with an already-used email | Registration rejected with a clear error message | `test_register_duplicate_email_rejected` | `tests/test_auth.py:4-8` |
| **TC02** | Login with incorrect password | Access denied; no JWT issued | `test_login_wrong_password_denied` | `tests/test_auth.py:10-14` |
| **TC03** | Start interview without granting camera access | Session blocked at device-check stage | `test_cannot_start_without_device_check` | `tests/test_interview_flow.py:32-35` |
| **TC04** | Multiple faces appear in webcam frame | Multiple-face event logged with timestamp | `test_multiple_faces_logged_after_two_frames` | `tests/test_interview_flow.py:49-60` |
| **TC05** | Candidate switches browser tab mid-question | Tab-switch event logged; candidate notified | `test_tab_switch_event_logged` | `tests/test_interview_flow.py:62-68` |
| **TC06** | Submit a spoken answer | Transcript generated and answer-quality score returned | `test_answer_and_double_submit` | `tests/test_interview_flow.py:77-89` |
| **TC07** | Complete a full 5-question session | Final report generated and stored in the database | `test_full_session_produces_stored_report` | `tests/test_interview_flow.py:99-122` |

**Notes on the mapping.** TC03 is implemented as the *server-side* enforcement of the device check: the start endpoint refuses to move an interview to `in_progress` unless the check has passed. TC04 asserts the debounce behaviour precisely — no event on the first bad frame, `multiple_faces` on the second, and no repeat on the third. TC05 asserts both the persisted event and its `medium` severity, and that an unrecognised event type is rejected with 422. TC07 additionally asserts idempotent completion and that the report is retrievable afterwards and appears in the history listing.

**Additional tests beyond the synopsis** (28 of the 35): session lifecycle and status transitions, abandon semantics, unanswered-question rejection, cross-user data isolation, password never returned, short-password rejection, unknown-email login, unknown-event-type rejection, LLM provider priority, retry-and-fallback ordering, unusable-JSON fallback, all-providers-failed, no-provider-configured, score clamping and list limits, code-fence stripping, Groq request shape, filler and word counts, speaking rate, pace band, gaze-drop renormalisation, weighted aggregation, face-state debounce and integrity summary; plus on the frontend, the bearer-token layer, `ApiError` detail extraction, the 401 expiry event, the auth request shapes and provider session restoration.

---

## 15. MVP scope and future scope status

### 15.1 MVP (Ch. 16.1)

| MVP deliverable | Status | Where |
| --- | --- | --- |
| Secure authentication | Delivered | `routers/auth.py` |
| Role-based interview session of five questions | Delivered | `constants.py:1-9`, `config.py:19` |
| Webcam and microphone capture | Delivered | `hooks/useRecorder.ts`, `hooks/useProctoring.ts` |
| Face and multiple-face monitoring | Delivered | `worker/app/vision.py`, `services/proctoring.py` |
| Tab and fullscreen monitoring | Delivered | `hooks/useProctoring.ts:49-54` |
| Whisper-based transcription | Delivered | `worker/app/speech.py` |
| Gemini-based answer evaluation | Delivered | `services/gemini.py:155-179` |
| Final aggregated report | Delivered | `services/scoring.py`, `routers/interviews.py:421-470` |
| PostgreSQL-backed storage of all session data | Delivered | `models.py` |

### 15.2 Future scope (Ch. 16.2)

| Future capability | Status in this implementation |
| --- | --- |
| Resume / job-description driven question generation | Not implemented. Questions are generated from role and difficulty only (`services/gemini.py:116-126`) |
| Multilingual interview support | Not implemented. Whisper is called with `language="en"` (`worker/app/speech.py:35`) and the LLM prompts are English-only |
| Adaptive question difficulty | Not implemented. All five questions are generated at the selected difficulty before the session starts |
| Administrative / placement-cell dashboard | Not implemented. The Admin actor in the Ch. 7.5 use case diagram is a future-scope actor. `users.role` exists (`models.py:20`) but no admin route exists |
| Longitudinal analytics across sessions | Partially present. The dashboard shows sessions completed, average score and latest score (`app/dashboard/page.tsx:85-120`) and the history table lists every session, but there is no trend analysis or per-skill progress tracking |
| Cloud-native deployment with horizontal auto-scaling | Not implemented. The Compose stack is single-instance. The worker is stateless and horizontally replicable by design (`worker/app/main.py:16-24`) |
| Downloadable / exportable report formats | Partially present. A "Save as PDF" button uses the browser's print function (`app/report/[id]/page.tsx:99-101`). There is no server-side PDF generation or file export |

---

## 16. Documented deviations from the synopsis

These are the differences between the documents and the implementation, stated factually. The first group is recorded in the project README; the second group was identified during this documentation pass.

### 16.1 Recorded in the README

**Additional database columns (5).** The synopsis Ch. 10 schema has no place for per-answer structure scores, frame counts, or debounced face events, so the implementation adds:

| Column | Type | Purpose |
| --- | --- | --- |
| `responses.evaluation` | JSON | The full LLM evaluation for the answer — relevance, completeness, structure, feedback, strengths, improvements |
| `responses.vision_stats` | JSON | `{"frames": n, "attentive": n}` for the question — the input to the gaze/attention score |
| `reports.details` | JSON | Merged, deduplicated `strengths` and `improvements` lists for the report |
| `interviews.created_at` | timestamptz | Creation time, used to order and date the history list |
| `interviews.face_state` | String(20) | The debounced face-state machine's current state |

**Session timer.** Each answer is limited to two minutes and auto-stops (`app/interview/[id]/page.tsx:19`, `page.tsx:239-252`). The session clock is displayed but there is no whole-session cut-off.

**All five questions must be answered** before a report is generated (`interviews.py:430-431`).

**Token storage.** The JWT is kept in `localStorage` and sent as a bearer header, rather than in an httpOnly cookie. The README notes an httpOnly cookie would be safer against XSS but would require CSRF handling, and leaves the decision open.

**Encryption at rest** (Ch. 11) is not performed in application code. The README directs this to an encrypted disk or volume, or a managed PostgreSQL.

**Frames are not stored.** Webcam frames are analysed and discarded; audio is deleted after transcription.

**Gemini model name** defaults to `gemini-flash-latest` and is overridable via `GEMINI_MODEL`.

**LLM fallback.** Question generation and answer evaluation try Gemini first and Groq second, each retried once before falling back. With only `GEMINI_API_KEY` set, behaviour is unchanged.

### 16.2 Identified during this documentation pass

**Additional LLM provider.** Groq (`openai/gpt-oss-120b` by default) is implemented as a fallback provider, which is not named in the synopsis. Gemini remains the primary. The synopsis Ch. 8 lists only the Gemini API.

**Additional browser proctoring events (2).** `camera_interrupted` and `mic_interrupted` are implemented and stored with severities, in addition to the five event types the synopsis Ch. 6.1 FR10 enumerates. The synopsis FR10 lists "camera/microphone interruption" as a single item, and the implementation splits it into two distinct event types with different severities (high and medium respectively).

**`QUESTIONS_PER_INTERVIEW` and `MIN_ANSWER_WORDS` configuration.** Two additional settings exist beyond the synopsis scope: the number of questions per session (default 5, matching the MVP) and the minimum word count below which an answer is treated as containing no clear speech (default 3), which skips the LLM call (`interviews.py:380-388`).

**`users.role` column.** Present in the schema with a default of `candidate` and populated by the synopsis Ch. 10 table, but no role-based authorisation is implemented. Every authenticated user has identical access scope.

**Database schema creation, not migration.** Tables are created with `Base.metadata.create_all()` on application startup (`main.py:9-12`). There is no Alembic or equivalent migration tool, so an existing database will not be altered when the models change.

**Two small front-end deviations from the "coaching, not punitive" framing.** The interview cannot be *started* without passing the device check, and fullscreen is required to begin (`app/interview/[id]/page.tsx:166-168`), so those two gates are enforced rather than advisory. All other monitored events are advisory only, as intended.

**README step discrepancy.** The README instructs `cp .env.example .env`, but the repository contains a `.env` file and no `.env.example` template.

**Test-count discrepancy.** The README states "25 backend tests". The suite as written contains 35 test functions across the four files.

**Additional API surface.** `GET /api/health` and `POST /api/interviews/{id}/abandon` are not enumerated in the synopsis, which describes a candidate journey without an explicit abandon operation.

**Report rendering from source tables.** The report response is rebuilt from `responses`, `questions` and `proctoring_events` on every request (`interviews.py:118-164`) rather than being read from a stored snapshot. The stored `reports` row holds the aggregated scores and the integrity summary; the per-question detail is always live.

---

## 17. Glossary

| Term | Meaning in this project |
| --- | --- |
| **Answer Quality** | Weighted indicator, 0–100: the mean of the LLM's relevance and completeness scores across the session. Weight 0.40 |
| **Device check** | The pre-session gate: one webcam frame must contain exactly one front-facing face. Passing it moves the interview from `created` to `ready` |
| **Episode** | A continuous run of bad face states. A proctoring event is emitted once per episode, after two consecutive bad frames |
| **Face state** | The debounce state of the face-detection machine: `ok`, `absent`, `multiple`, or the transitional `absent_pending` / `multiple_pending` |
| **Gaze / Attention** | The share of analysed frames in which exactly one face was present and front-facing, as a percentage. `n/a` if no frames were analysed |
| **Integrity summary** | The proctoring report: event count, severity-weighted points, a verbal indicator (`clean` / `minor` / `moderate` / `significant`) and breakdowns by type and severity |
| **Landing page** | The public marketing page at `/`, which includes a static sample report preview |
| **Overall score** | The weighted average of Answer Quality (0.40), Response Structure (0.20), Speech Fluency (0.20) and Gaze/Attention (0.20), renormalised if Gaze/Attention is unavailable |
| **Proctoring event** | A timestamped, severity-tagged record of an integrity-relevant action: tab switch, fullscreen exit, camera or microphone interruption, face absent, or multiple faces |
| **Response** | The row that links a question to a candidate's answer. A `NULL` transcript means the question is unanswered |
| **Session** | One interview, from creation to completion or abandonment. Every session has exactly five questions and at most one report |
| **Signal** | The product name. The platform's framing is that it returns a measurable signal about interview performance rather than a subjective impression |
| **Speech Fluency** | Weighted indicator, 0–100: 85 % per-answer fluency (pace band plus filler density) and 15 % pace consistency across the session. Weight 0.20 |
| **Worker** | The separate FastAPI service that runs MediaPipe face analysis and Whisper transcription. Stateless, CPU-bound, horizontally replicable |
