"""Tests for the doctor impersonation endpoint + Dra. Ana seed data."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://wound-healing-1.preview.emergentagent.com").rstrip("/")

ANA = {"email": "ana@teresa.med.br", "password": "ana123"}
EXPECTED_PATIENTS = {
    "carlos.lima@teresa.pct",
    "joao.pedro@teresa.pct",
    "maria.helena@teresa.pct",
}


@pytest.fixture(scope="module")
def ana_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ANA, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def ana_patients(ana_token):
    r = requests.get(
        f"{BASE_URL}/api/doctor/patients",
        headers={"Authorization": f"Bearer {ana_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


class TestSeedData:
    def test_ana_login_role_profile(self, ana_token):
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {ana_token}"},
            timeout=15,
        )
        assert r.status_code == 200
        u = r.json()
        assert u["role"] == "doctor"
        assert u["name"] == "Dra. Ana"
        assert u.get("crm") == "CRM/SP 654321"
        assert u.get("specialty") == "Dermatologia Oncológica"
        assert u.get("hospital") == "Clínica T.E.R.E.S.A."

    def test_ana_has_three_linked_patients(self, ana_patients):
        emails = {p["email"] for p in ana_patients}
        missing = EXPECTED_PATIENTS - emails
        assert not missing, f"Missing linked patients: {missing}; got {emails}"
        # roles
        by_email = {p["email"]: p for p in ana_patients}
        assert by_email["carlos.lima@teresa.pct"]["role"] == "patient_autonomous"
        assert by_email["joao.pedro@teresa.pct"]["role"] == "patient_monitored"
        assert by_email["maria.helena@teresa.pct"]["role"] == "patient_monitored"

    def test_gustavo_still_present(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "gustavo@teresa.med.br", "password": "gustavo123"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "doctor"


class TestImpersonation:
    def test_doctor_can_impersonate_linked_patient(self, ana_token, ana_patients):
        carlos = next(p for p in ana_patients if p["email"] == "carlos.lima@teresa.pct")
        r = requests.post(
            f"{BASE_URL}/api/doctor/patient/{carlos['id']}/impersonate",
            headers={"Authorization": f"Bearer {ana_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["id"] == carlos["id"]
        assert data["user"]["email"] == "carlos.lima@teresa.pct"
        assert data["impersonated_by"]["name"] == "Dra. Ana"

        # Token actually scopes to Carlos
        me = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {data['token']}"},
            timeout=15,
        )
        assert me.status_code == 200
        assert me.json()["id"] == carlos["id"]
        assert me.json()["role"] == "patient_autonomous"

    def test_patient_cannot_call_impersonate(self, ana_patients):
        # register a brand new patient
        email = f"TEST_imp_{int(time.time())}@teste.com"
        reg = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "senha123", "name": "TEST Imp", "role": "patient_monitored"},
            timeout=15,
        )
        assert reg.status_code == 200, reg.text
        pat_token = reg.json()["token"]
        target = ana_patients[0]["id"]
        r = requests.post(
            f"{BASE_URL}/api/doctor/patient/{target}/impersonate",
            headers={"Authorization": f"Bearer {pat_token}"},
            timeout=15,
        )
        # 403 (not doctor). 200 would be a critical security break.
        assert r.status_code in (403, 404), f"Expected 403/404, got {r.status_code}: {r.text}"
        assert r.status_code == 403

    def test_doctor_cannot_impersonate_non_owned_patient(self, ana_token):
        # Create a patient without linking to Ana → register directly (no doctor_id)
        email = f"TEST_other_{int(time.time())}@teste.com"
        reg = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "senha123", "name": "TEST Other", "role": "patient_monitored"},
            timeout=15,
        )
        assert reg.status_code == 200
        other_id = reg.json()["user"]["id"]
        r = requests.post(
            f"{BASE_URL}/api/doctor/patient/{other_id}/impersonate",
            headers={"Authorization": f"Bearer {ana_token}"},
            timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_impersonate_requires_auth(self, ana_patients):
        r = requests.post(
            f"{BASE_URL}/api/doctor/patient/{ana_patients[0]['id']}/impersonate",
            timeout=15,
        )
        assert r.status_code == 401

    def test_impersonate_unknown_patient_404(self, ana_token):
        r = requests.post(
            f"{BASE_URL}/api/doctor/patient/nonexistent-id-xxxx/impersonate",
            headers={"Authorization": f"Bearer {ana_token}"},
            timeout=15,
        )
        assert r.status_code == 404
