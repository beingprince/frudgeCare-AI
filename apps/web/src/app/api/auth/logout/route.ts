/**
 * POST /api/login/logout
 * Clears the fc_session cookie for all roles.
 */
import { NextResponse } from 'next/server';
import { logAuthEvent, getSession } from '@/lib/auth';

export async function POST() {
  const session = await getSession();
  if (session) {
    await logAuthEvent('session_destroyed', session.userId, { role: session.role });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete('fc_session');
  return response;
}
