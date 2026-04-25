/**
 * POST /api/patient/register
 *
 * Called from the intake form on final submit, *before* /api/cases/create.
 * Creates a `patient_profiles` row (with bcrypt-hashed password), mints
 * an fc_session cookie so the user is immediately authenticated, and
 * returns the new profile id so the case can be linked back to it via
 * `patient_profile_id`.
 *
 * Idempotency
 * -----------
 * If a profile already exists matching (email OR phone) AND date_of_birth,
 * we return 409 with a hint to log in instead. We do NOT silently accept
 * duplicate registrations — that would let a stranger overwrite the
 * password of someone whose phone they have.
 *
 * Demo backup option
 * -------------
 * When Supabase isn't configured (or service-role key is missing), this
 * route stores a minimal profile in the existing temporary mock store
 * so the demo flow keeps working without any DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  createSession,
  hashPassword,
  logAuthEvent,
} from '@/lib/auth';

const MIN_PASSWORD_LENGTH = 8;

interface RegisterPayload {
  full_name?: string;
  date_of_birth?: string;
  gender?: string;
  phone?: string;
  phone_country?: string;
  email?: string;
  password?: string;
}

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: RegisterPayload;
  try {
    body = (await req.json()) as RegisterPayload;
  } catch {
    return badRequest('Invalid JSON body.');
  }

  const fullName = (body.full_name ?? '').trim();
  const dob = (body.date_of_birth ?? '').trim();
  const phone = (body.phone ?? '').trim() || null;
  const phoneCountry = (body.phone_country ?? '').trim() || null;
  const email = (body.email ?? '').trim().toLowerCase() || null;
  const gender = (body.gender ?? '').trim() || null;
  const password = body.password ?? '';

  if (!fullName) return badRequest('Full name is required.');
  if (!dob) return badRequest('Date of birth is required.');
  if (!phone && !email) {
    return badRequest('A phone number or email is required.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return badRequest(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const password_hash = await hashPassword(password);

  const admin = getSupabaseAdmin();

  // ── PRODUCTION PATH ─────────────────────────────────────────────
  if (admin) {
    // Reject duplicate registrations: same DOB + same phone OR email.
    // We check phone and email separately so a single OR-string can't
    // be SQL-injected past Supabase's parser.
    const dupHits: Array<{ id: string } | null> = [];
    if (phone) {
      const { data } = await admin
        .from('patient_profiles')
        .select('id')
        .eq('phone', phone)
        .eq('date_of_birth', dob)
        .limit(1)
        .maybeSingle();
      dupHits.push((data as { id: string } | null) ?? null);
    }
    if (email) {
      const { data } = await admin
        .from('patient_profiles')
        .select('id')
        .eq('email', email)
        .eq('date_of_birth', dob)
        .limit(1)
        .maybeSingle();
      dupHits.push((data as { id: string } | null) ?? null);
    }
    if (dupHits.some(Boolean)) {
      return NextResponse.json(
        {
          success: false,
          error: 'An account with that contact and date of birth already exists.',
          message:
            'You may already have an account. Please sign in instead, or use a different contact.',
          redirect: '/auth/patient',
        },
        { status: 409 },
      );
    }

    const { data, error } = await admin
      .from('patient_profiles')
      .insert({
        full_name: fullName,
        date_of_birth: dob,
        gender,
        phone,
        phone_country: phoneCountry,
        email,
        password_hash,
      })
      .select('id, full_name, email')
      .single();

    if (error || !data) {
      console.error('[patient/register] insert failed', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Could not create your account. Please try again.',
          detail: error?.message,
        },
        { status: 500 },
      );
    }

    const token = await createSession({
      userId: data.id,
      role: 'patient',
      name: data.full_name,
      email: data.email ?? '',
    });

    await logAuthEvent('patient_login', data.id, {
      path: 'register',
    });

    const response = NextResponse.json({
      success: true,
      patient_profile_id: data.id,
      user_id: data.id,
      name: data.full_name,
    });
    response.cookies.set('fc_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 12, // 12 hours
      path: '/',
    });
    return response;
  }

  // ── MOCK / DEMO FALLBACK ─────────────────────────────────────────
  // No Supabase admin configured. We still mint a session so the user
  // can navigate, but we don't try to save a profile to a missing
  // table. The case row will reference this id only in-process.
  const fakeId = crypto.randomUUID();
  const token = await createSession({
    userId: fakeId,
    role: 'patient',
    name: fullName,
    email: email ?? '',
  });
  await logAuthEvent('patient_login', fakeId, { path: 'register_mock' });
  const response = NextResponse.json({
    success: true,
    patient_profile_id: fakeId,
    user_id: fakeId,
    name: fullName,
  });
  response.cookies.set('fc_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 12,
    path: '/',
  });
  return response;
}
