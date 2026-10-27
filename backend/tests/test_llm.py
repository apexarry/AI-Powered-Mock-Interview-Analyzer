import json

import httpx
import pytest

from app.config import settings
from app.services import gemini


def _questions_json(count: int) -> str:
    return json.dumps([{"category": "technical", "question_text": f"Q{i}"} for i in range(count)])


def test_gemini_is_primary(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-key")
    monkeypatch.setattr(settings, "groq_api_key", "groq-key")
    calls: list[str] = []

    def fake_gemini(prompt):
        calls.append("gemini")
        return _questions_json(3)

    def fake_groq(prompt):
        calls.append("groq")
        return "[]"

    monkeypatch.setattr(gemini, "_gemini_generate", fake_gemini)
    monkeypatch.setattr(gemini, "_groq_generate", fake_groq)

    questions = gemini.generate_questions("Backend Developer", "Beginner", 3)

    assert len(questions) == 3
    assert calls == ["gemini"]


def test_falls_back_to_groq_when_gemini_fails(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-key")
    monkeypatch.setattr(settings, "groq_api_key", "groq-key")
    calls: list[str] = []

    def fake_gemini(prompt):
        calls.append("gemini")
        raise RuntimeError("503 Service Unavailable")

    def fake_groq(prompt):
        calls.append("groq")
        return json.dumps(
            {
                "relevance": 90,
                "completeness": 80,
                "structure": 70,
                "feedback": "Good.",
                "strengths": ["Clear"],
                "improvements": ["Add detail"],
            }
        )

    monkeypatch.setattr(gemini, "_gemini_generate", fake_gemini)
    monkeypatch.setattr(gemini, "_groq_generate", fake_groq)

    result = gemini.evaluate_answer("Backend Developer", "Beginner", "technical", "Q?", "answer text")

    assert result["relevance"] == 90.0
    assert calls == ["gemini", "gemini", "groq"]  # Gemini retried once, then Groq


def test_falls_back_when_gemini_json_is_unusable(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-key")
    monkeypatch.setattr(settings, "groq_api_key", "groq-key")
    monkeypatch.setattr(gemini, "_gemini_generate", lambda prompt: _questions_json(1))
    monkeypatch.setattr(gemini, "_groq_generate", lambda prompt: _questions_json(3))

    questions = gemini.generate_questions("Backend Developer", "Beginner", 3)

    assert len(questions) == 3


def test_raises_when_all_providers_fail(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "key")
    monkeypatch.setattr(settings, "groq_api_key", "key")

    def boom(prompt):
        raise RuntimeError("provider down")

    monkeypatch.setattr(gemini, "_gemini_generate", boom)
    monkeypatch.setattr(gemini, "_groq_generate", boom)

    with pytest.raises(gemini.LLMError) as exc:
        gemini.generate_questions("Backend Developer", "Beginner", 3)

    assert "Gemini" in str(exc.value)
    assert "Groq" in str(exc.value)


def test_raises_when_no_provider_configured(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "groq_api_key", "")

    with pytest.raises(gemini.LLMError):
        gemini.generate_questions("Backend Developer", "Beginner", 3)


def test_evaluate_answer_clamps_and_limits(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "key")
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(
        gemini,
        "_gemini_generate",
        lambda prompt: json.dumps(
            {
                "relevance": 150,
                "completeness": -5,
                "structure": 72.6,
                "feedback": "  Good.  ",
                "strengths": ["a", "b", "c", "d"],
                "improvements": ["x"],
            }
        ),
    )

    result = gemini.evaluate_answer("Backend Developer", "Beginner", "technical", "Q?", "text")

    assert result["relevance"] == 100.0
    assert result["completeness"] == 0.0
    assert result["structure"] == 73.0
    assert result["feedback"] == "Good."
    assert result["strengths"] == ["a", "b", "c"]


def test_clean_json_strips_code_fences():
    assert gemini._clean_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert gemini._clean_json("[1, 2]") == [1, 2]


def test_groq_request_shape(monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "groq-key")
    monkeypatch.setattr(settings, "groq_model", "llama-test")
    captured: dict = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"ok": true}'}}]},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(gemini.httpx, "post", fake_post)

    assert gemini._groq_generate("hello") == '{"ok": true}'
    assert captured["url"] == gemini.GROQ_CHAT_URL
    assert captured["headers"]["Authorization"] == "Bearer groq-key"
    assert captured["json"]["model"] == "llama-test"
    assert [m["role"] for m in captured["json"]["messages"]] == ["system", "user"]
