from tests.conftest import register

JPEG = ("frame.jpg", b"\xff\xd8fakejpeg", "image/jpeg")
AUDIO = ("answer.webm", b"fake-audio", "audio/webm")


def create(client, auth, role="Software Engineer", difficulty="Intermediate"):
    r = client.post("/api/interviews", json={"role": role, "difficulty": difficulty}, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()


def pass_check_and_start(client, auth, iv_id):
    r = client.post(f"/api/interviews/{iv_id}/device-check", files={"image": JPEG}, headers=auth)
    assert r.status_code == 200 and r.json()["ok"], r.text
    r = client.post(f"/api/interviews/{iv_id}/start", headers=auth)
    assert r.status_code == 200, r.text


def test_create_validates_role_and_difficulty(client, auth):
    assert client.post("/api/interviews", json={"role": "Astronaut", "difficulty": "Beginner"}, headers=auth).status_code == 422
    assert client.post("/api/interviews", json={"role": "Data Analyst", "difficulty": "Impossible"}, headers=auth).status_code == 422


def test_creates_five_questions(client, auth):
    iv = create(client, auth)
    assert len(iv["questions"]) == 5
    assert iv["status"] == "created"
    assert not any(q["answered"] for q in iv["questions"])


def test_cannot_start_without_device_check(client, auth):  # TC03
    iv = create(client, auth)
    r = client.post(f"/api/interviews/{iv['interview_id']}/start", headers=auth)
    assert r.status_code == 409


def test_device_check_fails_without_single_face(client, auth):
    iv = create(client, auth)
    client.worker_state["faces"] = 0
    r = client.post(f"/api/interviews/{iv['interview_id']}/device-check", files={"image": JPEG}, headers=auth)
    assert r.json()["ok"] is False
    client.worker_state["faces"] = 2
    r = client.post(f"/api/interviews/{iv['interview_id']}/device-check", files={"image": JPEG}, headers=auth)
    assert r.json()["ok"] is False and r.json()["face_count"] == 2
    assert client.post(f"/api/interviews/{iv['interview_id']}/start", headers=auth).status_code == 409


def test_multiple_faces_logged_after_two_frames(client, auth):  # TC04
    iv = create(client, auth)
    iid = iv["interview_id"]
    pass_check_and_start(client, auth, iid)
    client.worker_state["faces"] = 2
    first = client.post(f"/api/interviews/{iid}/frames", files={"image": JPEG}, headers=auth).json()
    assert first["event_logged"] is None
    second = client.post(f"/api/interviews/{iid}/frames", files={"image": JPEG}, headers=auth).json()
    assert second["event_logged"] == "multiple_faces"
    third = client.post(f"/api/interviews/{iid}/frames", files={"image": JPEG}, headers=auth).json()
    assert third["event_logged"] is None


def test_tab_switch_event_logged(client, auth):  # TC05
    iv = create(client, auth)
    iid = iv["interview_id"]
    pass_check_and_start(client, auth, iid)
    r = client.post(f"/api/interviews/{iid}/events", json={"event_type": "tab_switch"}, headers=auth)
    assert r.status_code == 201 and r.json()["severity"] == "medium"
    assert client.post(f"/api/interviews/{iid}/events", json={"event_type": "bogus"}, headers=auth).status_code == 422


def test_events_rejected_before_start(client, auth):
    iv = create(client, auth)
    r = client.post(f"/api/interviews/{iv['interview_id']}/events", json={"event_type": "tab_switch"}, headers=auth)
    assert r.status_code == 409


def test_answer_and_double_submit(client, auth):  # TC06
    iv = create(client, auth)
    iid = iv["interview_id"]
    pass_check_and_start(client, auth, iid)
    qid = iv["questions"][0]["question_id"]
    r = client.post(f"/api/interviews/{iid}/questions/{qid}/answer", files={"audio": AUDIO}, headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["answer_score"] == 75.0
    assert body["filler_count"] == 1
    assert body["speaking_rate"] > 0
    again = client.post(f"/api/interviews/{iid}/questions/{qid}/answer", files={"audio": AUDIO}, headers=auth)
    assert again.status_code == 409


def test_cannot_complete_with_unanswered_questions(client, auth):
    iv = create(client, auth)
    iid = iv["interview_id"]
    pass_check_and_start(client, auth, iid)
    assert client.post(f"/api/interviews/{iid}/complete", headers=auth).status_code == 400


def test_full_session_produces_stored_report(client, auth):  # TC07
    iv = create(client, auth)
    iid = iv["interview_id"]
    pass_check_and_start(client, auth, iid)
    client.post(f"/api/interviews/{iid}/events", json={"event_type": "tab_switch"}, headers=auth)
    for q in iv["questions"]:
        client.post(f"/api/interviews/{iid}/frames", files={"image": JPEG}, headers=auth)
        r = client.post(f"/api/interviews/{iid}/questions/{q['question_id']}/answer", files={"audio": AUDIO}, headers=auth)
        assert r.status_code == 200, r.text
    r = client.post(f"/api/interviews/{iid}/complete", headers=auth)
    assert r.status_code == 200, r.text
    report = r.json()
    assert report["answer_quality"] == 75.0
    assert report["response_structure"] == 60.0
    assert report["gaze_attention"] == 100.0
    assert report["integrity"]["event_count"] == 1
    assert len(report["questions"]) == 5

    # Stored report can be fetched later and appears in history.
    assert client.get(f"/api/interviews/{iid}/report", headers=auth).json()["overall_score"] == report["overall_score"]
    history = client.get("/api/interviews", headers=auth).json()
    assert history[0]["status"] == "completed" and history[0]["overall_score"] == report["overall_score"]
    # Completing twice is idempotent.
    assert client.post(f"/api/interviews/{iid}/complete", headers=auth).status_code == 200


def test_abandon_marks_session_ended(client, auth):
    iv = create(client, auth)
    iid = iv["interview_id"]
    pass_check_and_start(client, auth, iid)
    r = client.post(f"/api/interviews/{iid}/abandon", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "abandoned"
    history = client.get("/api/interviews", headers=auth).json()
    assert history[0]["status"] == "abandoned"
    # An ended session cannot be started or completed afterwards.
    assert client.post(f"/api/interviews/{iid}/start", headers=auth).status_code == 409
    assert client.post(f"/api/interviews/{iid}/complete", headers=auth).status_code == 409


def test_cannot_abandon_completed_session(client, auth):
    iv = create(client, auth)
    iid = iv["interview_id"]
    pass_check_and_start(client, auth, iid)
    for q in iv["questions"]:
        client.post(f"/api/interviews/{iid}/questions/{q['question_id']}/answer", files={"audio": AUDIO}, headers=auth)
    assert client.post(f"/api/interviews/{iid}/complete", headers=auth).status_code == 200
    assert client.post(f"/api/interviews/{iid}/abandon", headers=auth).status_code == 400


def test_interviews_are_private_to_their_owner(client, auth):
    iv = create(client, auth)
    other = register(client, email="other@example.com", name="Other")
    iid = iv["interview_id"]
    assert client.get(f"/api/interviews/{iid}", headers=other).status_code == 404
    assert client.post(f"/api/interviews/{iid}/start", headers=other).status_code == 404
    assert client.get("/api/interviews", headers=other).json() == []
