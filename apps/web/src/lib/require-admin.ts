/**
 * lib/require-admin.ts
 *
 * Tiny helper that any /api/admin/* route should call before doing
 * privileged work. Returns the active session when the requester is an
 * authenticated admin/operations user, or a NextResponse 401/403 that
 * the route should return immediately.
 *
 * Why a helper instead of middleware
 * ----------------------------------
 * Next.js Edge middleware (`proxy.ts`) doesn't see request bodies and
 * can't issue per-route 4xx with structured JSON, which is what the
 * admin UI expects. Doing the gate in-route keeps responses uniform.
 */

import { NextResponse } from 'next/server';
import { getSession, type SessionPayload } from '@/lib/auth';

export async function requireAdmin(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Not authenticated.' },
        { status: 401 },
      ),
    };
  }
  if (session.role !== 'admin' && session.role !== 'operations') {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Admin access required.' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, session };
}
