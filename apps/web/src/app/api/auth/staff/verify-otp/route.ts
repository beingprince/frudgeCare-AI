/**
 * POST /api/login/staff/verify-otp
 *
 * Step 4 bridge. Validates the OTP submitted by the staff user against
 * the most recent stored session and, on success, mints a short-lived
 * `verification_token` that the final `login` step requires.
 *
 * Demo accounts always accept the magic code 000000 (set in DEMO_OTP)
 * regardless of DEMO_MODE so the canned credentials keep working with
 * a real Supabase configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DEMO_MODE,
  DEMO_OTP,
  DEMO_STAFF_ACCOUNTS,
  logAuthEvent,
} from '@/lib/auth';
import crypto from 'crypto';

function isDemoStaffUserId(userId: string): boolean {
  return Object.values(DEMO_STAFF_ACCOUNTS).some((a) => a.userId === userId);
}

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
    if (isDemoStaffUserId(user_id)) {
      if (otp_code !== DEMO_OTP) {
        await logAuthEvent('otp_failed', user_id, {
          reason: 'wrong_code_demo',
        });
        return NextResponse.json(
          { success: false, error: 'Invalid verification code.' },
          { status: 401 },
        );
      }
      const token = crypto.randomBytes(32).toString('hex');
      await logAuthEvent('otp_verified', user_id, { path: 'demo_registry' });
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
      await logAuthEvent('otp_failed', user_id, { reason: 'not_found' });
      await admin.from('staff_login_attempts').insert({
        user_id,
        attempt_type: 'otp',
        success: false,
        failure_reason: 'invalid_code',
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

    await logAuthEvent('otp_verified', user_id, {});
    return NextResponse.json({ success: true, verification_token: token });
  } catch (err) {
    console.error('[verify-otp]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
