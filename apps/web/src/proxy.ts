/**
 * middleware.ts
 *
 * FrudgeCare Route Guard
 * ----------------------
 * Protects all role-based panel routes.
 * Validates the fc_session security token and redirects to the correct
 * login page if the session is missing or role mismatches.
 *
 * Decision Origin:
 *  - Next.js Edge Middleware runs on every request before show on screen,
 *    making it the correct layer for login enforcement.
 *  - Route matching uses path prefix checks for simplicity.
 *  - Demo mode skip allows persona switcher to work without a
 *    real login flow during hackathon presentations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'frudgecare-dev-secret-change-in-production'
);

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Route prefix → required role(s)
const PROTECTED_ROUTES: { prefix: string; roles: string[] }[] = [
  { prefix: '/patient',     roles: ['patient'] },
  { prefix: '/front-desk',  roles: ['front_desk'] },
  { prefix: '/nurse',       roles: ['nurse'] },
  { prefix: '/provider',    roles: ['provider'] },
  { prefix: '/operations',  roles: ['operations', 'admin'] },
  { prefix: '/admin',       roles: ['admin'] },
];

/**
 * Public paths that skip the login gate even though they live under a
 * protected prefix.
 *
 *   /patient/intake — walk-in intake form. By definition the patient has
 *                     no account yet; gating it would mean a new patient
 *                     can never reach the form (chicken-and-egg). The
 *                     login page even links here as "Submit a new care
 *                     intake".
 *   /patient/status — read-only case status. Access is keyed by the
 *                     `?caseId=…` query param (which is itself a
 *                     hard-to-guess `FC-C-XXXXXX` code). Patients who
 *                     just submitted intake and walk-ins handed a code
 *                     by the front desk both need to land here without
 *                     a session.
 *
 * Anything more sensitive (history, profile, encounters) stays gated.
 */
const PUBLIC_PATHS: string[] = [
  '/patient/intake',
  '/patient/status',
];

// Role → login path for redirect
const ROLE_AUTH_PATH: Record<string, string> = {
  patient:    '/auth/patient',
  front_desk: '/auth/staff/front-desk',
  nurse:      '/auth/staff/nurse',
  provider:   '/auth/staff/provider',
  operations: '/auth/staff/admin',
  admin:      '/auth/staff/admin',
};

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function getRequiredRoles(pathname: string): string[] | null {
  for (const route of PROTECTED_ROUTES) {
    if (pathname.startsWith(route.prefix)) return route.roles;
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // In demo mode, skip login entirely so the persona switcher works
  if (DEMO_MODE) return NextResponse.next();

  // Walk-in / public flows (intake form, send-submit status page).
  // Checked BEFORE the protected-prefix lookup so they aren't gated
  // by the broader /patient/* match.
  if (isPublicPath(pathname)) return NextResponse.next();

  const requiredRoles = getRequiredRoles(pathname);
  if (!requiredRoles) return NextResponse.next();

  const token = request.cookies.get('fc_session')?.value;

  // No session — redirect to appropriate login
  if (!token) {
    const loginPath = ROLE_AUTH_PATH[requiredRoles[0]] || '/auth/patient';
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = payload.role as string;

    // Role mismatch — redirect with error
    if (!requiredRoles.includes(userRole)) {
      const loginPath = ROLE_AUTH_PATH[requiredRoles[0]] || '/auth/patient';
      const url = request.nextUrl.clone();
      url.pathname = loginPath;
      url.searchParams.set('error', 'wrong_role');
      return NextResponse.redirect(url);
    }

    // Attach user info to request headers for server components
    const response = NextResponse.next();
    response.headers.set('x-user-id', payload.userId as string);
    response.headers.set('x-user-role', userRole);
    return response;
  } catch {
    // Invalid/expired security token — clear cookie and redirect
    const loginPath = ROLE_AUTH_PATH[requiredRoles[0]] || '/auth/patient';
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.searchParams.set('error', 'session_expired');
    const response = NextResponse.redirect(url);
    response.cookies.delete('fc_session');
    return response;
  }
}

export const config = {
  matcher: [
    '/patient/:path*',
    '/front-desk/:path*',
    '/provider/:path*',
    '/operations/:path*',
    '/admin/:path*',
  ],
};
