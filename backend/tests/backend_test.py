"""T.E.R.E.S.A. backend API tests.

Covers: auth, readings, sessions, alerts, contacts, calendar,
doctor endpoints, and wound-photo AI analysis via Emergent LLM Key.
"""
from __future__ import annotations

import base64
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://wound-healing-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# --- Fixtures ------------------------------------------------------------
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def patient(s):
    """Register a fresh patient user and return {token, user}."""
    email = f"test_patient_{uuid.uuid4().hex[:8]}@teste.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "senha123",
        "name": "TEST Paciente", "role": "patient",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "user": data["user"], "email": email, "password": "senha123"}


@pytest.fixture(scope="session")
def doctor(s):
    email = f"test_doctor_{uuid.uuid4().hex[:8]}@teste.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "senha123",
        "name": "TEST Doctor", "role": "doctor",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "user": data["user"], "email": email}


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Health --------------------------------------------------------------
class TestHealth:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "online"


# --- Auth ----------------------------------------------------------------
class TestAuth:
    def test_register_returns_token_and_user(self, patient):
        assert patient["token"]
        u = patient["user"]
        assert u["role"] == "patient"
        assert u["email"] == patient["email"]
        assert "id" in u and "created_at" in u

    def test_register_duplicate(self, s, patient):
        r = s.post(f"{API}/auth/register", json={
            "email": patient["email"], "password": "senha123",
            "name": "dup", "role": "patient",
        })
        assert r.status_code == 400

    def test_login_success(self, s, patient):
        r = s.post(f"{API}/auth/login", json={
            "email": patient["email"], "password": patient["password"],
        })
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_wrong_password(self, s, patient):
        r = s.post(f"{API}/auth/login", json={
            "email": patient["email"], "password": "WRONG",
        })
        assert r.status_code == 401

    def test_me_requires_token(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_me_with_token(self, s, patient):
        r = s.get(f"{API}/auth/me", headers=auth_headers(patient["token"]))
        assert r.status_code == 200
        assert r.json()["email"] == patient["email"]

    def test_patch_me(self, s, patient):
        r = s.patch(
            f"{API}/auth/me",
            headers=auth_headers(patient["token"]),
            json={"age": 42, "lesion_type": "úlcera", "diabetes": True},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["age"] == 42
        assert data["lesion_type"] == "úlcera"
        assert data["diabetes"] is True

        # verify persistence via GET
        r2 = s.get(f"{API}/auth/me", headers=auth_headers(patient["token"]))
        assert r2.json()["age"] == 42


# --- Readings ------------------------------------------------------------
class TestReadings:
    def test_create_reading(self, s, patient):
        r = s.post(f"{API}/readings", headers=auth_headers(patient["token"]),
                   json={"temperature_c": 36.5, "humidity_pct": 55.2})
        assert r.status_code == 200
        data = r.json()
        assert data["temperature_c"] == 36.5
        assert "id" in data

    def test_list_readings(self, s, patient):
        r = s.get(f"{API}/readings?range=24h", headers=auth_headers(patient["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_list_readings_ranges(self, s, patient):
        for rng in ("24h", "7d", "30d"):
            r = s.get(f"{API}/readings?range={rng}", headers=auth_headers(patient["token"]))
            assert r.status_code == 200

    def test_latest_reading(self, s, patient):
        r = s.get(f"{API}/readings/latest", headers=auth_headers(patient["token"]))
        assert r.status_code == 200
        assert r.json() is not None
        assert "temperature_c" in r.json()


# --- Sessions ------------------------------------------------------------
class TestSessions:
    def test_create_session(self, s, patient):
        r = s.post(f"{API}/sessions", headers=auth_headers(patient["token"]),
                   json={"duration_min": 20, "led_intensity": 60, "ir_intensity": 40,
                         "status": "completed"})
        assert r.status_code == 200
        data = r.json()
        assert data["duration_min"] == 20
        assert data["status"] == "completed"

    def test_list_sessions(self, s, patient):
        r = s.get(f"{API}/sessions", headers=auth_headers(patient["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1


# --- Alerts --------------------------------------------------------------
class TestAlerts:
    alert_id = None

    def test_create_alert(self, s, patient):
        r = s.post(f"{API}/alerts", headers=auth_headers(patient["token"]),
                   json={"level": "warning", "title": "Test", "description": "desc",
                         "category": "system"})
        assert r.status_code == 200
        TestAlerts.alert_id = r.json()["id"]
        assert r.json()["read"] is False

    def test_list_alerts(self, s, patient):
        r = s.get(f"{API}/alerts", headers=auth_headers(patient["token"]))
        assert r.status_code == 200 and len(r.json()) >= 1

    def test_unread_count(self, s, patient):
        r = s.get(f"{API}/alerts/unread-count", headers=auth_headers(patient["token"]))
        assert r.status_code == 200
        assert r.json()["count"] >= 1

    def test_mark_read(self, s, patient):
        assert TestAlerts.alert_id
        r = s.post(f"{API}/alerts/{TestAlerts.alert_id}/read",
                   headers=auth_headers(patient["token"]))
        assert r.status_code == 200

    def test_mark_all_read(self, s, patient):
        # create another
        s.post(f"{API}/alerts", headers=auth_headers(patient["token"]),
               json={"level": "info", "title": "T2", "description": "d"})
        r = s.post(f"{API}/alerts/read-all", headers=auth_headers(patient["token"]))
        assert r.status_code == 200
        r2 = s.get(f"{API}/alerts/unread-count", headers=auth_headers(patient["token"]))
        assert r2.json()["count"] == 0


# --- Contacts ------------------------------------------------------------
class TestContacts:
    contact_id = None

    def test_create_contact(self, s, patient):
        r = s.post(f"{API}/contacts", headers=auth_headers(patient["token"]),
                   json={"name": "TEST Doc", "role": "Médico", "phone": "+5511999990000"})
        assert r.status_code == 200
        TestContacts.contact_id = r.json()["id"]

    def test_list_contacts(self, s, patient):
        r = s.get(f"{API}/contacts", headers=auth_headers(patient["token"]))
        assert r.status_code == 200
        assert any(c["id"] == TestContacts.contact_id for c in r.json())

    def test_delete_contact(self, s, patient):
        r = s.delete(f"{API}/contacts/{TestContacts.contact_id}",
                     headers=auth_headers(patient["token"]))
        assert r.status_code == 200
        # verify deleted
        r2 = s.get(f"{API}/contacts", headers=auth_headers(patient["token"]))
        assert not any(c["id"] == TestContacts.contact_id for c in r2.json())


# --- Calendar ------------------------------------------------------------
class TestCalendar:
    def test_day_summary(self, s, patient):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = s.get(f"{API}/calendar/day/{today}",
                  headers=auth_headers(patient["token"]))
        assert r.status_code == 200
        data = r.json()
        assert "readings" in data and "sessions" in data and "photos" in data
        # We created readings + sessions above
        assert data["session_count"] >= 1

    def test_day_summary_bad_date(self, s, patient):
        r = s.get(f"{API}/calendar/day/not-a-date",
                  headers=auth_headers(patient["token"]))
        assert r.status_code == 400

    def test_month_summary(self, s, patient):
        now = datetime.now(timezone.utc)
        r = s.get(f"{API}/calendar/month/{now.year}/{now.month}",
                  headers=auth_headers(patient["token"]))
        assert r.status_code == 200
        assert "days" in r.json()


# --- Doctor role ---------------------------------------------------------
class TestDoctor:
    def test_patient_forbidden(self, s, patient):
        r = s.get(f"{API}/doctor/patients", headers=auth_headers(patient["token"]))
        assert r.status_code == 403

    def test_doctor_lists_patients(self, s, doctor):
        r = s.get(f"{API}/doctor/patients", headers=auth_headers(doctor["token"]))
        assert r.status_code == 200
        lst = r.json()
        assert isinstance(lst, list)
        assert all(u["role"] == "patient" for u in lst)


# --- Wound photo AI analysis --------------------------------------------
class TestWoundAnalysis:
    def test_analyze_real_image(self, s, patient):
        # Use a real JPEG from disk (not solid color)
        img_path = "/tmp/wound_small.jpg"
        assert os.path.exists(img_path), "Test image missing"
        with open(img_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        r = s.post(
            f"{API}/wound-photos/analyze",
            headers=auth_headers(patient["token"]),
            json={"image_base64": b64},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "analysis" in data and data["analysis"] is not None
        a = data["analysis"]
        for key in ("estimated_area_cm2", "predominant_color", "inflammation_level",
                    "granulation_quality", "evolution", "estimated_days_remaining",
                    "healing_percentage", "notes"):
            assert key in a, f"missing {key}"
        assert a["inflammation_level"] in ("low", "medium", "high")
        assert a["granulation_quality"] in ("poor", "fair", "good", "excellent")
        assert a["evolution"] in ("worsening", "stable", "improving", "well_healing")
        assert 0 <= a["healing_percentage"] <= 100
