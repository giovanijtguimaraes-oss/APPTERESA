"""T.E.R.E.S.A. backend API tests (iteration 4).

Covers the new roles & doctor workflow:
  - 3-role registration (doctor / patient_monitored / patient_autonomous)
  - legacy role 'patient' migration (joao@teste.com -> patient_monitored)
  - doctor create / list (linked_only) / data / alert / isolation
  - wound-photo feedback (doctor-only, patient must be linked)
  - POST/GET /api/readings now carries optional state_system
  - unchanged endpoints still work (auth, readings, sessions, alerts,
    contacts, calendar).
Wound-analyze (LLM) is kept but marked slow and executed ONCE per suite.
"""
from __future__ import annotations

import base64
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# --- Fixtures ------------------------------------------------------------
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _register(sess, role, name_hint):
    email = f"test_{name_hint}_{uuid.uuid4().hex[:8]}@teste.com"
    r = sess.post(f"{API}/auth/register", json={
        "email": email, "password": "senha123",
        "name": f"TEST {name_hint}", "role": role,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "user": data["user"],
            "email": email, "password": "senha123"}


@pytest.fixture(scope="session")
def patient(s):
    return _register(s, "patient_monitored", "pm")


@pytest.fixture(scope="session")
def patient_auto(s):
    return _register(s, "patient_autonomous", "pa")


@pytest.fixture(scope="session")
def doctor(s):
    return _register(s, "doctor", "doc")


@pytest.fixture(scope="session")
def other_doctor(s):
    return _register(s, "doctor", "doc2")


def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Health & role validation -------------------------------------------
class TestHealth:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "online"

    def test_register_rejects_bad_role(self, s):
        r = s.post(f"{API}/auth/register", json={
            "email": f"bad_{uuid.uuid4().hex[:6]}@teste.com",
            "password": "senha123", "name": "x", "role": "nurse",
        })
        assert r.status_code == 422

    def test_register_accepts_all_three_roles(self, patient, patient_auto, doctor):
        assert patient["user"]["role"] == "patient_monitored"
        assert patient_auto["user"]["role"] == "patient_autonomous"
        assert doctor["user"]["role"] == "doctor"


# --- Auth basics --------------------------------------------------------
class TestAuth:
    def test_login_success(self, s, patient):
        r = s.post(f"{API}/auth/login", json={
            "email": patient["email"], "password": "senha123"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "patient_monitored"

    def test_login_wrong_password(self, s, patient):
        r = s.post(f"{API}/auth/login", json={
            "email": patient["email"], "password": "WRONG"})
        assert r.status_code == 401

    def test_me_requires_token(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_me_with_token(self, s, patient):
        r = s.get(f"{API}/auth/me", headers=hdr(patient["token"]))
        assert r.status_code == 200
        assert r.json()["email"] == patient["email"]

    def test_patch_me(self, s, patient):
        r = s.patch(f"{API}/auth/me", headers=hdr(patient["token"]),
                    json={"age": 42, "lesion_type": "úlcera", "diabetes": True})
        assert r.status_code == 200
        d = r.json()
        assert d["age"] == 42 and d["lesion_type"] == "úlcera"

    def test_legacy_patient_migrated(self, s):
        """joao@teste.com was created with role='patient' — must now login
        and return role='patient_monitored' (startup migration + normalization)."""
        r = s.post(f"{API}/auth/login", json={
            "email": "joao@teste.com", "password": "senha123"})
        if r.status_code != 200:
            pytest.skip("joao@teste.com not present in this DB")
        assert r.json()["user"]["role"] == "patient_monitored"


# --- Readings (now with state_system) -----------------------------------
class TestReadings:
    def test_create_reading_with_state(self, s, patient):
        r = s.post(f"{API}/readings", headers=hdr(patient["token"]),
                   json={"temperature_c": 36.8, "humidity_pct": 52.4,
                         "state_system": "EM_TRATAMENTO"})
        assert r.status_code == 200
        d = r.json()
        assert d["temperature_c"] == 36.8
        assert d["state_system"] == "EM_TRATAMENTO"

    def test_list_readings_returns_state_system(self, s, patient):
        r = s.get(f"{API}/readings?range=24h", headers=hdr(patient["token"]))
        assert r.status_code == 200
        lst = r.json()
        assert any(x.get("state_system") == "EM_TRATAMENTO" for x in lst)

    def test_list_readings_ranges(self, s, patient):
        for rng in ("24h", "7d", "30d"):
            r = s.get(f"{API}/readings?range={rng}", headers=hdr(patient["token"]))
            assert r.status_code == 200

    def test_latest_reading(self, s, patient):
        r = s.get(f"{API}/readings/latest", headers=hdr(patient["token"]))
        assert r.status_code == 200
        assert r.json() is not None


# --- Sessions / Alerts / Contacts / Calendar (regression) ---------------
class TestSessions:
    def test_create_and_list(self, s, patient):
        r = s.post(f"{API}/sessions", headers=hdr(patient["token"]),
                   json={"duration_min": 20, "status": "completed"})
        assert r.status_code == 200
        r2 = s.get(f"{API}/sessions", headers=hdr(patient["token"]))
        assert r2.status_code == 200 and len(r2.json()) >= 1


class TestAlerts:
    def test_crud_and_unread(self, s, patient):
        r = s.post(f"{API}/alerts", headers=hdr(patient["token"]),
                   json={"level": "warning", "title": "T", "description": "d"})
        assert r.status_code == 200
        aid = r.json()["id"]
        rc = s.get(f"{API}/alerts/unread-count", headers=hdr(patient["token"]))
        assert rc.json()["count"] >= 1
        s.post(f"{API}/alerts/{aid}/read", headers=hdr(patient["token"]))
        s.post(f"{API}/alerts/read-all", headers=hdr(patient["token"]))
        rc2 = s.get(f"{API}/alerts/unread-count", headers=hdr(patient["token"]))
        assert rc2.json()["count"] == 0


class TestContacts:
    def test_crud(self, s, patient):
        r = s.post(f"{API}/contacts", headers=hdr(patient["token"]),
                   json={"name": "TEST Doc", "role": "Médico", "phone": "+5511999990000"})
        cid = r.json()["id"]
        rl = s.get(f"{API}/contacts", headers=hdr(patient["token"]))
        assert any(c["id"] == cid for c in rl.json())
        s.delete(f"{API}/contacts/{cid}", headers=hdr(patient["token"]))


class TestCalendar:
    def test_day_month(self, s, patient):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = s.get(f"{API}/calendar/day/{today}", headers=hdr(patient["token"]))
        assert r.status_code == 200
        assert "readings" in r.json()
        r2 = s.get(f"{API}/calendar/day/not-a-date", headers=hdr(patient["token"]))
        assert r2.status_code == 400
        now = datetime.now(timezone.utc)
        rm = s.get(f"{API}/calendar/month/{now.year}/{now.month}",
                   headers=hdr(patient["token"]))
        assert rm.status_code == 200 and "days" in rm.json()


# --- Doctor endpoints — authorization & linking -------------------------
class TestDoctorAuthorization:
    def test_patients_list_forbidden_for_non_doctor(self, s, patient):
        r = s.get(f"{API}/doctor/patients", headers=hdr(patient["token"]))
        assert r.status_code == 403

    def test_patients_post_forbidden_for_non_doctor(self, s, patient):
        r = s.post(f"{API}/doctor/patients", headers=hdr(patient["token"]),
                   json={"email": f"x{uuid.uuid4().hex[:6]}@t.com",
                         "password": "senha123", "name": "x",
                         "role": "patient_monitored"})
        assert r.status_code == 403

    def test_patient_alert_forbidden_for_non_doctor(self, s, patient):
        r = s.post(f"{API}/doctor/patient/{patient['user']['id']}/alert",
                   headers=hdr(patient["token"]),
                   json={"level": "info", "title": "t", "description": "d"})
        assert r.status_code == 403

    def test_patient_data_forbidden_for_non_doctor(self, s, patient):
        r = s.get(f"{API}/doctor/patient/{patient['user']['id']}/data",
                  headers=hdr(patient["token"]))
        assert r.status_code == 403


class TestDoctorFlow:
    """Full happy path: doctor creates patient → list/data/alert → cross-doctor 403."""

    def test_create_patient_links_doctor(self, s, doctor):
        payload = {
            "email": f"test_dp_{uuid.uuid4().hex[:8]}@teste.com",
            "password": "senha123", "name": "TEST DocPatient",
            "role": "patient_monitored", "age": 55, "lesion_type": "úlcera venosa",
        }
        r = s.post(f"{API}/doctor/patients", headers=hdr(doctor["token"]),
                   json=payload)
        assert r.status_code == 201, r.text
        p = r.json()
        assert p["role"] == "patient_monitored"
        assert p["doctor_id"] == doctor["user"]["id"]
        assert p["age"] == 55
        pytest.doc_patient_id = p["id"]
        pytest.doc_patient_email = payload["email"]

    def test_list_patients_linked_only_default(self, s, doctor, other_doctor):
        # other_doctor should see 0 (no patients linked yet)
        r = s.get(f"{API}/doctor/patients", headers=hdr(other_doctor["token"]))
        assert r.status_code == 200
        for u in r.json():
            assert u["doctor_id"] == other_doctor["user"]["id"]

        # original doctor should see the created patient
        r2 = s.get(f"{API}/doctor/patients", headers=hdr(doctor["token"]))
        assert r2.status_code == 200
        ids = [u["id"] for u in r2.json()]
        assert pytest.doc_patient_id in ids
        for u in r2.json():
            assert u["doctor_id"] == doctor["user"]["id"]
            assert u["role"] in ("patient_monitored", "patient_autonomous")

    def test_doctor_can_fetch_patient_data(self, s, doctor):
        # Seed a reading as that patient first — login as the patient
        rl = s.post(f"{API}/auth/login", json={
            "email": pytest.doc_patient_email, "password": "senha123"})
        assert rl.status_code == 200
        p_tok = rl.json()["token"]
        s.post(f"{API}/readings", headers=hdr(p_tok),
               json={"temperature_c": 37.0, "humidity_pct": 55.0,
                     "state_system": "AQUECENDO"})

        r = s.get(f"{API}/doctor/patient/{pytest.doc_patient_id}/data",
                  headers=hdr(doctor["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("patient", "latest_reading", "photos",
                    "sessions", "alerts", "stats"):
            assert key in d, f"missing {key}"
        assert d["patient"]["id"] == pytest.doc_patient_id
        assert d["latest_reading"]["state_system"] == "AQUECENDO"

    def test_other_doctor_cannot_access_patient(self, s, other_doctor):
        r = s.get(f"{API}/doctor/patient/{pytest.doc_patient_id}/data",
                  headers=hdr(other_doctor["token"]))
        assert r.status_code == 403

    def test_doctor_sends_alert_to_patient(self, s, doctor):
        r = s.post(f"{API}/doctor/patient/{pytest.doc_patient_id}/alert",
                   headers=hdr(doctor["token"]),
                   json={"level": "warning", "title": "Mantenha repouso",
                         "description": "Evite esforço nas próximas 24h."})
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["sender_id"] == doctor["user"]["id"]
        assert a["sender_name"] == doctor["user"]["name"]
        assert a["user_id"] == pytest.doc_patient_id

        # Verify patient sees it
        rl = s.post(f"{API}/auth/login", json={
            "email": pytest.doc_patient_email, "password": "senha123"})
        p_tok = rl.json()["token"]
        la = s.get(f"{API}/alerts", headers=hdr(p_tok))
        assert la.status_code == 200
        titles = [x["title"] for x in la.json()]
        assert "Mantenha repouso" in titles

    def test_other_doctor_cannot_send_alert(self, s, other_doctor):
        r = s.post(f"{API}/doctor/patient/{pytest.doc_patient_id}/alert",
                   headers=hdr(other_doctor["token"]),
                   json={"level": "info", "title": "x", "description": "y"})
        assert r.status_code == 403


# --- Wound photo feedback (doctor-only) ---------------------------------
class TestWoundFeedback:
    """We skip real-LLM analyze and instead inject a photo doc directly via
    POST /api/wound-photos/analyze IF a small test image exists. If not,
    we fall back to validating the authorization guards only (403 paths)."""

    def test_feedback_forbidden_for_non_doctor(self, s, patient):
        # Even without a photo, non-doctor must be rejected (role check first).
        r = s.post(f"{API}/wound-photos/non-existent-id/feedback",
                   headers=hdr(patient["token"]),
                   json={"rating": 5, "comment": "ok"})
        assert r.status_code == 403

    def test_feedback_other_doctor_forbidden(self, s, doctor, other_doctor):
        """Create a photo under doctor's patient, then try to review it as other_doctor."""
        # Login the doc_patient and post a photo stub via direct DB-less path:
        # We can't call /analyze cheaply, so instead we create a photo by
        # calling analyze ONCE for the whole suite (expensive). To keep this
        # test independent, we rely on test_analyze_real_image to insert.
        pass  # placeholder — real check below in test_full_feedback_cycle

    @pytest.mark.slow
    def test_full_feedback_cycle(self, s, doctor, other_doctor):
        img_path = "/tmp/wound_small.jpg"
        if not os.path.exists(img_path):
            pytest.skip("wound_small.jpg not present")
        # login as the doc_patient
        rl = s.post(f"{API}/auth/login", json={
            "email": pytest.doc_patient_email, "password": "senha123"})
        p_tok = rl.json()["token"]

        with open(img_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        ra = s.post(f"{API}/wound-photos/analyze",
                    headers=hdr(p_tok),
                    json={"image_base64": b64}, timeout=180)
        assert ra.status_code == 200, ra.text
        photo = ra.json()
        pid = photo["id"]

        # Patient cannot post feedback (not doctor)
        rp = s.post(f"{API}/wound-photos/{pid}/feedback",
                    headers=hdr(p_tok),
                    json={"rating": 4})
        assert rp.status_code == 403

        # other_doctor cannot (not linked to patient)
        ro = s.post(f"{API}/wound-photos/{pid}/feedback",
                    headers=hdr(other_doctor["token"]),
                    json={"rating": 5})
        assert ro.status_code == 403

        # linked doctor CAN
        rd = s.post(f"{API}/wound-photos/{pid}/feedback",
                    headers=hdr(doctor["token"]),
                    json={"rating": 5, "comment": "Boa evolução"})
        assert rd.status_code == 200, rd.text
        fb = rd.json()
        assert fb["rating"] == 5
        assert fb["doctor_id"] == doctor["user"]["id"]

        # GET /wound-photos/{id} returns embedded feedback
        rg = s.get(f"{API}/wound-photos/{pid}", headers=hdr(p_tok))
        assert rg.status_code == 200
        full = rg.json()
        assert full.get("feedback") is not None
        assert full["feedback"]["rating"] == 5
        assert full["feedback"]["doctor_name"] == doctor["user"]["name"]
