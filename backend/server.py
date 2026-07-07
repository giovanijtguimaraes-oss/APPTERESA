"""T.E.R.E.S.A. backend — Wound-healing device companion API.

Provides JWT auth, user profile (patient/doctor), sensor readings,
sessions, alerts, contacts, wound photos + AI analysis via Emergent LLM Key.
"""
from __future__ import annotations

import base64
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
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
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
# Models
# =========================================================================
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: Literal["patient", "doctor"] = "patient"


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
    role: Literal["patient", "doctor"]
    photo_base64: Optional[str] = None
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


class Reading(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    temperature_c: float
    humidity_pct: float
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ReadingCreate(BaseModel):
    temperature_c: float
    humidity_pct: float
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
    category: Literal["system", "device", "medical", "environmental", "update", "protocol"] = "system"
    read: bool = False
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AlertCreate(BaseModel):
    level: Literal["info", "warning", "critical", "success"]
    title: str
    description: str
    category: Literal["system", "device", "medical", "environmental", "update", "protocol"] = "system"


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


class WoundPhotoResponse(BaseModel):
    id: str
    image_base64: str
    analysis: Optional[WoundAnalysisResult] = None
    timestamp: str


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
        role=u["role"],
        photo_base64=u.get("photo_base64"),
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
    cursor = db.readings.find(
        {"user_id": current["id"], "timestamp": {"$gte": since}},
        {"_id": 0},
    ).sort("timestamp", 1).limit(2000)
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
    cursor = db.sessions.find({"user_id": current["id"]}, {"_id": 0}).sort("started_at", -1).limit(200)
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
    cursor = db.alerts.find({"user_id": current["id"]}, {"_id": 0}).sort("timestamp", -1).limit(200)
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
    cursor = db.contacts.find({"user_id": current["id"]}, {"_id": 0}).sort("name", 1).limit(500)
    return [Contact(**c) async for c in cursor]


@api.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, current=Depends(get_current_user)):
    result = await db.contacts.delete_one({"id": contact_id, "user_id": current["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    return {"ok": True}


# =========================================================================
# Wound photos + AI analysis
# =========================================================================
async def analyze_wound_with_llm(image_base64: str) -> WoundAnalysisResult:
    """Send image to Emergent LLM Key vision model and parse structured JSON."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    # Strip data URI header if present
    cleaned = re.sub(r"^data:image/[a-zA-Z]+;base64,", "", image_base64)

    from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

    system_msg = (
        "Você é um assistente médico especializado em análise de feridas e "
        "cicatrização. Analise a foto da lesão e responda EXCLUSIVAMENTE em JSON "
        "válido (sem texto extra, sem markdown, sem crases), com as chaves:\n"
        "- estimated_area_cm2 (float): área estimada em cm².\n"
        "- predominant_color (string): cor predominante da ferida.\n"
        "- inflammation_level (string): 'low' | 'medium' | 'high'.\n"
        "- granulation_quality (string): 'poor' | 'fair' | 'good' | 'excellent'.\n"
        "- evolution (string): 'worsening' | 'stable' | 'improving' | 'well_healing'.\n"
        "- estimated_days_remaining (int): dias estimados para cicatrização total.\n"
        "- healing_percentage (int 0-100): porcentagem cicatrizada.\n"
        "- notes (string): observações clínicas em português (até 2 frases)."
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

    # Parse — strip any markdown fences the model might add.
    raw = response if isinstance(response, str) else str(response)
    raw = raw.strip()
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        raise HTTPException(status_code=502, detail="LLM não retornou JSON válido")
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao parsear JSON: {e}")

    # Normalize numeric fields
    data["estimated_area_cm2"] = float(data.get("estimated_area_cm2", 0))
    data["estimated_days_remaining"] = int(data.get("estimated_days_remaining", 0))
    data["healing_percentage"] = int(data.get("healing_percentage", 0))
    return WoundAnalysisResult(**data)


@api.post("/wound-photos/analyze", response_model=WoundPhotoResponse)
async def analyze_and_save(payload: WoundPhotoCreate, current=Depends(get_current_user)):
    # Validate size (rough check: max ~5MB base64)
    if len(payload.image_base64) > 8_000_000:
        raise HTTPException(status_code=400, detail="Imagem muito grande")

    analysis = await analyze_wound_with_llm(payload.image_base64)

    photo = WoundPhoto(
        user_id=current["id"],
        image_base64=payload.image_base64,
        analysis=analysis.dict(),
    )
    await db.wound_photos.insert_one(photo.dict())

    return WoundPhotoResponse(
        id=photo.id,
        image_base64=photo.image_base64,
        analysis=analysis,
        timestamp=photo.timestamp,
    )


@api.get("/wound-photos", response_model=List[WoundPhotoResponse])
async def list_photos(current=Depends(get_current_user)):
    cursor = db.wound_photos.find({"user_id": current["id"]}, {"_id": 0}).sort("timestamp", -1).limit(100)
    out: List[WoundPhotoResponse] = []
    async for p in cursor:
        analysis = None
        if p.get("analysis"):
            try:
                analysis = WoundAnalysisResult(**p["analysis"])
            except Exception:
                analysis = None
        out.append(
            WoundPhotoResponse(
                id=p["id"],
                image_base64=p["image_base64"],
                analysis=analysis,
                timestamp=p["timestamp"],
            )
        )
    return out


@api.get("/wound-photos/latest", response_model=Optional[WoundPhotoResponse])
async def latest_photo(current=Depends(get_current_user)):
    p = await db.wound_photos.find_one(
        {"user_id": current["id"]}, {"_id": 0}, sort=[("timestamp", -1)]
    )
    if not p:
        return None
    analysis = None
    if p.get("analysis"):
        try:
            analysis = WoundAnalysisResult(**p["analysis"])
        except Exception:
            analysis = None
    return WoundPhotoResponse(
        id=p["id"],
        image_base64=p["image_base64"],
        analysis=analysis,
        timestamp=p["timestamp"],
    )


# =========================================================================
# Calendar day summary
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
        # first day of next month
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
# Doctor endpoints — list of patients
# =========================================================================
@api.get("/doctor/patients", response_model=List[UserPublic])
async def list_patients(
    q: Optional[str] = None,
    current=Depends(get_current_user),
):
    if current["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Somente médicos")
    query: dict[str, Any] = {"role": "patient"}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    cursor = db.users.find(query, {"_id": 0, "password_hash": 0}).sort("name", 1).limit(1000)
    return [user_to_public(u) async for u in cursor]


@api.get("/doctor/patient/{patient_id}", response_model=UserPublic)
async def get_patient(patient_id: str, current=Depends(get_current_user)):
    if current["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Somente médicos")
    u = await db.users.find_one({"id": patient_id, "role": "patient"}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return user_to_public(u)


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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
