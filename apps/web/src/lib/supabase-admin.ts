/**
 * lib/supabase-admin.ts
 *
 * Server-side Supabase client using the SERVICE_ROLE key.
 *
 * Why a separate client?
 *   • The default `lib/supabase.ts` uses the anon/publishable key. It's
 *     safe to import from React Server / Client components and respects
 *     Row-Level Security policies.
 *   • Route handlers that own write paths (case creation, AI artifact
 *     persistence, etc.) need to skip RLS so we don't have to wire up
 *     full login for the hackathon. This file gives them an admin client
 *     that the browser never sees.
 *
 * NEVER import this module from a "use client" file or from a Page that
 * runs in the browser. It's enforced by the `server-only` import below —
 * Next.js will hard-error at build time if it's pulled into a client
 * bundle.
 */
import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /^mock-/i,
  /your[-_]?(supabase|project)/i,
  /example\.supabase\.co/i,
];

function looksReal(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length < 10) return false;
  return !PLACEHOLDER_PATTERNS.some((rx) => rx.test(v));
}

/**
 * `true` when both the project URL and the service-role key are present
 * and look like real values (not the placeholder strings the demo ships
 * with). Use this instead of just checking truthiness — placeholder
 * strings would otherwise pass and produce confusing 500s on insert.
 */
export function isAdminConfigured(): boolean {
  return looksReal(SUPABASE_URL) && looksReal(SERVICE_ROLE_KEY);
}

let _admin: SupabaseClient | null = null;

/**
 * Lazily-initialised admin client. Returns `null` if credentials are
 * missing or look like placeholders, so callers can fall back to the
 * mock store without crashing the dev server.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (_admin) return _admin;
  if (!isAdminConfigured()) return null;
  _admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: {
      // Service-role client never holds a user session.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: { schema: 'public' },
  });
  return _admin;
}
