from tests.conftest import register


def test_register_duplicate_email_rejected(client):  # TC01
    register(client)
    r = client.post("/api/auth/register", json={"name": "B", "email": "A@example.com", "password": "another-pass-1"})
    assert r.status_code == 409


def test_login_wrong_password_denied(client):  # TC02
    register(client)
    r = client.post("/api/auth/login", json={"email": "a@example.com", "password": "wrong-password"})
    assert r.status_code == 401
    assert "access_token" not in r.text


def test_login_unknown_email_same_error(client):
    r = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever-123"})
    assert r.status_code == 401


def test_login_success_and_me(client):
    register(client)
    r = client.post("/api/auth/login", json={"email": "a@example.com", "password": "correct-horse-1"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["email"] == "a@example.com"


def test_password_never_returned(client):
    headers = register(client)
    r = client.get("/api/auth/me", headers=headers)
    assert "password" not in r.text


def test_protected_routes_require_jwt(client):
    assert client.get("/api/interviews").status_code == 401
    assert client.get("/api/interviews", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


def test_short_password_rejected(client):
    r = client.post("/api/auth/register", json={"name": "B", "email": "b@example.com", "password": "short"})
    assert r.status_code == 422
