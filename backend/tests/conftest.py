import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-1234")
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.services import gemini, worker_client


@pytest.fixture()
def client(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # External services are mocked: Gemini API and the CV/speech worker.
    monkeypatch.setattr(
        gemini,
        "generate_questions",
        lambda role, difficulty, count: [
            {"category": "technical" if i % 2 == 0 else "behavioural", "question_text": f"Question {i + 1} for {role}?"}
            for i in range(count)
        ],
    )
    monkeypatch.setattr(
        gemini,
        "evaluate_answer",
        lambda role, difficulty, category, question, transcript: {
            "relevance": 80.0,
            "completeness": 70.0,
            "structure": 60.0,
            "feedback": "Solid answer.",
            "strengths": ["Clear"],
            "improvements": ["Add an example"],
        },
    )
    state = {"faces": 1, "frontal": True}
    monkeypatch.setattr(
        worker_client,
        "analyze_frame",
        lambda image: {"face_count": state["faces"], "frontal": state["frontal"]},
    )
    monkeypatch.setattr(
        worker_client,
        "transcribe",
        lambda audio, filename, content_type: {
            "text": "I would design the system with a clear separation of concerns um and test it well",
            "duration_sec": 6.0,
        },
    )
    with TestClient(app) as c:
        c.worker_state = state
        yield c
    app.dependency_overrides.clear()


def register(client, email="a@example.com", name="Ada"):
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "correct-horse-1"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def auth(client):
    return register(client)
