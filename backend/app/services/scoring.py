import re

import numpy as np
import pandas as pd

from ..constants import SCORE_WEIGHTS

# Single-word fillers are matched on word boundaries; phrases are matched as phrases.
FILLER_PATTERN = re.compile(
    r"\b(?:um+|uh+|erm|hmm+|like|you know|i mean|basically|actually|sort of|kind of)\b",
    re.IGNORECASE,
)
WORD_PATTERN = re.compile(r"[A-Za-z0-9']+")


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def count_words(text: str) -> int:
    return len(WORD_PATTERN.findall(text))


def count_fillers(text: str) -> int:
    return len(FILLER_PATTERN.findall(text))


def speech_metrics(transcript: str, duration_sec: float) -> dict:
    words = count_words(transcript)
    fillers = count_fillers(transcript)
    rate = words / (duration_sec / 60.0) if duration_sec > 0 else 0.0
    return {
        "words": words,
        "filler_count": fillers,
        "speaking_rate": round(rate, 1),
        "filler_per_100": round(fillers / words * 100, 2) if words else 0.0,
    }


def rate_score(wpm: float) -> float:
    """100 inside a comfortable 110-170 wpm band, tapering to 0 at 50 and 250 wpm."""
    if wpm <= 0:
        return 0.0
    if wpm < 110:
        return clamp((wpm - 50) / 60 * 100)
    if wpm <= 170:
        return 100.0
    return clamp((250 - wpm) / 80 * 100)


def filler_score(filler_per_100: float) -> float:
    return clamp(100 - filler_per_100 * 10)


def response_fluency(wpm: float, filler_per_100: float) -> float:
    return 0.5 * rate_score(wpm) + 0.5 * filler_score(filler_per_100)


def aggregate_scores(rows: list[dict]) -> dict:
    """Combine per-answer data into report scores.

    Each row needs: answer_score, structure, speaking_rate, filler_count, words,
    attentive_frames, total_frames.
    """
    df = pd.DataFrame(rows)
    answer_quality = float(df["answer_score"].mean())
    response_structure = float(df["structure"].mean())

    per_answer = [
        response_fluency(r.speaking_rate, (r.filler_count / r.words * 100) if r.words else 0.0)
        for r in df.itertuples()
    ]
    rates = df["speaking_rate"].to_numpy(dtype=float)
    spread = float(np.std(rates)) if len(rates) > 1 else 0.0
    consistency = clamp(100 - spread * 2)
    speech_fluency = 0.85 * float(np.mean(per_answer)) + 0.15 * consistency

    total_frames = int(df["total_frames"].sum())
    attentive_frames = int(df["attentive_frames"].sum())
    gaze_attention = attentive_frames / total_frames * 100 if total_frames else None

    components = {
        "answer_quality": answer_quality,
        "response_structure": response_structure,
        "speech_fluency": speech_fluency,
        "gaze_attention": gaze_attention,
    }
    # If no frames were analysed, drop the gaze component and renormalise the weights.
    used = {k: v for k, v in components.items() if v is not None}
    weight_sum = sum(SCORE_WEIGHTS[k] for k in used)
    overall = sum(SCORE_WEIGHTS[k] * v for k, v in used.items()) / weight_sum

    return {
        "answer_quality": round(answer_quality, 1),
        "response_structure": round(response_structure, 1),
        "speech_fluency": round(speech_fluency, 1),
        "gaze_attention": round(gaze_attention, 1) if gaze_attention is not None else None,
        "overall_score": round(overall, 1),
    }
