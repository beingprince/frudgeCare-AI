/**
 * POST /api/login/staff/login
 *
 * Final step of the staff multi-factor flow. Cross-validates ALL of:
 *
 *   1. user_id              (from verify-identity)
 *   2. staff_code           (re-checked against the row, not just trusted)
 *   3. verification_token   (from verify-otp)
 *   4. email                (re-bound to the same account)
 *   5. password             (bcrypt verify)
 *
 * All five must point at the same staff_users row, AND the row's role
 * must equal `expected_panel`. On success we set the fc_session cookie
 * and return a redirect target.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DEMO_MODE,
  DEMO_PASSWORD,
  DEMO_STAFF_ACCOUNTS,
  ROLE_HOME,
  createSession,
  verifyPassword,
  logAuthEvent,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from '@/lib/auth';
import type { UserRole } from '@/types';

function findDemoStaffByUserId(userId: string) {
  for (const [staffCode, account] of Object.entries(DEMO_STAFF_ACCOUNTS)) {
    if (account.userId === userId) return { staffCode, account };
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const {
      user_id,
      staff_code,
      email,
      password,
      verification_token,
      expected_panel,
    } = await req.json();

    if (!user_id || !email || !password || !verification_token) {
      return NextResponse.json(
        { success: false, error: 'All credentials are required.' },
        { status: 400 },
      );
    }

    // ── DEMO MATCH (always tried first) ─────────────────────────────
    // Mirrors the patient login: direct constant comparison so the
    // canned demo credentials keep working when real Supabase is
    // configured but staff_users is unseeded.
    const demo = findDemoStaffByUserId(user_id);
    if (demo) {
      const { account } = demo;

      if (email.toLowerCase().trim() !== account.email) {
        await logAuthEvent('staff_login_failed', user_id, {
          reason: 'email_mismatch',
          path: 'demo_registry',
        });
        return NextResponse.json(
          { success: false, error: 'Email does not match the account on file.' },
          { status: 401 },
        );
      }

      if (password !== DEMO_PASSWORD) {
        await logAuthEvent('staff_login_failed', user_id, {
          reason: 'wrong_password',
          path: 'demo_registry',
        });
        return NextResponse.json(
          { success: false, error: 'Incorrect password.' },
          { status: 401 },
        );
      }

      if (expected_panel && account.role !== expected_panel) {
        await logAuthEvent('role_mismatch_attempt', user_id, {
          expected: expected_panel,
          actual: account.role,
        });
        return NextResponse.json(
          {
            success: false,
            error: `Access denied. Your account role (${account.role.replace(
              '_',
              ' ',
            )}) does not match this panel.`,
          },
          { status: 403 },
        );
      }

      const token = await createSession({
        userId: account.userId,
        role: account.role,
        name: account.name,
        email: account.email,
        staffCode: staff_code,
      });
      await logAuthEvent('staff_login_success', user_id, {
        role: account.role,
        path: 'demo_registry',
      });

      const response = NextResponse.json({
        success: true,
        role: account.role,
        name: account.name,
        redirect: ROLE_HOME[account.role as UserRole],
      });
      response.cookies.set('fc_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 8,
        path: '/',
      });
      return response;
    }

    // ── PRODUCTION PATH ────────────────────────────────────────────
    const admin = getSupabaseAdmin();
    if (DEMO_MODE || !isSupabaseConfigured() || !admin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Credentials do not match. Verify all fields and try again.',
          support_email: SUPPORT_EMAIL,
          support_phone: SUPPORT_PHONE,
        },
        { status: 401 },
      );
    }

    // Cross-validate: id + email + staff_code must all hit the same row.
    const { data: user, error } = await admin
      .from('staff_users')
      .select(
        'id, role, display_name, email, password_hash, staff_code, active',
      )
      .eq('id', user_id)
      .eq('email', email.toLowerCase().trim())
      .eq('staff_code', String(staff_code || '').toUpperCase())
      .limit(1)
      .maybeSingle();

    if (error || !user || !user.active) {
      await logAuthEvent('staff_login_failed', user_id, {
        reason: 'cross_validation_failed',
      });
      await admin.from('staff_login_attempts').insert({
        user_id,
        attempt_type: 'cross_validation',
        success: false,
        failure_reason: 'credential_mismatch',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Credentials do not match. Verify all fields and try again.',
          support_email: SUPPORT_EMAIL,
          support_phone: SUPPORT_PHONE,
        },
        { status: 401 },
      );
    }

    // Validate the verification_token came from a real OTP session.
    const { data: otpSession } = await admin
      .from('otp_sessions')
      .select('verification_token, verified')
      .eq('user_id', user_id)
      .eq('verification_token', verification_token)
      .eq('verified', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpSession) {
      await logAuthEvent('staff_login_failed', user_id, {
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

    const passwordOk = await verifyPassword(
      password,
      user.password_hash as string,
    );
    if (!passwordOk) {
      await logAuthEvent('staff_login_failed', user_id, {
        reason: 'wrong_password',
      });
      return NextResponse.json(
        { success: false, error: 'Incorrect password.' },
        { status: 401 },
      );
    }

    if (expected_panel && user.role !== expected_panel) {
      await logAuthEvent('role_mismatch_attempt', user_id, {
        expected: expected_panel,
        actual: user.role,
      });
      return NextResponse.json(
        {
          success: false,
          error: `Access denied. Your role does not match this panel.`,
        },
        { status: 403 },
      );
    }

    const token = await createSession({
      userId: user.id,
      role: user.role as UserRole,
      name: user.display_name,
      email: user.email,
      staffCode: user.staff_code,
    });
    await logAuthEvent('staff_login_success', user.id, { role: user.role });
    await admin.from('staff_login_attempts').insert({
      user_id: user.id,
      attempt_type: 'cross_validation',
      success: true,
    });

    const response = NextResponse.json({
      success: true,
      role: user.role,
      name: user.display_name,
      redirect: ROLE_HOME[user.role as UserRole],
    });
    response.cookies.set('fc_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('[staff-login]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
