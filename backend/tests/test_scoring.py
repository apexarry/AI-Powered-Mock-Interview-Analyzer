from app.services import proctoring, scoring


def test_filler_and_word_counts():
    text = "Um, I think, like, you know, we should basically test it"
    assert scoring.count_fillers(text) == 4  # um, like, you know, basically
    assert scoring.count_words(text) == 11


def test_speech_metrics_rate():
    m = scoring.speech_metrics("one two three four five six", 3.0)
    assert m["speaking_rate"] == 120.0
    assert m["filler_count"] == 0


def test_rate_score_band():
    assert scoring.rate_score(140) == 100
    assert scoring.rate_score(50) == 0
    assert scoring.rate_score(300) == 0
    assert 0 < scoring.rate_score(80) < 100


def test_aggregate_scores_without_frames_drops_gaze():
    rows = [
        {"answer_score": 80, "structure": 60, "speaking_rate": 140, "filler_count": 0, "words": 100,
         "attentive_frames": 0, "total_frames": 0}
    ]
    out = scoring.aggregate_scores(rows)
    assert out["gaze_attention"] is None
    assert out["answer_quality"] == 80
    assert 0 <= out["overall_score"] <= 100


def test_aggregate_scores_weighted():
    rows = [
        {"answer_score": 100, "structure": 100, "speaking_rate": 140, "filler_count": 0, "words": 100,
         "attentive_frames": 10, "total_frames": 10}
    ] * 2
    out = scoring.aggregate_scores(rows)
    assert out["overall_score"] == 100.0
    assert out["gaze_attention"] == 100.0


def test_face_state_debounce():
    state, log = proctoring.next_face_state("ok", "absent")
    assert (state, log) == ("absent_pending", None)
    state, log = proctoring.next_face_state(state, "absent")
    assert (state, log) == ("absent", "absent")
    state, log = proctoring.next_face_state(state, "absent")
    assert (state, log) == ("absent", None)  # already logged this episode
    state, log = proctoring.next_face_state(state, "ok")
    assert (state, log) == ("ok", None)
    # A single missed frame does not log
    state, log = proctoring.next_face_state("ok", "multiple")
    state, log = proctoring.next_face_state(state, "ok")
    assert (state, log) == ("ok", None)


def test_integrity_summary():
    s = proctoring.integrity_summary([("tab_switch", "medium"), ("multiple_faces", "high")])
    assert s["event_count"] == 2 and s["points"] == 8 and s["indicator"] == "moderate"
    assert proctoring.integrity_summary([])["indicator"] == "clean"
