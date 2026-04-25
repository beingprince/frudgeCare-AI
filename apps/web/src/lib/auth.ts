/**
 * lib/login.ts
 *
 * FrudgeCare Login Core
 * --------------------
 * Handles security token session signing/verification, role enforcement,
 * OTP generation, audit logging for login events, and rate limiting.
 *
 * Decision Origin:
 *  - security token stored in an httpOnly cookie to prevent XSS token theft.
 *  - Demo mode skip is gated behind NEXT_PUBLIC_DEMO_MODE env flag.
 *  - OTP expiry is 10 minutes per standard healthcare OTP practice.
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { UserRole } from '@/types';

export { ROLE_HOME, ROLE_LOGIN_PATH } from './role-routes';

// Constants

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET env var is required in production. Set it before starting the server.'
  );
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'frudgecare-dev-secret-change-in-production'
);
const SESSION_COOKIE = 'fc_session';
const SESSION_EXPIRY_SECONDS = 60 * 60 * 8; // 8 hours

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
// These constants are exported so route handlers can power the demo-
// account backup option path even when DEMO_MODE itself is false (e.g. when
// the project has real Supabase credentials but the patient table is
// not yet seeded). Routes should never expose these to the browser
// outside of the explicit DEMO_MODE flag.
export const DEMO_OTP = '000000';
export const DEMO_PASSWORD = 'demo1234';

// Rate limiting: 5 attempts per 5 minutes
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 5;

// Support contact shown on login failure
export const SUPPORT_EMAIL = 'itsupport@frudgecare.demo';
export const SUPPORT_PHONE = '+1 (555) 000-9999';

// Demo Staff Accounts

export const DEMO_STAFF_ACCOUNTS = {
  'ADM-001': { username: 'sysadmin', email: 'admin@frudgecare.demo', role: 'admin' as UserRole,      name: 'System Admin',      userId: 'usr_admin_001', phone_masked: '***-***-1111' },
  'FD-001':  { username: 'maria',    email: 'maria@frudgecare.demo', role: 'front_desk' as UserRole, name: 'Maria Johnson',     userId: 'usr_fd_001',    phone_masked: '***-***-2222' },
  'NU-001':  { username: 'sarah',    email: 'sarah@frudgecare.demo', role: 'nurse' as UserRole,      name: 'Sarah Chen, RN',    userId: 'usr_nu_001',    phone_masked: '***-***-5678' },
  'PR-001':  { username: 'emily',    email: 'emily@frudgecare.demo', role: 'provider' as UserRole,   name: 'Dr. Emily Carter',  userId: 'usr_pr_001',    phone_masked: '***-***-3333' },
};

// Demo Patient Accounts
//
// Mirrors DEMO_STAFF_ACCOUNTS for the patient flow. Why this exists:
// phone/email + DOB alone is NOT identity for medical data (recycled SIMs,
// shared birthdays, leaked emails — see /login/patient flow). The patient
// login is therefore three-factor: (identifier + DOB) → OTP to channel →
// password. These accounts give us a deterministic record to match those
// factors against in demo mode so the flow can be exercised end-to-end
// without a populated `patient_profiles` table.

export interface DemoPatientAccount {
  userId: string;
  patientId: string;
  name: string;
  email: string;
  phone: string;          // canonical, e.g. "+15550100001"
  dateOfBirth: string;    // YYYY-MM-DD
  /** Last 4 of phone shown in the OTP step. */
  phone_masked: string;
  /** Email username masked, e.g. "j***@frudgecare.demo". */
  email_masked: string;
}

export const DEMO_PATIENT_ACCOUNTS: DemoPatientAccount[] = [
  {
    userId:       'usr_pat_001',
    patientId:    'pat_001',
    name:         'John Miller',
    email:        'john@frudgecare.demo',
    phone:        '+15550100001',
    dateOfBirth:  '1990-01-15',
    phone_masked: '***-***-0001',
    email_masked: 'j***@frudgecare.demo',
  },
];

export function updateDemoStaffAccount(userId: string, updates: Partial<Omit<(typeof DEMO_STAFF_ACCOUNTS)[keyof typeof DEMO_STAFF_ACCOUNTS], "userId" | "role">>) {
  for (const key of Object.keys(DEMO_STAFF_ACCOUNTS)) {
    const k = key as keyof typeof DEMO_STAFF_ACCOUNTS;
    if (DEMO_STAFF_ACCOUNTS[k].userId === userId) {
      Object.assign(DEMO_STAFF_ACCOUNTS[k], updates);
      break;
    }
  }
}

// Role → home paths: re-exported from ./role-routes (also imported by Client Components)

// security token Session Management

export interface SessionPayload {
  userId: string;
  role: UserRole;
  name: string;
  email: string;
  staffCode?: string;
  iat?: number;
  exp?: number;
}

export async function createSession(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_SECONDS}s`)
    .sign(JWT_SECRET);
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// OTP Generation

export function generateOTP(): string {
  if (DEMO_MODE) return DEMO_OTP;
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function getOTPExpiry(): Date {
  return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
}

// In demo mode the OTP is logged to the server console so the demo can run
// without an SMS provider. A production deployment must wire this function to
// Twilio Verify (or an equivalent) before enabling sign in.
export async function sendOTP(phone: string, code: string): Promise<void> {
  if (DEMO_MODE) {
    console.log(`[DEMO] OTP for ${phone}: ${code}`);
    return;
  }
  throw new Error('OTP provider not configured. Set TWILIO_* env vars for production.');
}

// Password Hashing & Validation

/**
 * Cost factor for bcrypt. 12 is a sensible default in 2026 — fast enough
 * to be unnoticeable on a modern dev machine (~250ms) and slow enough to
 * make offline brute-force impractical.
 */
const BCRYPT_ROUNDS = 12;

/**
 * Hash a plaintext password for storage in `patient_profiles.password_hash`.
 * Always use this — never store anything that came off the wire.
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 *
 * Demo skip: when DEMO_MODE is on, accepts the universal demo
 * password regardless of the hash. This is intentional so the staff
 * demo accounts (which have no real hash on disk) keep working.
 */
export async function verifyPassword(
  password: string,
  hashFromDb: string,
): Promise<boolean> {
  if (DEMO_MODE && password === DEMO_PASSWORD) return true;
  if (!hashFromDb) return false;
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hashFromDb);
}

// Demo Identity Lookup (used when Supabase is not configured)

export function lookupDemoStaff(staffCode: string, username: string) {
  const account = DEMO_STAFF_ACCOUNTS[staffCode as keyof typeof DEMO_STAFF_ACCOUNTS];
  if (!account || account.username !== username.toLowerCase().trim()) return null;
  return account;
}

/**
 * Match a demo patient by (phone-or-email) AND date of birth.
 *
 * Both factors must match the same record. Matching just one (e.g. only
 * the phone) would re-introduce the recycled-SIM / shared-DOB collision
 * the multi-factor flow is designed to defeat.
 */
export function lookupDemoPatient(
  phoneOrEmail: string,
  dateOfBirth: string,
): DemoPatientAccount | null {
  const id = phoneOrEmail.trim().toLowerCase();
  const dob = dateOfBirth.trim();
  if (!id || !dob) return null;

  // Normalise phone to digits-only for comparison so users can type it
  // with or without spaces / parens / "+" sign.
  const digits = id.replace(/\D/g, '');

  return (
    DEMO_PATIENT_ACCOUNTS.find((p) => {
      if (p.dateOfBirth !== dob) return false;
      const emailMatch = p.email.toLowerCase() === id;
      const phoneMatch =
        digits.length > 0 && p.phone.replace(/\D/g, '').endsWith(digits);
      return emailMatch || phoneMatch;
    }) ?? null
  );
}

/**
 * Lookup a demo patient by their stable userId. Used by the OTP /
 * password steps where we no longer have phone+DOB on the wire — only
 * the user_id minted at verify-identity time.
 */
export function findDemoPatientByUserId(
  userId: string,
): DemoPatientAccount | null {
  return DEMO_PATIENT_ACCOUNTS.find((p) => p.userId === userId) ?? null;
}

// Login Audit Logging helper

export type AuthEventType =
  | 'staff_identity_verified'
  | 'staff_identity_failed'
  | 'otp_requested'
  | 'otp_verified'
  | 'otp_failed'
  | 'staff_login_success'
  | 'staff_login_failed'
  | 'patient_login'
  | 'role_mismatch_attempt'
  | 'session_destroyed';

export async function logAuthEvent(
  event: AuthEventType,
  userId: string | null,
  metadata: Record<string, any> = {}
): Promise<void> {
  // In production, insert into audit_log table via supabase admin client.
  // For demo mode, just log to console to avoid DB dependency.
  console.log(`[AUTH AUDIT] ${event}`, { userId, ...metadata, ts: new Date().toISOString() });
}
