/**
 * POST /api/login/patient/send-otp
 *
 * Step 2 of the patient login flow. Generates a 6-digit OTP, stores it
 * in `otp_sessions`, and dispatches it to the verified contact channel
 * surfaced by `verify-identity`.
 *
 * In demo mode the OTP is the universal "000000" and we just log it.
 *
 * Mirrors the staff `send-otp` route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DEMO_MODE,
  DEMO_OTP,
  generateOTP,
  getOTPExpiry,
  sendOTP,
  logAuthEvent,
  findDemoPatientByUserId,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return NextResponse.json(
        { success: false, error: 'user_id required.' },
        { status: 400 },
      );
    }

    const expires_at = getOTPExpiry();

    // ── DEMO MATCH (always tried first) ─────────────────────────────
    // Demo accounts always use the universal demo OTP regardless of
    // DEMO_MODE flag, because the matching verify-otp route compares
    // against that literal. We log it server-side and surface it to
    // the client only as a non-PII helper so the demo flow is usable
    // without an SMS provider configured.
    const demoAccount = findDemoPatientByUserId(user_id);
    if (demoAccount) {
      console.log(
        `[demo] Patient OTP for ${demoAccount.email} (${demoAccount.phone}): ${DEMO_OTP}`,
      );
      await logAuthEvent('otp_requested', user_id, {
        actor: 'patient',
        path: 'demo_registry',
      });
      return NextResponse.json({ success: true, demo_otp: DEMO_OTP });
    }

    // ── PRODUCTION PATH ─────────────────────────────────────────────
    const admin = getSupabaseAdmin();
    if (DEMO_MODE || !isSupabaseConfigured() || !admin) {
      // Not a demo user_id and no DB to look up against — bail.
      return NextResponse.json(
        { success: false, error: 'Failed to send verification code.' },
        { status: 500 },
      );
    }

    const otp = generateOTP();
    const { error } = await admin
      .from('otp_sessions')
      .insert({ user_id, otp_code: otp, expires_at: expires_at.toISOString() });
    if (error) throw error;

    const { data: profile } = await admin
      .from('patient_profiles')
      .select('phone, email')
      .eq('id', user_id)
      .limit(1)
      .maybeSingle();

    // Prefer phone, fall back to email — the verify-identity step has
    // already told the UI which channel to expect, but if both are
    // present we send to phone for SMS-grade reliability.
    const channel = profile?.phone || profile?.email;
    if (channel) await sendOTP(channel, otp);

    await logAuthEvent('otp_requested', user_id, { actor: 'patient' });

    // Local-dev convenience: when we don't have a real SMS provider
    // wired in, surface the OTP in the response so the demo flow stays
    // usable end-to-end. Only echoed in non-production builds.
    const responsePayload: { success: true; dev_otp?: string } = { success: true };
    if (process.env.NODE_ENV !== 'production') {
      responsePayload.dev_otp = otp;
    }
    return NextResponse.json(responsePayload);
  } catch (err) {
    console.error('[patient/send-otp]', err);
    return NextResponse.json(
      { success: false, error: 'Failed to send verification code.' },
      { status: 500 },
    );
  }
}
