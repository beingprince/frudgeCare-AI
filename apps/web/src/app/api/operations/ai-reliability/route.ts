/**
 * /api/operations/ai-reliability
 *
 * Returns a snapshot of AI-tier telemetry recorded during the current
 * server session. The operations dashboard uses this to show a live
 * reliability card — for example:
 *
 *   92.3% Tier 1 (grounded AI)
 *    6.1% Tier 2 (local KB only)
 *    1.6% Tier 3 (safe rule backup option)
 *
 * This endpoint is read-only and never calls the AI engine.
 */

import { NextResponse } from 'next/server';
import { getTierStats } from '@/lib/ai-telemetry';

export async function GET() {
  return NextResponse.json(getTierStats());
}
