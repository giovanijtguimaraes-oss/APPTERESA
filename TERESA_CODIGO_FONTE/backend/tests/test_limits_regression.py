"""Regression tests for the 6 endpoints that received a MongoDB `.limit()` clause.

Endpoints under test:
    - GET /api/readings              (limit 2000)   -- also range=24h|7d|30d
    - GET /api/sessions              (limit 200)
    - GET /api/alerts                (limit 200)
    - GET /api/alerts/unread-count   (no limit change, just verify still works)
    - GET /api/contacts              (limit 500)
    - GET /api/wound-photos          (limit 100)
    - GET /api/wound-photos/latest   (no limit, verify still works)
    - GET /api/doctor/patients       (limit 1000)

Goal: confirm the endpoints STILL return correct data (no truncation below cap,
correct filtering, correct auth) after the .limit() clauses were added.
Skips the expensive wound-photo AI analyze endpoint (already validated).
"""
from __future__ import annotations

import base64
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://wound-healing-1.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Fresh session-scoped users so tests are isolated from prior data.
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def patient(s):
    email = f"test_limit_patient_{uuid.uuid4().hex[:8]}@teste.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "senha123",
        "name": "TEST Limit Patient", "role": "patient",
    })
    assert r.status_code == 200, r.text
    return r.json()  # {token, user}


@pytest.fixture(scope="module")
def doctor(s):
    email = f"test_limit_doctor_{uuid.uuid4().hex[:8]}@teste.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "senha123",
        "name": "TEST Limit Doctor", "role": "doctor",
    })
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Smoke — auth still functional.
# ---------------------------------------------------------------------------
class TestSmokeAuth:
    def test_register_login_me(self, s, patient):
        # register already succeeded via fixture; verify login + me round-trip.
        email = patient["user"]["email"]
        r = s.post(f"{API}/auth/login", json={"email": email, "password": "senha123"})
        assert r.status_code == 200
        tok = r.json()["token"]
        r2 = s.get(f"{API}/auth/me", headers=_auth(tok))
        assert r2.status_code == 200
        assert r2.json()["email"] == email


# ---------------------------------------------------------------------------
# /api/readings — limit 2000, filtered by range.
# ---------------------------------------------------------------------------
class TestReadingsLimit:
    N = 5  # well below 2000 cap

    def test_bulk_create_readings(self, s, patient):
        for i in range(self.N):
            r = s.post(
                f"{API}/readings",
                headers=_auth(patient["token"]),
                json={"temperature_c": 36.0 + i * 0.1, "humidity_pct": 50.0 + i},
            )
            assert r.status_code == 200

    @pytest.mark.parametrize("rng", ["24h", "7d", "30d"])
    def test_list_range(self, s, patient, rng):
        r = s.get(f"{API}/readings?range={rng}", headers=_auth(patient["token"]))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # We inserted N in this test module; range 24h/7d/30d all include "now".
        assert len(data) >= self.N, f"expected >= {self.N} readings, got {len(data)}"
        # verify structure & our newly-created values are present
        temps = [d["temperature_c"] for d in data]
        assert 36.0 in temps or 36.1 in temps or 36.4 in temps

    def test_latest_returns_most_recent(self, s, patient):
        r = s.get(f"{API}/readings/latest", headers=_auth(patient["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body is not None
        assert "temperature_c" in body


# ---------------------------------------------------------------------------
# /api/sessions — limit 200.
# ---------------------------------------------------------------------------
class TestSessionsLimit:
    N = 4

    def test_bulk_create_sessions(self, s, patient):
        for i in range(self.N):
            r = s.post(
                f"{API}/sessions",
                headers=_auth(patient["token"]),
                json={
                    "duration_min": 10 + i,
                    "led_intensity": 50,
                    "ir_intensity": 30,
                    "status": "completed",
                },
            )
            assert r.status_code == 200

    def test_list_returns_all_created(self, s, patient):
        r = s.get(f"{API}/sessions", headers=_auth(patient["token"]))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= self.N
        # verify at least the duration values we created are present
        durations = {d["duration_min"] for d in data}
        assert durations.issuperset({10, 11, 12, 13})


# ---------------------------------------------------------------------------
# /api/alerts — limit 200 + unread-count.
# ---------------------------------------------------------------------------
class TestAlertsLimit:
    N = 3
    created_ids: list[str] = []

    def test_bulk_create_alerts(self, s, patient):
        TestAlertsLimit.created_ids = []
        for i in range(self.N):
            r = s.post(
                f"{API}/alerts",
                headers=_auth(patient["token"]),
                json={
                    "level": "warning",
                    "title": f"TEST alert {i}",
                    "description": "regression",
                    "category": "system",
                },
            )
            assert r.status_code == 200
            TestAlertsLimit.created_ids.append(r.json()["id"])

    def test_list_returns_all_created(self, s, patient):
        r = s.get(f"{API}/alerts", headers=_auth(patient["token"]))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        got_ids = {a["id"] for a in data}
        assert got_ids.issuperset(set(TestAlertsLimit.created_ids)), (
            f"expected created ids {TestAlertsLimit.created_ids} to all be in list"
        )

    def test_unread_count(self, s, patient):
        r = s.get(f"{API}/alerts/unread-count", headers=_auth(patient["token"]))
        assert r.status_code == 200
        body = r.json()
        assert "count" in body
        assert body["count"] >= self.N


# ---------------------------------------------------------------------------
# /api/contacts — limit 500.
# ---------------------------------------------------------------------------
class TestContactsLimit:
    N = 3
    created_ids: list[str] = []

    def test_bulk_create_contacts(self, s, patient):
        TestContactsLimit.created_ids = []
        for i in range(self.N):
            r = s.post(
                f"{API}/contacts",
                headers=_auth(patient["token"]),
                json={
                    "name": f"TEST Contact {i}",
                    "role": "Médico",
                    "phone": f"+551199990000{i}",
                },
            )
            assert r.status_code == 200
            TestContactsLimit.created_ids.append(r.json()["id"])

    def test_list_returns_all_created(self, s, patient):
        r = s.get(f"{API}/contacts", headers=_auth(patient["token"]))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        got_ids = {c["id"] for c in data}
        assert got_ids.issuperset(set(TestContactsLimit.created_ids))
        # verify sort order is by name asc (limit clause preserves it)
        names = [c["name"] for c in data]
        assert names == sorted(names, key=lambda x: x.lower()) or names == sorted(names)


# ---------------------------------------------------------------------------
# /api/wound-photos — limit 100. We DO NOT call analyze (per review).
# Instead we insert a photo directly by calling analyze once with a tiny cached
# image if available, otherwise we skip photo creation and just verify list.
# ---------------------------------------------------------------------------
class TestWoundPhotosLimit:
    """List/latest wound-photos still work under the new .limit(100) clause.

    We don't call /wound-photos/analyze here (skipped per review). We rely on
    photos possibly inserted by previous test runs, or simply verify the
    endpoints respond correctly with an empty or non-empty list.
    """

    def test_list_ok(self, s, patient):
        r = s.get(f"{API}/wound-photos", headers=_auth(patient["token"]))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # limit is 100, so len must be <= 100
        assert len(data) <= 100

    def test_latest_ok(self, s, patient):
        r = s.get(f"{API}/wound-photos/latest", headers=_auth(patient["token"]))
        assert r.status_code == 200
        # returns null or a WoundPhotoResponse
        body = r.json()
        assert body is None or "id" in body

    @pytest.mark.skipif(
        not os.path.exists("/tmp/wound_small.jpg"),
        reason="wound_small.jpg not present; skipping create-and-list photo check",
    )
    def test_create_then_list_contains(self, s, patient):
        """Single analyze call to ensure list endpoint returns a newly inserted item."""
        with open("/tmp/wound_small.jpg", "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        r = s.post(
            f"{API}/wound-photos/analyze",
            headers=_auth(patient["token"]),
            json={"image_base64": b64},
            timeout=120,
        )
        if r.status_code != 200:
            pytest.skip(f"analyze unavailable ({r.status_code}); skipping")
        new_id = r.json()["id"]

        r2 = s.get(f"{API}/wound-photos", headers=_auth(patient["token"]))
        assert r2.status_code == 200
        ids = {p["id"] for p in r2.json()}
        assert new_id in ids

        r3 = s.get(f"{API}/wound-photos/latest", headers=_auth(patient["token"]))
        assert r3.status_code == 200
        assert r3.json()["id"] == new_id


# ---------------------------------------------------------------------------
# /api/doctor/patients — limit 1000 + role check preserved.
# ---------------------------------------------------------------------------
class TestDoctorPatientsLimit:
    def test_patient_forbidden(self, s, patient):
        r = s.get(f"{API}/doctor/patients", headers=_auth(patient["token"]))
        assert r.status_code == 403

    def test_doctor_lists_patients(self, s, doctor, patient):
        # ensure the module's freshly registered patient exists first
        r = s.get(f"{API}/doctor/patients", headers=_auth(doctor["token"]))
        assert r.status_code == 200
        lst = r.json()
        assert isinstance(lst, list)
        assert len(lst) >= 1
        # only patients returned
        assert all(u["role"] == "patient" for u in lst)
        # limit clause preserves cap
        assert len(lst) <= 1000
        # our patient should show up
        emails = {u["email"] for u in lst}
        assert patient["user"]["email"] in emails
