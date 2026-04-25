/**
 * /api/admin/accounts/[id]
 *
 * PATCH  — admin updates a single staff_users row (display_name,
 *          username, email, phone, department, active, role). When a
 *          new `password` is supplied it is bcrypt-hashed in place; we
 *          never echo the hash back to the client.
 * DELETE — admin deactivates an account. We deliberately do NOT hard-
 *          delete: case rows reference staff via FK and audit chains
 *          should remain intact. Setting `active=false` is enough to
 *          revoke login.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabase-admin';
import { hashPassword, updateDemoStaffAccount, DEMO_MODE } from '@/lib/auth';
import { requireAdmin } from '@/lib/require-admin';

const MIN_PASSWORD_LENGTH = 8;

const VALID_ROLES = new Set([
  'front_desk',
  'nurse',
  'provider',
  'operations',
  'admin',
]);

interface UpdatePayload {
  role?: string;
  username?: string;
  display_name?: string;
  email?: string;
  phone?: string;
  phone_country?: string;
  department?: string;
  active?: boolean;
  password?: string; // optional — set only when admin resets it
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await props.params;

  let body: UpdatePayload;
  try {
    body = (await req.json()) as UpdatePayload;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.role === 'string') {
    if (!VALID_ROLES.has(body.role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role.' },
        { status: 400 },
      );
    }
    updates.role = body.role;
  }
  if (typeof body.username === 'string')
    updates.username = body.username.trim().toLowerCase();
  if (typeof body.display_name === 'string')
    updates.display_name = body.display_name.trim();
  if (typeof body.email === 'string')
    updates.email = body.email.trim().toLowerCase();
  if (typeof body.phone === 'string') updates.phone = body.phone.trim() || null;
  if (typeof body.phone_country === 'string')
    updates.phone_country = body.phone_country.trim() || null;
  if (typeof body.department === 'string')
    updates.department = body.department.trim() || null;
  if (typeof body.active === 'boolean') updates.active = body.active;

  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }
    updates.password_hash = await hashPassword(body.password);
    // Reset lockout on password reset — common admin expectation.
    updates.failed_login_attempts = 0;
    updates.locked_until = null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, error: 'No fields to update.' },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();

  // Demo backup option: keep the temporary registry updated so the staff
  // login flow reflects edits even before a real DB exists.
  if (!isAdminConfigured() || !admin) {
    if (DEMO_MODE) {
      updateDemoStaffAccount(id, {
        username:
          (updates.username as string | undefined) ?? undefined,
        email: (updates.email as string | undefined) ?? undefined,
        name: (updates.display_name as string | undefined) ?? undefined,
        phone_masked: body.phone
          ? body.phone.replace(/\d(?=\d{4})/g, '*')
          : undefined,
      });
    }
    return NextResponse.json({ success: true, mock: true });
  }

  const { data, error } = await admin
    .from('staff_users')
    .update(updates)
    .eq('id', id)
    .select(
      'id, role, staff_code, username, display_name, email, phone, phone_country, department, active, failed_login_attempts, locked_until',
    )
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        {
          success: false,
          error: 'Username or email is already taken by another account.',
        },
        { status: 409 },
      );
    }
    console.error('[admin/accounts PATCH]', error);
    return NextResponse.json(
      { success: false, error: error.message ?? 'Update failed.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, user: data });
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await props.params;
  const admin = getSupabaseAdmin();

  if (!isAdminConfigured() || !admin) {
    return NextResponse.json({ success: true, mock: true });
  }

  // Soft-delete: deactivate rather than hard-delete to preserve audit
  // chains and any referencing rows.
  const { error } = await admin
    .from('staff_users')
    .update({ active: false })
    .eq('id', id);

  if (error) {
    console.error('[admin/accounts DELETE]', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
