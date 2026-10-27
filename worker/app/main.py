import logging

from fastapi import FastAPI, File, HTTPException, UploadFile

log = logging.getLogger("worker")
app = FastAPI(title="Computer-vision and speech worker")

MAX_BYTES = 25 * 1024 * 1024


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze-frame")
def analyze_frame(file: UploadFile = File(...)):
    from . import vision

    data = file.file.read(MAX_BYTES)
    try:
        return vision.analyze(data)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@app.post("/transcribe")
def transcribe(file: UploadFile = File(...)):
    from . import speech

    data = file.file.read(MAX_BYTES)
    try:
        return speech.transcribe(data, file.filename or "audio.webm")
    except RuntimeError as exc:  # ffmpeg could not decode the audio
        log.warning("decode failure: %s", exc)
        raise HTTPException(422, "Could not decode the audio recording.")
