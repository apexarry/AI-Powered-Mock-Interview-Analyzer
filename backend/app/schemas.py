from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be blank")
        return v

    @field_validator("password")
    @classmethod
    def bcrypt_limit(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: int
    name: str
    email: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class OptionsOut(BaseModel):
    roles: list[str]
    difficulties: list[str]
    questions_per_interview: int


class InterviewCreate(BaseModel):
    role: str
    difficulty: str


class QuestionOut(BaseModel):
    question_id: int
    category: str
    question_text: str
    answered: bool


class InterviewOut(BaseModel):
    interview_id: int
    role: str
    difficulty: str
    status: str
    start_time: datetime | None
    end_time: datetime | None
    questions: list[QuestionOut]


class InterviewSummary(BaseModel):
    interview_id: int
    role: str
    difficulty: str
    status: str
    created_at: datetime
    end_time: datetime | None
    overall_score: float | None


class DeviceCheckOut(BaseModel):
    ok: bool
    face_count: int
    message: str


class FrameOut(BaseModel):
    face_count: int
    attentive: bool
    event_logged: str | None


class EventIn(BaseModel):
    event_type: Literal["tab_switch", "fullscreen_exit", "camera_interrupted", "mic_interrupted"]


class EventOut(BaseModel):
    event_type: str
    severity: str
    timestamp: datetime


class AnswerOut(BaseModel):
    question_id: int
    transcript: str
    speaking_rate: float
    filler_count: int
    duration_sec: float
    answer_score: float
    relevance: float
    completeness: float
    structure: float
    feedback: str
    strengths: list[str]
    improvements: list[str]


class QuestionResult(BaseModel):
    question_text: str
    category: str
    transcript: str
    speaking_rate: float
    filler_count: int
    duration_sec: float
    answer_score: float
    relevance: float
    completeness: float
    structure: float
    feedback: str
    strengths: list[str]
    improvements: list[str]


class IntegrityOut(BaseModel):
    event_count: int
    indicator: str
    points: int
    by_type: dict[str, int]
    by_severity: dict[str, int]


class ReportOut(BaseModel):
    interview_id: int
    role: str
    difficulty: str
    start_time: datetime | None
    end_time: datetime | None
    answer_quality: float
    speech_fluency: float
    response_structure: float
    gaze_attention: float | None
    overall_score: float
    integrity: IntegrityOut
    events: list[EventOut]
    strengths: list[str]
    improvements: list[str]
    questions: list[QuestionResult]
