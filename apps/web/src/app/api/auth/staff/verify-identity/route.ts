/**
 * POST /api/login/staff/verify-identity
 *
 * Step 1-2 of the staff login flow. Accepts { staff_code, username }
 * and resolves the candidate account, returning a masked phone for the
 * OTP step to display.
 *
 * Resolution order (mirrors the patient flow):
 *   1. DEMO_STAFF_ACCOUNTS — always tried first, regardless of
 *      DEMO_MODE. This keeps the canned hackathon credentials working
 *      even when real Supabase is configured but staff_users is
 *      unseeded for some reason.
 *   2. `staff_users` via the SERVICE_ROLE admin client. RLS on the
 *      table only grants service_role read access, so the anon client
 *      can't be used here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DEMO_MODE,
  lookupDemoStaff,
  logAuthEvent,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { staff_code, username } = await req.json();

    if (!staff_code || !username) {
      return NextResponse.json(
        { success: false, error: 'Staff code and username are required.' },
        { status: 400 },
      );
    }

    // ── DEMO MATCH (always tried first) ─────────────────────────────
    const demoAccount = lookupDemoStaff(staff_code, username);
    if (demoAccount) {
      await logAuthEvent('staff_identity_verified', demoAccount.userId, {
        staff_code,
        role: demoAccount.role,
        path: 'demo_registry',
      });
      return NextResponse.json({
        success: true,
        user_id: demoAccount.userId,
        role: demoAccount.role,
        name: demoAccount.name,
        phone_masked: demoAccount.phone_masked,
      });
    }

    // ── PRODUCTION PATH ────────────────────────────────────────────
    const admin = getSupabaseAdmin();
    if (DEMO_MODE || !isSupabaseConfigured() || !admin) {
      await logAuthEvent('staff_identity_failed', null, { staff_code, username });
      return NextResponse.json(
        {
          success: false,
          error: 'Account could not be verified.',
          message:
            'Sorry, your account could not be verified. Please contact the admin panel for access support.',
          support_email: SUPPORT_EMAIL,
          support_phone: SUPPORT_PHONE,
        },
        { status: 401 },
      );
    }

    const { data: user, error } = await admin
      .from('staff_users')
      .select(
        'id, role, display_name, phone, active, staff_code, username, failed_login_attempts, locked_until',
      )
      .eq('staff_code', String(staff_code).toUpperCase())
      .eq('username', String(username).toLowerCase().trim())
      .limit(1)
      .maybeSingle();

    if (error || !user) {
      await logAuthEvent('staff_identity_failed', null, { staff_code, username });
      return NextResponse.json(
        {
          success: false,
          error: 'Account could not be verified.',
          message:
            'Sorry, your account could not be verified. Please contact the admin panel for access support.',
          support_email: SUPPORT_EMAIL,
          support_phone: SUPPORT_PHONE,
        },
        { status: 401 },
      );
    }

    if (!user.active) {
      return NextResponse.json(
        {
          success: false,
          error: 'Account is inactive.',
          message:
            'Your account has been deactivated. Contact the admin panel to restore access.',
          support_email: SUPPORT_EMAIL,
          support_phone: SUPPORT_PHONE,
        },
        { status: 403 },
      );
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const unlockIn = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000,
      );
      return NextResponse.json(
        {
          success: false,
          error: `Account temporarily locked. Try again in ${unlockIn} minute(s).`,
          locked: true,
        },
        { status: 429 },
      );
    }

    const phone = (user.phone as string) || '';
    const phone_masked =
      phone.length >= 4 ? `***-***-${phone.slice(-4)}` : '***-***-****';

    await logAuthEvent('staff_identity_verified', user.id, {
      staff_code,
      role: user.role,
    });
    return NextResponse.json({
      success: true,
      user_id: user.id,
      role: user.role,
      name: user.display_name,
      phone_masked,
    });
  } catch (err) {
    console.error('[verify-identity]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
