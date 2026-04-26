/**
 * POST /api/login/patient/verify-otp
 *
 * Step 3 of the patient login flow. Validates the OTP submitted by the
 * patient against the most recent stored session. On success returns a
 * short-lived `verification_token` that the final `login` step requires
 * — without it, password alone cannot mint a session.
 *
 * Mirrors the staff `verify-otp` route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { DEMO_MODE, logAuthEvent, findDemoPatientByUserId } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { user_id, otp_code } = await req.json();
    if (!user_id || !otp_code) {
      return NextResponse.json(
        { success: false, error: 'user_id and otp_code required.' },
        { status: 400 },
      );
    }

    // ── DEMO MATCH (always tried first) ─────────────────────────────
    // Demo accounts always accept the magic "000000" code, regardless
    // of whether real Supabase is configured.
    if (findDemoPatientByUserId(user_id)) {
      if (otp_code !== '000000') {
        await logAuthEvent('otp_failed', user_id, {
          actor: 'patient',
          reason: 'wrong_code_demo',
        });
        return NextResponse.json(
          { success: false, error: 'Invalid verification code.' },
          { status: 401 },
        );
      }
      const token = crypto.randomBytes(32).toString('hex');
      await logAuthEvent('otp_verified', user_id, {
        actor: 'patient',
        path: 'demo_registry',
      });
      return NextResponse.json({ success: true, verification_token: token });
    }

    // ── PRODUCTION PATH ─────────────────────────────────────────────
    const admin = getSupabaseAdmin();
    if (DEMO_MODE || !isSupabaseConfigured() || !admin) {
      return NextResponse.json(
        { success: false, error: 'Invalid verification code.' },
        { status: 401 },
      );
    }
    const { data: session, error } = await admin
      .from('otp_sessions')
      .select('*')
      .eq('user_id', user_id)
      .eq('otp_code', otp_code)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !session) {
      await logAuthEvent('otp_failed', user_id, {
        actor: 'patient',
        reason: 'not_found',
      });
      return NextResponse.json(
        { success: false, error: 'Invalid verification code.' },
        { status: 401 },
      );
    }

    if (new Date(session.expires_at) < new Date()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Verification code has expired. Please request a new one.',
        },
        { status: 401 },
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    await admin
      .from('otp_sessions')
      .update({ verified: true, verification_token: token })
      .eq('id', session.id);

    await logAuthEvent('otp_verified', user_id, { actor: 'patient' });
    return NextResponse.json({ success: true, verification_token: token });
  } catch (err) {
    console.error('[patient/verify-otp]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
