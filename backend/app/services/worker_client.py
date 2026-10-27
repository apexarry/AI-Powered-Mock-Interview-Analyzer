import httpx

from ..config import settings


class WorkerError(Exception):
    """The computer-vision / speech worker failed or is unreachable."""


_client = httpx.Client(timeout=httpx.Timeout(300.0, connect=5.0))


def _post(path: str, filename: str, content: bytes, content_type: str) -> dict:
    try:
        resp = _client.post(
            f"{settings.worker_url}{path}",
            files={"file": (filename, content, content_type)},
        )
    except httpx.HTTPError as exc:
        raise WorkerError("The analysis worker is unreachable.") from exc
    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except ValueError:
            detail = resp.text
        raise WorkerError(f"Analysis worker error: {detail}")
    return resp.json()


def transcribe(audio: bytes, filename: str, content_type: str) -> dict:
    """Returns {"text": str, "duration_sec": float}."""
    return _post("/transcribe", filename, audio, content_type)


def analyze_frame(image: bytes) -> dict:
    """Returns {"face_count": int, "frontal": bool}."""
    return _post("/analyze-frame", "frame.jpg", image, "image/jpeg")
