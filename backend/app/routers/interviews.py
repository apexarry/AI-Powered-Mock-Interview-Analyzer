from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..constants import (
    BROWSER_EVENT_TYPES,
    DIFFICULTIES,
    EVENT_SEVERITY,
    FACE_EVENT_TYPES,
    ROLES,
)
from ..database import get_db
from ..deps import get_current_user
from ..models import Interview, ProctoringEvent, Question, Report, Response, User
from ..schemas import (
    AnswerOut,
    DeviceCheckOut,
    EventIn,
    EventOut,
    FrameOut,
    IntegrityOut,
    InterviewCreate,
    InterviewOut,
    InterviewSummary,
    OptionsOut,
    QuestionOut,
    QuestionResult,
    ReportOut,
)
from ..services import gemini, proctoring, scoring, worker_client

router = APIRouter(prefix="/interviews", tags=["interviews"])

MAX_AUDIO_BYTES = 20 * 1024 * 1024
MAX_IMAGE_BYTES = 2 * 1024 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- helpers
def _get_interview(db: Session, user: User, interview_id: int) -> Interview:
    iv = db.get(Interview, interview_id)
    if iv is None or iv.user_id != user.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found.")
    return iv


def _require_status(iv: Interview, *allowed: str) -> None:
    if iv.status not in allowed:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This action is not available while the interview is '{iv.status}'.",
        )


def _pairs(db: Session, interview_id: int) -> list[tuple[Response, Question]]:
    stmt = (
        select(Response, Question)
        .join(Question, Question.question_id == Response.question_id)
        .where(Response.interview_id == interview_id)
        .order_by(Response.response_id)
    )
    return [(r, q) for r, q in db.execute(stmt).all()]


def _read_upload(upload: UploadFile, limit: int) -> bytes:
    data = upload.file.read(limit + 1)
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty.")
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "The uploaded file is too large.")
    return data


def _analyze(image: bytes) -> dict:
    try:
        return worker_client.analyze_frame(image)
    except worker_client.WorkerError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))


def _interview_out(iv: Interview, pairs: list[tuple[Response, Question]]) -> InterviewOut:
    return InterviewOut(
        interview_id=iv.interview_id,
        role=iv.role,
        difficulty=iv.difficulty,
        status=iv.status,
        start_time=iv.start_time,
        end_time=iv.end_time,
        questions=[
            QuestionOut(
                question_id=q.question_id,
                category=q.category,
                question_text=q.question_text,
                answered=r.transcript is not None,
            )
            for r, q in pairs
        ],
    )


def _log_event(db: Session, interview_id: int, event_type: str) -> ProctoringEvent:
    event = ProctoringEvent(
        interview_id=interview_id,
        event_type=event_type,
        severity=EVENT_SEVERITY[event_type],
        timestamp=_now(),
    )
    db.add(event)
    return event


def _report_out(db: Session, iv: Interview, report: Report) -> ReportOut:
    events = db.scalars(
        select(ProctoringEvent)
        .where(ProctoringEvent.interview_id == iv.interview_id)
        .order_by(ProctoringEvent.timestamp, ProctoringEvent.event_id)
    ).all()
    questions = []
    for resp, q in _pairs(db, iv.interview_id):
        ev = resp.evaluation or {}
        questions.append(
            QuestionResult(
                question_text=q.question_text,
                category=q.category,
                transcript=resp.transcript or "",
                speaking_rate=resp.speaking_rate or 0.0,
                filler_count=resp.filler_count or 0,
                duration_sec=resp.duration_sec or 0.0,
                answer_score=resp.answer_score or 0.0,
                relevance=ev.get("relevance", 0.0),
                completeness=ev.get("completeness", 0.0),
                structure=ev.get("structure", 0.0),
                feedback=ev.get("feedback", ""),
                strengths=ev.get("strengths", []),
                improvements=ev.get("improvements", []),
            )
        )
    details = report.details or {}
    return ReportOut(
        interview_id=iv.interview_id,
        role=iv.role,
        difficulty=iv.difficulty,
        start_time=iv.start_time,
        end_time=iv.end_time,
        answer_quality=report.answer_quality,
        speech_fluency=report.speech_fluency,
        response_structure=report.response_structure,
        gaze_attention=report.gaze_attention,
        overall_score=report.overall_score,
        integrity=IntegrityOut(**report.integrity_summary),
        events=[
            EventOut(event_type=e.event_type, severity=e.severity, timestamp=e.timestamp)
            for e in events
        ],
        strengths=details.get("strengths", []),
        improvements=details.get("improvements", []),
        questions=questions,
    )


def _collect(evaluations: list[dict], key: str, limit: int = 4) -> list[str]:
    seen: list[str] = []
    for ev in evaluations:
        for item in ev.get(key, []):
            if item not in seen:
                seen.append(item)
    return seen[:limit]


# ---------------------------------------------------------------- routes
@router.get("/options", response_model=OptionsOut)
def options(_: User = Depends(get_current_user)):
    return OptionsOut(
        roles=ROLES,
        difficulties=DIFFICULTIES,
        questions_per_interview=settings.questions_per_interview,
    )


@router.get("", response_model=list[InterviewSummary])
def list_interviews(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = (
        select(Interview, Report.overall_score)
        .outerjoin(Report, Report.interview_id == Interview.interview_id)
        .where(Interview.user_id == user.user_id)
        .order_by(Interview.interview_id.desc())
    )
    return [
        InterviewSummary(
            interview_id=iv.interview_id,
            role=iv.role,
            difficulty=iv.difficulty,
            status=iv.status,
            created_at=iv.created_at,
            end_time=iv.end_time,
            overall_score=score,
        )
        for iv, score in db.execute(stmt).all()
    ]


@router.post("", response_model=InterviewOut, status_code=status.HTTP_201_CREATED)
def create_interview(
    body: InterviewCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if body.role not in ROLES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown role.")
    if body.difficulty not in DIFFICULTIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown difficulty.")
    try:
        generated = gemini.generate_questions(body.role, body.difficulty, settings.questions_per_interview)
    except gemini.LLMError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))

    iv = Interview(user_id=user.user_id, role=body.role, difficulty=body.difficulty, status="created")
    db.add(iv)
    db.flush()
    for item in generated:
        q = Question(
            role=body.role,
            difficulty=body.difficulty,
            category=item["category"],
            question_text=item["question_text"],
        )
        db.add(q)
        db.flush()
        # One placeholder response per question; response_id order = question order.
        db.add(
            Response(
                interview_id=iv.interview_id,
                question_id=q.question_id,
                vision_stats={"frames": 0, "attentive": 0},
            )
        )
    db.commit()
    return _interview_out(iv, _pairs(db, iv.interview_id))


@router.get("/{interview_id}", response_model=InterviewOut)
def get_interview(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = _get_interview(db, user, interview_id)
    return _interview_out(iv, _pairs(db, iv.interview_id))


@router.post("/{interview_id}/abandon", response_model=InterviewOut)
def abandon_interview(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = _get_interview(db, user, interview_id)
    if iv.status == "completed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This session is already completed.")
    if iv.status != "abandoned":
        iv.status = "abandoned"
        iv.end_time = _now()
        db.commit()
    return _interview_out(iv, _pairs(db, iv.interview_id))


@router.post("/{interview_id}/device-check", response_model=DeviceCheckOut)
def device_check(
    interview_id: int,
    image: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    iv = _get_interview(db, user, interview_id)
    _require_status(iv, "created", "ready")
    result = _analyze(_read_upload(image, MAX_IMAGE_BYTES))
    n = result["face_count"]
    if n == 0:
        return DeviceCheckOut(ok=False, face_count=0, message="No face detected. Move into the frame with good lighting.")
    if n > 1:
        return DeviceCheckOut(ok=False, face_count=n, message="More than one face detected. Only the candidate should be in view.")
    if not result["frontal"]:
        return DeviceCheckOut(ok=False, face_count=1, message="Face the camera directly, then check again.")
    iv.status = "ready"
    db.commit()
    return DeviceCheckOut(ok=True, face_count=1, message="Camera and face check passed.")


@router.post("/{interview_id}/start", response_model=InterviewOut)
def start_interview(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = _get_interview(db, user, interview_id)
    if iv.status != "ready":
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete the device check before starting.")
    iv.status = "in_progress"
    iv.start_time = _now()
    iv.face_state = "ok"
    db.commit()
    return _interview_out(iv, _pairs(db, iv.interview_id))


@router.post("/{interview_id}/frames", response_model=FrameOut)
def analyse_frame(
    interview_id: int,
    image: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    iv = _get_interview(db, user, interview_id)
    _require_status(iv, "in_progress")
    result = _analyze(_read_upload(image, MAX_IMAGE_BYTES))
    count = result["face_count"]
    observed = "absent" if count == 0 else "multiple" if count > 1 else "ok"
    attentive = observed == "ok" and bool(result["frontal"])

    # Frames count toward the question currently being answered (first unanswered response).
    active = db.scalars(
        select(Response)
        .where(Response.interview_id == iv.interview_id, Response.transcript.is_(None))
        .order_by(Response.response_id)
        .limit(1)
    ).first()
    if active is not None:
        stats = dict(active.vision_stats or {"frames": 0, "attentive": 0})
        stats["frames"] += 1
        stats["attentive"] += 1 if attentive else 0
        active.vision_stats = stats

    iv.face_state, to_log = proctoring.next_face_state(iv.face_state, observed)
    logged = None
    if to_log:
        logged = FACE_EVENT_TYPES[to_log]
        _log_event(db, iv.interview_id, logged)
    db.commit()
    return FrameOut(face_count=count, attentive=attentive, event_logged=logged)


@router.post("/{interview_id}/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def browser_event(
    interview_id: int,
    body: EventIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    iv = _get_interview(db, user, interview_id)
    _require_status(iv, "in_progress")
    if body.event_type not in BROWSER_EVENT_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown event type.")
    event = _log_event(db, iv.interview_id, body.event_type)
    db.commit()
    return EventOut(event_type=event.event_type, severity=event.severity, timestamp=event.timestamp)


@router.post("/{interview_id}/questions/{question_id}/answer", response_model=AnswerOut)
def submit_answer(
    interview_id: int,
    question_id: int,
    audio: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    iv = _get_interview(db, user, interview_id)
    _require_status(iv, "in_progress")
    row = db.execute(
        select(Response, Question)
        .join(Question, Question.question_id == Response.question_id)
        .where(Response.interview_id == interview_id, Response.question_id == question_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found in this interview.")
    resp, question = row
    if resp.transcript is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This question has already been answered.")

    data = _read_upload(audio, MAX_AUDIO_BYTES)
    try:
        asr = worker_client.transcribe(data, audio.filename or "answer.webm", audio.content_type or "application/octet-stream")
    except worker_client.WorkerError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))

    transcript = str(asr.get("text", "")).strip()
    duration = float(asr.get("duration_sec", 0.0))
    metrics = scoring.speech_metrics(transcript, duration)

    if metrics["words"] < settings.min_answer_words:
        evaluation = {
            "relevance": 0.0,
            "completeness": 0.0,
            "structure": 0.0,
            "feedback": "No clear speech was detected in this answer.",
            "strengths": [],
            "improvements": ["Speak clearly into the microphone and answer within the time limit."],
        }
    else:
        try:
            evaluation = gemini.evaluate_answer(
                iv.role, iv.difficulty, question.category, question.question_text, transcript
            )
        except gemini.LLMError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))

    resp.transcript = transcript
    resp.duration_sec = round(duration, 1)
    resp.speaking_rate = metrics["speaking_rate"]
    resp.filler_count = metrics["filler_count"]
    resp.answer_score = round((evaluation["relevance"] + evaluation["completeness"]) / 2, 1)
    resp.evaluation = evaluation
    db.commit()

    return AnswerOut(
        question_id=question_id,
        transcript=transcript,
        speaking_rate=resp.speaking_rate,
        filler_count=resp.filler_count,
        duration_sec=resp.duration_sec,
        answer_score=resp.answer_score,
        relevance=evaluation["relevance"],
        completeness=evaluation["completeness"],
        structure=evaluation["structure"],
        feedback=evaluation["feedback"],
        strengths=evaluation["strengths"],
        improvements=evaluation["improvements"],
    )


@router.post("/{interview_id}/complete", response_model=ReportOut)
def complete_interview(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = _get_interview(db, user, interview_id)
    if iv.status == "completed":
        report = db.scalar(select(Report).where(Report.interview_id == iv.interview_id))
        return _report_out(db, iv, report)
    _require_status(iv, "in_progress")

    pairs = _pairs(db, iv.interview_id)
    if any(r.transcript is None for r, _ in pairs):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Answer every question before finishing.")

    rows = []
    for r, _ in pairs:
        stats = r.vision_stats or {}
        rows.append(
            {
                "answer_score": r.answer_score or 0.0,
                "structure": (r.evaluation or {}).get("structure", 0.0),
                "speaking_rate": r.speaking_rate or 0.0,
                "filler_count": r.filler_count or 0,
                "words": scoring.count_words(r.transcript or ""),
                "attentive_frames": stats.get("attentive", 0),
                "total_frames": stats.get("frames", 0),
            }
        )
    scores = scoring.aggregate_scores(rows)

    events = db.scalars(select(ProctoringEvent).where(ProctoringEvent.interview_id == iv.interview_id)).all()
    integrity = proctoring.integrity_summary([(e.event_type, e.severity) for e in events])
    evaluations = [r.evaluation or {} for r, _ in pairs]

    report = Report(
        interview_id=iv.interview_id,
        answer_quality=scores["answer_quality"],
        speech_fluency=scores["speech_fluency"],
        response_structure=scores["response_structure"],
        gaze_attention=scores["gaze_attention"],
        overall_score=scores["overall_score"],
        integrity_summary=integrity,
        details={
            "strengths": _collect(evaluations, "strengths"),
            "improvements": _collect(evaluations, "improvements"),
        },
    )
    db.add(report)
    iv.status = "completed"
    iv.end_time = _now()
    db.commit()
    return _report_out(db, iv, report)


@router.get("/{interview_id}/report", response_model=ReportOut)
def get_report(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = _get_interview(db, user, interview_id)
    report = db.scalar(select(Report).where(Report.interview_id == iv.interview_id))
    if iv.status != "completed" or report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The report is not available yet.")
    return _report_out(db, iv, report)
