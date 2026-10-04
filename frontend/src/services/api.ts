/**
 * Lightweight HTTP client that attaches the JWT stored in secure storage.
 * All backend routes are prefixed with /api.
 */

import { storage } from '@/src/utils/storage';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

export type ApiError = { status: number; detail: string };

const TOKEN_KEY = 'teresa.jwt';

export async function saveToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | null> {
  return storage.secureGet<string>(TOKEN_KEY, '');
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (auth) {
    const token = await loadToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    const err: ApiError = { status: res.status, detail: String(detail) };
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T>(p: string, auth = true) => request<T>('GET', p, undefined, auth),
  post: <T>(p: string, body?: unknown, auth = true) =>
    request<T>('POST', p, body, auth),
  patch: <T>(p: string, body?: unknown, auth = true) =>
    request<T>('PATCH', p, body, auth),
  del: <T>(p: string, auth = true) => request<T>('DELETE', p, undefined, auth),
};

// ============ Types ============
export type Role = 'doctor' | 'patient_monitored' | 'patient_autonomous';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  photo_base64?: string | null;
  doctor_id?: string | null;
  age?: number | null;
  sex?: string | null;
  lesion_type?: string | null;
  lesion_location?: string | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  diabetes?: boolean | null;
  hypertension?: boolean | null;
  allergies?: string | null;
  medications?: string | null;
  treatment_start?: string | null;
  crm?: string | null;
  specialty?: string | null;
  hospital?: string | null;
  phone?: string | null;
  created_at: string;
}

export interface Reading {
  id: string;
  user_id: string;
  temperature_c: number;
  humidity_pct: number;
  state_system?: string | null;
  timestamp: string;
}

export interface SessionRecord {
  id: string;
  started_at: string;
  ended_at?: string | null;
  duration_min?: number | null;
  led_intensity?: number | null;
  ir_intensity?: number | null;
  status: 'completed' | 'interrupted' | 'in_progress';
  notes?: string | null;
}

export interface AlertItem {
  id: string;
  level: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  description: string;
  category: 'system' | 'device' | 'medical' | 'environmental' | 'update' | 'protocol';
  read: boolean;
  sender_id?: string | null;
  sender_name?: string | null;
  timestamp: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  phone: string;
  photo_base64?: string | null;
}

export interface WoundAnalysis {
  estimated_area_cm2: number;
  predominant_color: string;
  inflammation_level: 'low' | 'medium' | 'high';
  granulation_quality: 'poor' | 'fair' | 'good' | 'excellent';
  evolution: 'worsening' | 'stable' | 'improving' | 'well_healing';
  estimated_days_remaining: number;
  healing_percentage: number;
  notes: string;
}

export interface WoundFeedback {
  id: string;
  photo_id: string;
  patient_id: string;
  doctor_id: string;
  doctor_name: string;
  rating: number;
  comment?: string | null;
  created_at: string;
}

export interface WoundPhoto {
  id: string;
  image_base64: string;
  analysis?: WoundAnalysis | null;
  timestamp: string;
  feedback?: WoundFeedback | null;
}

export interface DaySummary {
  date: string;
  avg_temperature_c: number | null;
  avg_humidity_pct: number | null;
  session_count: number;
  session_duration_min: number;
  photo_count: number;
  readings: Reading[];
  sessions: SessionRecord[];
  photos: { id: string; image_base64: string; timestamp: string }[];
}

export type MonthDayStatus = {
  session: boolean;
  alert: boolean;
  warning: boolean;
  good: boolean;
};

export interface PatientFullData {
  patient: User;
  latest_reading: Reading | null;
  photos: WoundPhoto[];
  sessions: SessionRecord[];
  alerts: AlertItem[];
  stats: {
    photo_count: number;
    session_count: number;
    latest_healing: number | null;
  };
}
