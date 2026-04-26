/**
 * POST /api/login/patient/login
 *
 * Final step of the patient login flow. Mints a session ONLY if all
 * three previous factors were satisfied:
 *
 *   1. verify-identity   — phone/email + DOB matched a real record.
 *   2. send-otp / verify-otp — patient proved they hold the channel
 *                              the record is registered against.
 *   3. password          — the secret only the original registrant knows.
 *
 * Why three factors instead of two
 * ────────────────────────────────
 * Phone/email + DOB alone fails on three realistic attacks: shared
 * birthdays, recycled SIM numbers, and leaked email addresses. The OTP
 * proves real-time control of the channel; the password proves
 * continuity of identity (which OTP alone can't, since carriers reuse
 * numbers). Either factor without the other is not sufficient.
 *
 * Mirrors the staff `login` route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DEMO_MODE,
  DEMO_PASSWORD,
  createSession,
  verifyPassword,
  logAuthEvent,
  findDemoPatientByUserId,
} from '@/lib/auth';

/**
 * Best-effort lookup for the redirect target: the patient's most
 * recent case. Falls back to the bare /patient/status page if there
 * are no cases yet (e.g. a returning patient who never submitted one).
 */
async function pickPostLoginRedirect(
  admin: ReturnType<typeof getSupabaseAdmin>,
  patientProfileId: string,
): Promise<string> {
  if (!admin) return '/patient/status';
  const { data } = await admin
    .from('cases')
    .select('case_code')
    .eq('patient_profile_id', patientProfileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.case_code) {
    return `/patient/status?caseId=${encodeURIComponent(data.case_code)}`;
  }
  return '/patient/status';
}

export async function POST(req: NextRequest) {
  try {
    const {
      user_id,
      phone_or_email,
      password,
      verification_token,
    } = await req.json();

    if (!user_id || !password || !verification_token) {
      return NextResponse.json(
        {
          success: false,
          error:
            'user_id, password, and verification_token are required. Please restart the sign-in flow.',
        },
        { status: 400 },
      );
    }

    // ── DEMO MATCH (always tried first) ─────────────────────────────
    // verifyPassword() in demo mode accepts the universal demo
    // password. We skip Supabase entirely for demo accounts so the
    // canned credentials work even with real .env.local set up.
    const demoAccount = findDemoPatientByUserId(user_id);
    if (demoAccount) {
      // Direct constant comparison — does NOT depend on DEMO_MODE flag,
      // so the demo registry stays usable when real Supabase creds are
      // present but `patient_profiles` is unseeded.
      const passwordOk = password === DEMO_PASSWORD;
      if (!passwordOk) {
        await logAuthEvent('staff_login_failed', user_id, {
          actor: 'patient',
          reason: 'wrong_password',
        });
        return NextResponse.json(
          { success: false, error: 'Incorrect password.' },
          { status: 401 },
        );
      }

      const token = await createSession({
        userId: demoAccount.userId,
        role: 'patient',
        name: demoAccount.name,
        email: demoAccount.email,
      });
      await logAuthEvent('patient_login', demoAccount.userId, {
        path: 'demo_registry',
      });

      const response = NextResponse.json({
        success: true,
        name: demoAccount.name,
        redirect: '/patient/status',
      });
      response.cookies.set('fc_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 12, // 12 hours for patients
        path: '/',
      });
      return response;
    }

    // ── PRODUCTION PATH ─────────────────────────────────────────────
    const admin = getSupabaseAdmin();
    if (DEMO_MODE || !isSupabaseConfigured() || !admin) {
      return NextResponse.json(
        { success: false, error: 'Sign-in failed.' },
        { status: 401 },
      );
    }
    // 1) Re-get the candidate profile (defence-in-depth: never trust
    //    `user_id` alone — re-bind it to the same identifier the user
    //    typed in step 1). We use the admin client because RLS on
    //    patient_profiles only grants service_role read access.
    const id = (phone_or_email || '').trim();
    const looksLikeEmail = id.includes('@');

    const profileQuery = admin
      .from('patient_profiles')
      .select('id, full_name, email, password_hash')
      .limit(1);
    const { data: profile, error } = await (looksLikeEmail
      ? profileQuery.eq('email', id.toLowerCase()).maybeSingle()
      : profileQuery.eq('phone', id).maybeSingle());

    if (error || !profile) {
      return NextResponse.json(
        { success: false, error: 'Sign-in failed.' },
        { status: 401 },
      );
    }
    if (profile.id !== user_id) {
      // Identifier doesn't bind back to the user_id from verify-identity.
      // Generic error — never disclose which factor failed.
      return NextResponse.json(
        { success: false, error: 'Sign-in failed.' },
        { status: 401 },
      );
    }

    // 2) Validate the verification_token came from a real OTP session.
    const { data: otpSession } = await admin
      .from('otp_sessions')
      .select('verified, verification_token')
      .eq('user_id', user_id)
      .eq('verification_token', verification_token)
      .eq('verified', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpSession) {
      await logAuthEvent('staff_login_failed', user_id, {
        actor: 'patient',
        reason: 'bad_verification_token',
      });
      return NextResponse.json(
        {
          success: false,
          error:
            'Verification step expired. Please restart the sign-in flow.',
        },
        { status: 401 },
      );
    }

    // 3) Password check (bcrypt).
    const passwordOk = await verifyPassword(
      password,
      (profile.password_hash as string) ?? '',
    );
    if (!passwordOk) {
      await logAuthEvent('staff_login_failed', user_id, {
        actor: 'patient',
        reason: 'wrong_password',
      });
      return NextResponse.json(
        { success: false, error: 'Incorrect password.' },
        { status: 401 },
      );
    }

    const token = await createSession({
      userId: profile.id,
      role: 'patient',
      name: profile.full_name,
      email: profile.email ?? '',
    });
    await logAuthEvent('patient_login', profile.id, {});

    const redirect = await pickPostLoginRedirect(admin, profile.id);
    const response = NextResponse.json({
      success: true,
      name: profile.full_name,
      redirect,
    });
    response.cookies.set('fc_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 12,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('[patient-login]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
