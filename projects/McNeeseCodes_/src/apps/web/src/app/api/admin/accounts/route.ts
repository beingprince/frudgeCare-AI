/**
 * /api/admin/accounts
 *
 * GET   — list all staff_users + all patient_profiles for the admin
 *         "Account Administration" page.
 * POST  — admin creates a new staff account. Password is bcrypt-hashed
 *         server-side; the plaintext is never save or echoed back.
 *
 * Both endpoints are gated by `requireAdmin()`. Operations also passes
 * because the role enum treats them as super-admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabase-admin';
import { DEMO_STAFF_ACCOUNTS, hashPassword } from '@/lib/auth';
import { requireAdmin } from '@/lib/require-admin';

const VALID_ROLES = new Set([
  'front_desk',
  'nurse',
  'provider',
  'operations',
  'admin',
]);

const MIN_PASSWORD_LENGTH = 8;

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseAdmin();

  // No real DB → fall back to the temporary demo registry so the page
  // still show on screen something during early hackathon setup.
  if (!isAdminConfigured() || !admin) {
    const mockUsers = Object.values(DEMO_STAFF_ACCOUNTS).map((u) => ({
      id: u.userId,
      role: u.role,
      staff_code:
        u.role === 'admin'
          ? 'ADM-001'
          : u.role === 'front_desk'
          ? 'FD-001'
          : u.role === 'nurse'
          ? 'NU-001'
          : 'PR-001',
      username: u.username,
      display_name: u.name,
      email: u.email,
      phone: '',
      department:
        u.role === 'provider'
          ? 'Primary Care'
          : u.role === 'nurse'
          ? 'Triage'
          : u.role === 'front_desk'
          ? 'Front Desk'
          : 'Operations',
      active: true,
      failed_login_attempts: 0,
      locked_until: null,
    }));
    return NextResponse.json({ users: mockUsers, patients: [] });
  }

  // Real DB. We don't expose `password_hash` to the browser even though
  // RLS already blocks it for non-service-role clients — defence in
  // depth never hurts.
  const [{ data: users, error: usersErr }, { data: patients, error: patErr }] =
    await Promise.all([
      admin
        .from('staff_users')
        .select(
          'id, role, staff_code, username, display_name, email, phone, phone_country, department, active, failed_login_attempts, locked_until, created_at',
        )
        .order('role')
        .order('display_name'),
      admin
        .from('patient_profiles')
        .select(
          'id, full_name, date_of_birth, gender, phone, email, created_at',
        )
        .order('created_at', { ascending: false }),
    ]);

  if (usersErr) {
    console.error('[admin/accounts GET] users error', usersErr);
    return NextResponse.json(
      { success: false, error: usersErr.message },
      { status: 500 },
    );
  }
  if (patErr && patErr.code !== '42P01') {
    console.error('[admin/accounts GET] patient error', patErr);
  }

  return NextResponse.json({
    users: users ?? [],
    patients: patients ?? [],
  });
}

interface CreatePayload {
  role?: string;
  staff_code?: string;
  username?: string;
  display_name?: string;
  email?: string;
  phone?: string;
  phone_country?: string;
  department?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: CreatePayload;
  try {
    body = (await req.json()) as CreatePayload;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const role = String(body.role ?? '').trim();
  const staffCode = String(body.staff_code ?? '').trim().toUpperCase();
  const username = String(body.username ?? '').trim().toLowerCase();
  const displayName = String(body.display_name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim() || null;
  const phoneCountry = String(body.phone_country ?? '').trim() || null;
  const department = String(body.department ?? '').trim() || null;
  const password = String(body.password ?? '');

  if (!VALID_ROLES.has(role)) {
    return NextResponse.json(
      { success: false, error: 'Invalid role.' },
      { status: 400 },
    );
  }
  if (!staffCode) {
    return NextResponse.json(
      { success: false, error: 'Staff code is required.' },
      { status: 400 },
    );
  }
  if (!username) {
    return NextResponse.json(
      { success: false, error: 'Username is required.' },
      { status: 400 },
    );
  }
  if (!displayName) {
    return NextResponse.json(
      { success: false, error: 'Display name is required.' },
      { status: 400 },
    );
  }
  if (!email) {
    return NextResponse.json(
      { success: false, error: 'Email is required.' },
      { status: 400 },
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!isAdminConfigured() || !admin) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Real database is not configured. Set SUPABASE_SERVICE_ROLE_KEY to create accounts.',
      },
      { status: 503 },
    );
  }

  const password_hash = await hashPassword(password);

  const { data, error } = await admin
    .from('staff_users')
    .insert({
      role,
      staff_code: staffCode,
      username,
      display_name: displayName,
      email,
      phone,
      phone_country: phoneCountry,
      department,
      password_hash,
    })
    .select(
      'id, role, staff_code, username, display_name, email, phone, phone_country, department, active, created_at',
    )
    .single();

  if (error) {
    // 23505 = unique_violation. Friendlier message for the operator.
    if (error.code === '23505') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Staff code, username, or email is already taken. Pick a different value.',
        },
        { status: 409 },
      );
    }
    console.error('[admin/accounts POST]', error);
    return NextResponse.json(
      { success: false, error: error.message ?? 'Could not create account.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, user: data }, { status: 201 });
}
