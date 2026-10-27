from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default="candidate")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    interviews: Mapped[list["Interview"]] = relationship(back_populates="user")


class Interview(Base):
    __tablename__ = "interviews"

    interview_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), index=True)
    role: Mapped[str] = mapped_column(String(60))
    difficulty: Mapped[str] = mapped_column(String(20))
    # created -> ready (device check passed) -> in_progress -> completed, or -> abandoned (ended early)
    status: Mapped[str] = mapped_column(String(20), default="created")
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Extra bookkeeping (not in the synopsis ER diagram): created_at for the history list,
    # face_state so face events are logged on transitions rather than on every frame.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    face_state: Mapped[str] = mapped_column(String(20), default="ok")

    user: Mapped[User] = relationship(back_populates="interviews")


class Question(Base):
    __tablename__ = "questions"

    question_id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String(60))
    difficulty: Mapped[str] = mapped_column(String(20))
    category: Mapped[str] = mapped_column(String(30))
    question_text: Mapped[str] = mapped_column(Text)


class Response(Base):
    __tablename__ = "responses"

    response_id: Mapped[int] = mapped_column(primary_key=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.interview_id"), index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.question_id"))
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)  # None = not yet answered
    speaking_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    filler_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    answer_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # JSON columns for flexible metadata: Gemini evaluation and per-answer frame counts.
    evaluation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    vision_stats: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class ProctoringEvent(Base):
    __tablename__ = "proctoring_events"

    event_id: Mapped[int] = mapped_column(primary_key=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.interview_id"), index=True)
    event_type: Mapped[str] = mapped_column(String(30))
    severity: Mapped[str] = mapped_column(String(10))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Report(Base):
    __tablename__ = "reports"

    report_id: Mapped[int] = mapped_column(primary_key=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.interview_id"), unique=True)
    answer_quality: Mapped[float] = mapped_column(Float)
    speech_fluency: Mapped[float] = mapped_column(Float)
    response_structure: Mapped[float] = mapped_column(Float)
    gaze_attention: Mapped[float | None] = mapped_column(Float, nullable=True)
    overall_score: Mapped[float] = mapped_column(Float)
    integrity_summary: Mapped[dict] = mapped_column(JSON)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # strengths / improvements
