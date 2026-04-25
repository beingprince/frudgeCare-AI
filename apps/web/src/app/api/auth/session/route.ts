/**
 * GET /api/login/session
 *
 * Returns the active fc_session security token data package (role, name, email) for
 * client-side shell / page branching. No secrets — same data the edge
 * middleware already trusts.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    userId: session.userId,
    role: session.role,
    name: session.name,
    email: session.email,
    staffCode: session.staffCode ?? null,
  });
}
