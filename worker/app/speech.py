"""Local speech-to-text with open-source Whisper."""
import os
import tempfile
import threading
from pathlib import Path

import whisper

MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")
# Segments Whisper itself considers non-speech are dropped to avoid "hallucinated" text on silence.
NO_SPEECH_CUTOFF = 0.6

_model = None
_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        _model = whisper.load_model(MODEL_NAME)
    return _model


def transcribe(data: bytes, filename: str) -> dict:
    suffix = Path(filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(data)
        tmp.flush()
        audio = whisper.load_audio(tmp.name)  # decodes via ffmpeg to 16 kHz mono float32
    duration = len(audio) / whisper.audio.SAMPLE_RATE
    if duration < 0.5:
        return {"text": "", "duration_sec": round(duration, 2)}
    with _lock:  # one transcription at a time per worker
        result = _get_model().transcribe(
            audio, language="en", fp16=False, condition_on_previous_text=False
        )
    text = " ".join(
        seg["text"].strip()
        for seg in result.get("segments", [])
        if seg.get("no_speech_prob", 0.0) <= NO_SPEECH_CUTOFF
    ).strip()
    return {"text": text, "duration_sec": round(duration, 2)}
