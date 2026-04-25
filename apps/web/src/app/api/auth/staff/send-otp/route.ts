/**
 * POST /api/login/staff/send-otp
 *
 * Step 3 of staff login. Generates a 6-digit OTP, stores it in
 * `otp_sessions`, and dispatches it to the user's phone on file.
 *
 * In demo mode (or when the user_id matches an temporary demo staff
 * account) the OTP is the universal `000000` and we just log it. This
 * keeps the demo flow usable without an SMS provider.
 *
 * In dev builds we ALSO surface the OTP in the response data package as
 * `dev_otp` so the UI can show on screen a hint — never echoed in production.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DEMO_MODE,
  DEMO_OTP,
  DEMO_STAFF_ACCOUNTS,
  generateOTP,
  getOTPExpiry,
  sendOTP,
  logAuthEvent,
} from '@/lib/auth';

function isDemoStaffUserId(userId: string): boolean {
  return Object.values(DEMO_STAFF_ACCOUNTS).some((a) => a.userId === userId);
}

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return NextResponse.json(
        { success: false, error: 'user_id required.' },
        { status: 400 },
      );
    }

    // ── DEMO MATCH (always tried first) ─────────────────────────────
    if (isDemoStaffUserId(user_id)) {
      console.log(`[demo] Staff OTP for ${user_id}: ${DEMO_OTP}`);
      await logAuthEvent('otp_requested', user_id, {
        path: 'demo_registry',
      });
      return NextResponse.json({ success: true, demo_otp: DEMO_OTP });
    }

    // ── PRODUCTION PATH ─────────────────────────────────────────────
    const admin = getSupabaseAdmin();
    if (DEMO_MODE || !isSupabaseConfigured() || !admin) {
      return NextResponse.json(
        { success: false, error: 'Failed to send OTP.' },
        { status: 500 },
      );
    }

    const otp = generateOTP();
    const expires_at = getOTPExpiry();

    const { error } = await admin
      .from('otp_sessions')
      .insert({
        user_id,
        otp_code: otp,
        expires_at: expires_at.toISOString(),
      });
    if (error) throw error;

    const { data: user } = await admin
      .from('staff_users')
      .select('phone, email')
      .eq('id', user_id)
      .limit(1)
      .maybeSingle();

    const channel = user?.phone || user?.email;
    if (channel) await sendOTP(channel, otp);

    await logAuthEvent('otp_requested', user_id, {});

    const responsePayload: { success: true; dev_otp?: string } = {
      success: true,
    };
    if (process.env.NODE_ENV !== 'production') {
      responsePayload.dev_otp = otp;
    }
    return NextResponse.json(responsePayload);
  } catch (err) {
    console.error('[send-otp]', err);
    return NextResponse.json(
      { success: false, error: 'Failed to send OTP.' },
      { status: 500 },
    );
  }
}
