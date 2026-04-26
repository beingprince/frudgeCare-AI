/**
 * POST /api/login/patient/verify-identity
 *
 * Step 1 of the patient login flow.
 *
 * Why this step exists at all
 * ───────────────────────────
 * Phone/email + DOB are too weak on their own to authenticate medical
 * data (recycled SIMs, shared birthdays, leaked emails all defeat them).
 * This endpoint deliberately does NOT mint a session — it only locates
 * the candidate patient record and returns the masked contact channel
 * the next step (OTP) will dispatch to. The actual session is gated
 * behind:
 *
 *   verify-identity → send-otp → verify-otp → login (with password)
 *
 * Mirrors the staff `verify-identity` route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DEMO_MODE,
  lookupDemoPatient,
  logAuthEvent,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { phone_or_email, date_of_birth } = await req.json();

    if (!phone_or_email || !date_of_birth) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide your contact info and date of birth.',
        },
        { status: 400 },
      );
    }

    // ── DEMO MATCH (always tried first) ─────────────────────────────
    // We check the temporary demo registry BEFORE hitting Supabase.
    // Why: with real Supabase URLs in .env.local but `patient_profiles`
    // not yet seeded, the prod path would 401 every time and demo
    // accounts would be unreachable. Putting demo first keeps the
    // canned credentials usable regardless of how Supabase is wired,
    // while real DB-backed users still resolve via the prod path
    // below since their identifiers won't match the demo registry.
    const demoAccount = lookupDemoPatient(phone_or_email, date_of_birth);
    if (demoAccount) {
      const looksLikeEmail = /@/.test(phone_or_email);
      const channelType = looksLikeEmail ? 'email' : 'phone';
      const channelMasked = looksLikeEmail
        ? demoAccount.email_masked
        : demoAccount.phone_masked;

      await logAuthEvent('staff_identity_verified', demoAccount.userId, {
        actor: 'patient',
        path: 'demo_registry',
      });
      return NextResponse.json({
        success: true,
        user_id: demoAccount.userId,
        name: demoAccount.name,
        channel_type: channelType,
        channel_masked: channelMasked,
      });
    }

    // ── PRODUCTION PATH ─────────────────────────────────────────────
    const admin = getSupabaseAdmin();
    if (DEMO_MODE || !isSupabaseConfigured() || !admin) {
      // No demo match AND Supabase not usable → can't authenticate.
      await logAuthEvent('staff_identity_failed', null, {
        actor: 'patient',
        phone_or_email,
        reason: 'no_demo_match_and_no_db',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'No record matched those details.',
          message:
            "We couldn't find a patient record matching that contact and date of birth. Double-check both, or contact the clinic.",
          support_email: SUPPORT_EMAIL,
          support_phone: SUPPORT_PHONE,
        },
        { status: 401 },
      );
    }

    const id = phone_or_email.trim();
    const looksLikeEmail = id.includes('@');

    // Use the admin client because RLS on patient_profiles only grants
    // service_role read access. Single-equality with maybeSingle() avoids
    // the .or() string-injection vector and the .single() crash on 0 rows.
    const baseQuery = admin
      .from('patient_profiles')
      .select('id, full_name, email, phone, date_of_birth')
      .limit(1);
    const { data: profile, error } = await (looksLikeEmail
      ? baseQuery.eq('email', id.toLowerCase()).maybeSingle()
      : baseQuery.eq('phone', id).maybeSingle());

    if (error || !profile) {
      await logAuthEvent('staff_identity_failed', null, {
        actor: 'patient',
        phone_or_email,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'No record matched those details.',
          support_email: SUPPORT_EMAIL,
          support_phone: SUPPORT_PHONE,
        },
        { status: 401 },
      );
    }

    if (profile.date_of_birth !== date_of_birth) {
      // Intentionally generic message: "No record matched" — never tell
      // an attacker WHICH factor was wrong, that's an enumeration oracle.
      return NextResponse.json(
        { success: false, error: 'No record matched those details.' },
        { status: 401 },
      );
    }

    const phone = (profile.phone as string) || '';
    const email = (profile.email as string) || '';
    const phone_masked =
      phone.length >= 4 ? `***-***-${phone.slice(-4)}` : '***-***-****';
    const email_masked = email
      ? email[0] + '***' + email.slice(email.indexOf('@'))
      : '***';

    await logAuthEvent('staff_identity_verified', profile.id, {
      actor: 'patient',
    });
    return NextResponse.json({
      success: true,
      user_id: profile.id,
      name: profile.full_name,
      channel_type: looksLikeEmail ? 'email' : 'phone',
      channel_masked: looksLikeEmail ? email_masked : phone_masked,
    });
  } catch (err) {
    console.error('[patient/verify-identity]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
