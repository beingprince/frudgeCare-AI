import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-no-url-provided.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-no-key-provided'

// This will no longer crash the module evaluation even if env vars are missing
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// A value is "configured" only if it's present AND not an obvious placeholder.
// Without this guard, placeholder strings like "https://placeholder.supabase.co"
// look truthy to route handlers, which then attempt real inserts and 500.
const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /^mock-/i,
  /your[-_]?(supabase|project)/i,
  /example\.supabase\.co/i,
]

function looksReal(value: string | undefined): boolean {
  if (!value) return false
  const v = value.trim()
  if (v.length < 10) return false
  return !PLACEHOLDER_PATTERNS.some((rx) => rx.test(v))
}

export const isSupabaseConfigured = () => {
  return looksReal(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
         looksReal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
