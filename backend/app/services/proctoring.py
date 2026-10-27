from collections import Counter

from ..constants import SEVERITY_POINTS


def next_face_state(prev: str, observed: str) -> tuple[str, str | None]:
    """Debounced face-state machine.

    observed is one of "ok", "absent", "multiple". An event is only emitted after two
    consecutive bad frames, and only once per episode, so a single missed detection
    does not create noise in the proctoring log.

    Returns (new_state, event_to_log) where event_to_log is "absent", "multiple" or None.
    """
    if observed == "ok":
        return "ok", None
    if prev == observed:
        return observed, None
    if prev == f"{observed}_pending":
        return observed, observed
    return f"{observed}_pending", None


def integrity_summary(events: list[tuple[str, str]]) -> dict:
    """events: list of (event_type, severity). Reported separately from the performance score."""
    by_type = Counter(t for t, _ in events)
    by_severity = Counter(s for _, s in events)
    points = sum(SEVERITY_POINTS.get(s, 1) for _, s in events)
    if points == 0:
        indicator = "clean"
    elif points <= 5:
        indicator = "minor"
    elif points <= 15:
        indicator = "moderate"
    else:
        indicator = "significant"
    return {
        "event_count": len(events),
        "indicator": indicator,
        "points": points,
        "by_type": dict(by_type),
        "by_severity": dict(by_severity),
    }
