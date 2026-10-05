"""T.E.R.E.S.A. backend — Wound-healing device companion API.

Supports three user roles:
  - doctor
  - patient_monitored (uses the TERESA01 ESP32)
  - patient_autonomous (wound-photo analysis only, no equipment)

Historic rows created before role expansion use `role = "patient"` and are
treated as `patient_monitored` on load (one-time migration at startup).
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, List, Literal, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --- Environment ---------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ["JWT_ALGORITHM"]
JWT_EXPIRES_HOURS = int(os.environ["JWT_EXPIRES_HOURS"])
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

# --- DB ------------------------------------------------------------------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# --- App -----------------------------------------------------------------
app = FastAPI(title="T.E.R.E.S.A. API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# =========================================================================
# Role & State enums (match ESP32 firmware exactly)
# =========================================================================
Role = Literal["doctor", "patient_monitored", "patient_autonomous"]

# ESP32 firmware state machine values — these strings must match 1:1.
TreatmentState = Literal[
    "AGUARDANDO_BRACELETE",
    "AGUARDANDO_INICIO",
    "AQUECENDO",
    "EM_TRATAMENTO",
    "TRATAMENTO_INTERROMPIDO",
    "TRATAMENTO_FINALIZADO",
]


def _normalize_role(stored: str) -> Role:
    """Legacy rows used `patient`; treat them as `patient_monitored`."""
    if stored == "patient":
        return "patient_monitored"
    return stored  # type: ignore[return-value]


# =========================================================================
# Models
# =========================================================================
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: Role = "patient_monitored"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    token: str
    user: "UserPublic"


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role
    photo_base64: Optional[str] = None
    doctor_id: Optional[str] = None
    # Patient-specific
    age: Optional[int] = None
    sex: Optional[str] = None
    lesion_type: Optional[str] = None
    lesion_location: Optional[str] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    diabetes: Optional[bool] = None
    hypertension: Optional[bool] = None
    allergies: Optional[str] = None
    medications: Optional[str] = None
    treatment_start: Optional[str] = None
    # Doctor-specific
    crm: Optional[str] = None
    specialty: Optional[str] = None
    hospital: Optional[str] = None
    phone: Optional[str] = None
    created_at: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    photo_base64: Optional[str] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    lesion_type: Optional[str] = None
    lesion_location: Optional[str] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    diabetes: Optional[bool] = None
    hypertension: Optional[bool] = None
    allergies: Optional[str] = None
    medications: Optional[str] = None
    treatment_start: Optional[str] = None
    crm: Optional[str] = None
    specialty: Optional[str] = None
    hospital: Optional[str] = None
    phone: Optional[str] = None


class CreatePatientInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Literal["patient_monitored", "patient_autonomous"] = "patient_monitored"
    age: Optional[int] = None
    sex: Optional[str] = None
    lesion_type: Optional[str] = None
    lesion_location: Optional[str] = None


class Reading(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    temperature_c: float
    humidity_pct: float
    state_system: Optional[str] = None  # ESP32 STATE= value
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ReadingCreate(BaseModel):
    temperature_c: float
    humidity_pct: float
    state_system: Optional[str] = None
    timestamp: Optional[str] = None


class SessionRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    started_at: str
    ended_at: Optional[str] = None
    duration_min: Optional[int] = None
    led_intensity: Optional[int] = None
    ir_intensity: Optional[int] = None
    status: Literal["completed", "interrupted", "in_progress"] = "completed"
    notes: Optional[str] = None


class SessionCreate(BaseModel):
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_min: Optional[int] = None
    led_intensity: Optional[int] = None
    ir_intensity: Optional[int] = None
    status: Literal["completed", "interrupted", "in_progress"] = "completed"
    notes: Optional[str] = None


class Alert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    level: Literal["info", "warning", "critical", "success"]
    title: str
    description: str
    category: Literal[
        "system", "device", "medical", "environmental", "update", "protocol"
    ] = "system"
    read: bool = False
    sender_id: Optional[str] = None  # doctor id when sent by doctor
    sender_name: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AlertCreate(BaseModel):
    level: Literal["info", "warning", "critical", "success"]
    title: str
    description: str
    category: Literal[
        "system", "device", "medical", "environmental", "update", "protocol"
    ] = "system"


class DoctorAlertInput(BaseModel):
    level: Literal["info", "warning", "critical", "success"] = "medical"  # type: ignore[assignment]
    title: str
    description: str


class Contact(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    role: str
    phone: str
    photo_base64: Optional[str] = None


class ContactCreate(BaseModel):
    name: str
    role: str
    phone: str
    photo_base64: Optional[str] = None


class WoundPhoto(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    image_base64: str
    analysis: Optional[dict] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WoundPhotoCreate(BaseModel):
    image_base64: str


class WoundAnalysisResult(BaseModel):
    estimated_area_cm2: float
    predominant_color: str
    inflammation_level: Literal["low", "medium", "high"]
    granulation_quality: Literal["poor", "fair", "good", "excellent"]
    evolution: Literal["worsening", "stable", "improving", "well_healing"]
    estimated_days_remaining: int
    healing_percentage: int
    notes: str


class WoundFeedback(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    photo_id: str
    patient_id: str
    doctor_id: str
    doctor_name: str
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WoundFeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None


class WoundPhotoResponse(BaseModel):
    id: str
    image_base64: str
    analysis: Optional[WoundAnalysisResult] = None
    timestamp: str
    feedback: Optional[WoundFeedback] = None


# =========================================================================
# Helpers
# =========================================================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRES_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def user_to_public(u: dict) -> UserPublic:
    return UserPublic(
        id=u["id"],
        email=u["email"],
        name=u["name"],
        role=_normalize_role(u["role"]),
        photo_base64=u.get("photo_base64"),
        doctor_id=u.get("doctor_id"),
        age=u.get("age"),
        sex=u.get("sex"),
        lesion_type=u.get("lesion_type"),
        lesion_location=u.get("lesion_location"),
        weight_kg=u.get("weight_kg"),
        height_cm=u.get("height_cm"),
        diabetes=u.get("diabetes"),
        hypertension=u.get("hypertension"),
        allergies=u.get("allergies"),
        medications=u.get("medications"),
        treatment_start=u.get("treatment_start"),
        crm=u.get("crm"),
        specialty=u.get("specialty"),
        hospital=u.get("hospital"),
        phone=u.get("phone"),
        created_at=u["created_at"],
    )


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_doctor(user: dict) -> None:
    if _normalize_role(user["role"]) != "doctor":
        raise HTTPException(status_code=403, detail="Somente médicos")


async def assert_doctor_owns_patient(doctor: dict, patient_id: str) -> dict:
    """Return patient dict if the doctor is linked. 403 otherwise."""
    require_doctor(doctor)
    patient = await db.users.find_one(
        {"id": patient_id, "role": {"$in": ["patient", "patient_monitored", "patient_autonomous"]}},
        {"_id": 0},
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    if patient.get("doctor_id") != doctor["id"]:
        raise HTTPException(status_code=403, detail="Paciente não vinculado a este médico")
    return patient


# =========================================================================
# Auth
# =========================================================================
@api.get("/")
async def root():
    return {"service": "T.E.R.E.S.A. API", "status": "online"}


@api.post("/auth/register", response_model=TokenResponse)
async def register(payload: RegisterInput):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    user = {
        "id": str(uuid.uuid4()),
        "email": payload.email.lower(),
        "name": payload.name,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = create_token(user["id"])
    user.pop("_id", None)
    return TokenResponse(token=token, user=user_to_public(user))


@api.post("/auth/login", response_model=TokenResponse)
async def login(payload: LoginInput):
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    token = create_token(user["id"])
    return TokenResponse(token=token, user=user_to_public(user))


@api.get("/auth/me", response_model=UserPublic)
async def me(current=Depends(get_current_user)):
    return user_to_public(current)


@api.patch("/auth/me", response_model=UserPublic)
async def update_me(payload: UserUpdate, current=Depends(get_current_user)):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if updates:
        await db.users.update_one({"id": current["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": current["id"]}, {"_id": 0})
    return user_to_public(updated)


# =========================================================================
# Sensor Readings
# =========================================================================
@api.post("/readings", response_model=Reading)
async def add_reading(payload: ReadingCreate, current=Depends(get_current_user)):
    r = Reading(
        user_id=current["id"],
        temperature_c=payload.temperature_c,
        humidity_pct=payload.humidity_pct,
        state_system=payload.state_system,
        timestamp=payload.timestamp or datetime.now(timezone.utc).isoformat(),
    )
    await db.readings.insert_one(r.dict())
    return r


@api.get("/readings", response_model=List[Reading])
async def get_readings(
    range: Literal["24h", "7d", "30d"] = "24h",
    current=Depends(get_current_user),
):
    hours = {"24h": 24, "7d": 24 * 7, "30d": 24 * 30}[range]
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    cursor = (
        db.readings.find(
            {"user_id": current["id"], "timestamp": {"$gte": since}},
            {"_id": 0},
        )
        .sort("timestamp", 1)
        .limit(2000)
    )
    return [Reading(**r) async for r in cursor]


@api.get("/readings/latest", response_model=Optional[Reading])
async def latest_reading(current=Depends(get_current_user)):
    r = await db.readings.find_one(
        {"user_id": current["id"]}, {"_id": 0}, sort=[("timestamp", -1)]
    )
    return Reading(**r) if r else None


# =========================================================================
# Sessions
# =========================================================================
@api.post("/sessions", response_model=SessionRecord)
async def create_session(payload: SessionCreate, current=Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    s = SessionRecord(
        user_id=current["id"],
        started_at=payload.started_at or now,
        ended_at=payload.ended_at,
        duration_min=payload.duration_min,
        led_intensity=payload.led_intensity,
        ir_intensity=payload.ir_intensity,
        status=payload.status,
        notes=payload.notes,
    )
    await db.sessions.insert_one(s.dict())
    return s


@api.get("/sessions", response_model=List[SessionRecord])
async def list_sessions(current=Depends(get_current_user)):
    cursor = (
        db.sessions.find({"user_id": current["id"]}, {"_id": 0})
        .sort("started_at", -1)
        .limit(200)
    )
    return [SessionRecord(**s) async for s in cursor]


# =========================================================================
# Alerts / Notices
# =========================================================================
@api.post("/alerts", response_model=Alert)
async def create_alert(payload: AlertCreate, current=Depends(get_current_user)):
    a = Alert(
        user_id=current["id"],
        level=payload.level,
        title=payload.title,
        description=payload.description,
        category=payload.category,
    )
    await db.alerts.insert_one(a.dict())
    return a


@api.get("/alerts", response_model=List[Alert])
async def list_alerts(current=Depends(get_current_user)):
    cursor = (
        db.alerts.find({"user_id": current["id"]}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(200)
    )
    return [Alert(**a) async for a in cursor]


@api.get("/alerts/unread-count")
async def unread_count(current=Depends(get_current_user)):
    n = await db.alerts.count_documents({"user_id": current["id"], "read": False})
    return {"count": n}


@api.post("/alerts/{alert_id}/read")
async def mark_read(alert_id: str, current=Depends(get_current_user)):
    result = await db.alerts.update_one(
        {"id": alert_id, "user_id": current["id"]}, {"$set": {"read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    return {"ok": True}


@api.post("/alerts/read-all")
async def mark_all_read(current=Depends(get_current_user)):
    await db.alerts.update_many({"user_id": current["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# =========================================================================
# Contacts
# =========================================================================
@api.post("/contacts", response_model=Contact)
async def add_contact(payload: ContactCreate, current=Depends(get_current_user)):
    c = Contact(user_id=current["id"], **payload.dict())
    await db.contacts.insert_one(c.dict())
    return c


@api.get("/contacts", response_model=List[Contact])
async def list_contacts(current=Depends(get_current_user)):
    cursor = (
        db.contacts.find({"user_id": current["id"]}, {"_id": 0})
        .sort("name", 1)
        .limit(500)
    )
    return [Contact(**c) async for c in cursor]


@api.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, current=Depends(get_current_user)):
    result = await db.contacts.delete_one({"id": contact_id, "user_id": current["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    return {"ok": True}


# =========================================================================
# Wound photos + AI analysis + feedback
# =========================================================================
async def analyze_wound_with_llm(image_base64: str) -> WoundAnalysisResult:
    """Send image to Emergent LLM Key vision model and parse structured JSON."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    cleaned = re.sub(r"^data:image/[a-zA-Z]+;base64,", "", image_base64)

    from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

    system_msg = (
        "Você é um assistente clínico de apoio especializado em análise de "
        "feridas e cicatrização. NÃO forneça diagnóstico — apenas uma análise "
        "visual descritiva. Responda EXCLUSIVAMENTE em JSON válido (sem texto "
        "extra, sem markdown, sem crases), com as chaves:\n"
        "- estimated_area_cm2 (float): área estimada em cm².\n"
        "- predominant_color (string): cor predominante da ferida.\n"
        "- inflammation_level (string): 'low' | 'medium' | 'high'.\n"
        "- granulation_quality (string): 'poor' | 'fair' | 'good' | 'excellent'.\n"
        "- evolution (string): 'worsening' | 'stable' | 'improving' | 'well_healing'.\n"
        "- estimated_days_remaining (int): dias estimados para cicatrização total.\n"
        "- healing_percentage (int 0-100): porcentagem cicatrizada.\n"
        "- notes (string): observações descritivas em português (até 2 frases)."
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"wound-{uuid.uuid4()}",
        system_message=system_msg,
    ).with_model("openai", "gpt-5.2")

    image_content = ImageContent(image_base64=cleaned)
    user_msg = UserMessage(
        text="Analise esta imagem de ferida e retorne o JSON conforme instruído.",
        file_contents=[image_content],
    )

    response = await chat.send_message(user_msg)
    raw = response if isinstance(response, str) else str(response)
    raw = raw.strip()
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        raise HTTPException(status_code=502, detail="LLM não retornou JSON válido")
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao parsear JSON: {e}")

    data["estimated_area_cm2"] = float(data.get("estimated_area_cm2", 0))
    data["estimated_days_remaining"] = int(data.get("estimated_days_remaining", 0))
    data["healing_percentage"] = int(data.get("healing_percentage", 0))
    return WoundAnalysisResult(**data)


async def _photo_response(p: dict) -> WoundPhotoResponse:
    analysis = None
    if p.get("analysis"):
        try:
            analysis = WoundAnalysisResult(**p["analysis"])
        except Exception:
            analysis = None
    fb = await db.wound_feedback.find_one({"photo_id": p["id"]}, {"_id": 0})
    return WoundPhotoResponse(
        id=p["id"],
        image_base64=p["image_base64"],
        analysis=analysis,
        timestamp=p["timestamp"],
        feedback=WoundFeedback(**fb) if fb else None,
    )


@api.post("/wound-photos/analyze", response_model=WoundPhotoResponse)
async def analyze_and_save(payload: WoundPhotoCreate, current=Depends(get_current_user)):
    if len(payload.image_base64) > 8_000_000:
        raise HTTPException(status_code=400, detail="Imagem muito grande")

    analysis = await analyze_wound_with_llm(payload.image_base64)

    photo = WoundPhoto(
        user_id=current["id"],
        image_base64=payload.image_base64,
        analysis=analysis.dict(),
    )
    await db.wound_photos.insert_one(photo.dict())
    return await _photo_response(photo.dict())


@api.get("/wound-photos", response_model=List[WoundPhotoResponse])
async def list_photos(current=Depends(get_current_user)):
    cursor = (
        db.wound_photos.find({"user_id": current["id"]}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(100)
    )
    out: List[WoundPhotoResponse] = []
    async for p in cursor:
        out.append(await _photo_response(p))
    return out


@api.get("/wound-photos/latest", response_model=Optional[WoundPhotoResponse])
async def latest_photo(current=Depends(get_current_user)):
    p = await db.wound_photos.find_one(
        {"user_id": current["id"]}, {"_id": 0}, sort=[("timestamp", -1)]
    )
    return await _photo_response(p) if p else None


@api.get("/wound-photos/{photo_id}", response_model=WoundPhotoResponse)
async def get_photo(photo_id: str, current=Depends(get_current_user)):
    p = await db.wound_photos.find_one({"id": photo_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Foto não encontrada")
    # Access control: patient (owner) OR doctor linked to that patient.
    if p["user_id"] != current["id"]:
        if _normalize_role(current["role"]) != "doctor":
            raise HTTPException(status_code=403, detail="Sem acesso")
        patient = await db.users.find_one({"id": p["user_id"]}, {"_id": 0})
        if not patient or patient.get("doctor_id") != current["id"]:
            raise HTTPException(status_code=403, detail="Sem acesso")
    return await _photo_response(p)


@api.post("/wound-photos/{photo_id}/feedback", response_model=WoundFeedback)
async def save_feedback(
    photo_id: str, payload: WoundFeedbackCreate, current=Depends(get_current_user)
):
    require_doctor(current)
    photo = await db.wound_photos.find_one({"id": photo_id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Foto não encontrada")
    patient = await db.users.find_one({"id": photo["user_id"]}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    if patient.get("doctor_id") != current["id"]:
        raise HTTPException(status_code=403, detail="Paciente não vinculado a este médico")

    fb = WoundFeedback(
        photo_id=photo_id,
        patient_id=patient["id"],
        doctor_id=current["id"],
        doctor_name=current["name"],
        rating=payload.rating,
        comment=payload.comment,
    )
    # Upsert: one feedback per (photo, doctor)
    await db.wound_feedback.update_one(
        {"photo_id": photo_id, "doctor_id": current["id"]},
        {"$set": fb.dict()},
        upsert=True,
    )
    # Create a patient-facing alert about the feedback
    try:
        await db.alerts.insert_one(
            Alert(
                user_id=patient["id"],
                level="info",
                title="Novo feedback do seu médico",
                description=f"{current['name']} avaliou uma análise ({payload.rating}★).",
                category="medical",
                sender_id=current["id"],
                sender_name=current["name"],
            ).dict()
        )
    except Exception:
        logger.exception("Failed to insert feedback alert")
    return fb


# =========================================================================
# Calendar
# =========================================================================
@api.get("/calendar/day/{date}")
async def day_summary(date: str, current=Depends(get_current_user)):
    """date format: YYYY-MM-DD"""
    try:
        d = datetime.fromisoformat(date).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Data inválida (use YYYY-MM-DD)")

    start = datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    end = datetime.combine(d, datetime.max.time(), tzinfo=timezone.utc).isoformat()

    readings = [
        r
        async for r in db.readings.find(
            {"user_id": current["id"], "timestamp": {"$gte": start, "$lte": end}},
            {"_id": 0},
        ).sort("timestamp", 1)
    ]
    sessions = [
        s
        async for s in db.sessions.find(
            {"user_id": current["id"], "started_at": {"$gte": start, "$lte": end}},
            {"_id": 0},
        )
    ]
    photos = [
        p
        async for p in db.wound_photos.find(
            {"user_id": current["id"], "timestamp": {"$gte": start, "$lte": end}},
            {"_id": 0},
        )
    ]

    temps = [r["temperature_c"] for r in readings]
    hums = [r["humidity_pct"] for r in readings]

    return {
        "date": date,
        "avg_temperature_c": round(sum(temps) / len(temps), 1) if temps else None,
        "avg_humidity_pct": round(sum(hums) / len(hums), 1) if hums else None,
        "session_count": len(sessions),
        "session_duration_min": sum(s.get("duration_min") or 0 for s in sessions),
        "photo_count": len(photos),
        "readings": readings,
        "sessions": sessions,
        "photos": [
            {"id": p["id"], "image_base64": p["image_base64"], "timestamp": p["timestamp"]}
            for p in photos
        ],
    }


@api.get("/calendar/month/{year}/{month}")
async def month_summary(year: int, month: int, current=Depends(get_current_user)):
    """Return per-day status markers for a month."""
    try:
        start = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
        if month == 12:
            next_start = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            next_start = datetime(year, month + 1, 1, tzinfo=timezone.utc)
        end = next_start.isoformat()
    except Exception:
        raise HTTPException(status_code=400, detail="Ano/mês inválido")

    days: dict[str, dict] = {}

    async for s in db.sessions.find(
        {"user_id": current["id"], "started_at": {"$gte": start, "$lt": end}}, {"_id": 0}
    ):
        d = s["started_at"][:10]
        entry = days.setdefault(d, {"session": False, "alert": False, "warning": False, "good": False})
        entry["session"] = True
        if s.get("status") == "interrupted":
            entry["alert"] = True

    async for a in db.alerts.find(
        {"user_id": current["id"], "timestamp": {"$gte": start, "$lt": end}}, {"_id": 0}
    ):
        d = a["timestamp"][:10]
        entry = days.setdefault(d, {"session": False, "alert": False, "warning": False, "good": False})
        if a["level"] == "critical":
            entry["alert"] = True
        elif a["level"] == "warning":
            entry["warning"] = True
        elif a["level"] == "success":
            entry["good"] = True

    async for p in db.wound_photos.find(
        {"user_id": current["id"], "timestamp": {"$gte": start, "$lt": end}}, {"_id": 0}
    ):
        d = p["timestamp"][:10]
        entry = days.setdefault(d, {"session": False, "alert": False, "warning": False, "good": False})
        pct = (p.get("analysis") or {}).get("healing_percentage", 0)
        if pct >= 70:
            entry["good"] = True

    return {"days": days}


# =========================================================================
# Doctor endpoints
# =========================================================================
@api.get("/doctor/patients", response_model=List[UserPublic])
async def list_patients(
    q: Optional[str] = None,
    linked_only: bool = True,
    current=Depends(get_current_user),
):
    """List patients. By default only patients linked to the current doctor."""
    require_doctor(current)
    query: dict[str, Any] = {
        "role": {"$in": ["patient", "patient_monitored", "patient_autonomous"]}
    }
    if linked_only:
        query["doctor_id"] = current["id"]
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    cursor = (
        db.users.find(query, {"_id": 0, "password_hash": 0})
        .sort("name", 1)
        .limit(1000)
    )
    return [user_to_public(u) async for u in cursor]


@api.post("/doctor/patients", response_model=UserPublic, status_code=201)
async def create_patient(payload: CreatePatientInput, current=Depends(get_current_user)):
    """Doctor creates a new patient and links them to themselves."""
    require_doctor(current)
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    user = {
        "id": str(uuid.uuid4()),
        "email": payload.email.lower(),
        "name": payload.name,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "doctor_id": current["id"],
        "age": payload.age,
        "sex": payload.sex,
        "lesion_type": payload.lesion_type,
        "lesion_location": payload.lesion_location,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    user.pop("_id", None)
    return user_to_public(user)


@api.post("/doctor/patients/{patient_id}/link", response_model=UserPublic)
async def link_patient(patient_id: str, current=Depends(get_current_user)):
    """Link an existing patient to the current doctor (one-doctor model)."""
    require_doctor(current)
    patient = await db.users.find_one(
        {"id": patient_id, "role": {"$in": ["patient", "patient_monitored", "patient_autonomous"]}},
        {"_id": 0},
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    await db.users.update_one({"id": patient_id}, {"$set": {"doctor_id": current["id"]}})
    patient["doctor_id"] = current["id"]
    return user_to_public(patient)


@api.get("/doctor/patient/{patient_id}", response_model=UserPublic)
async def get_patient(patient_id: str, current=Depends(get_current_user)):
    patient = await assert_doctor_owns_patient(current, patient_id)
    return user_to_public(patient)


@api.get("/doctor/patient/{patient_id}/data")
async def patient_full_data(patient_id: str, current=Depends(get_current_user)):
    patient = await assert_doctor_owns_patient(current, patient_id)
    latest_r = await db.readings.find_one(
        {"user_id": patient_id}, {"_id": 0}, sort=[("timestamp", -1)]
    )
    photos_cur = (
        db.wound_photos.find({"user_id": patient_id}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(50)
    )
    photos = []
    async for p in photos_cur:
        photos.append(await _photo_response(p))
    sessions_cur = (
        db.sessions.find({"user_id": patient_id}, {"_id": 0})
        .sort("started_at", -1)
        .limit(50)
    )
    sessions = [SessionRecord(**s) async for s in sessions_cur]
    alerts_cur = (
        db.alerts.find({"user_id": patient_id}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(50)
    )
    alerts = [Alert(**a) async for a in alerts_cur]
    return {
        "patient": user_to_public(patient).dict(),
        "latest_reading": Reading(**latest_r).dict() if latest_r else None,
        "photos": [p.dict() for p in photos],
        "sessions": [s.dict() for s in sessions],
        "alerts": [a.dict() for a in alerts],
        "stats": {
            "photo_count": len(photos),
            "session_count": len(sessions),
            "latest_healing": (photos[0].analysis.healing_percentage if (photos and photos[0].analysis) else None),
        },
    }


@api.post("/doctor/patient/{patient_id}/alert", response_model=Alert)
async def send_doctor_alert(
    patient_id: str,
    payload: DoctorAlertInput,
    current=Depends(get_current_user),
):
    """Doctor sends a notice/message to one of their patients."""
    patient = await assert_doctor_owns_patient(current, patient_id)
    a = Alert(
        user_id=patient["id"],
        level=payload.level if payload.level in ("info", "warning", "critical", "success") else "info",
        title=payload.title,
        description=payload.description,
        category="medical",
        sender_id=current["id"],
        sender_name=current["name"],
    )
    await db.alerts.insert_one(a.dict())
    return a


# =========================================================================
# Mount
# =========================================================================
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("teresa")


@app.on_event("startup")
async def startup_migrations():
    # One-shot: upgrade legacy `patient` rows to `patient_monitored`.
    try:
        result = await db.users.update_many(
            {"role": "patient"}, {"$set": {"role": "patient_monitored"}}
        )
        if result.modified_count:
            logger.info("Migrated %s legacy patient rows", result.modified_count)
    except Exception:
        logger.exception("Role migration failed")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
