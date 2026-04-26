import { NextResponse } from 'next/server';

/**
 * BFF proxy to the FastAPI scripted-agent endpoint.
 *
 * This endpoint backs the /agent page. It does NOT degrade the way
 * /api/ai/triage-cascade and /api/ai/analyze-intake do because the
 * agent's own code already has a deterministic fallback inside the
 * Python layer (when Gemini is rate-limited or down, the agent still
 * returns a verdict with synthesis_mode = "deterministic"). We only
 * synthesize a Tier-3 envelope here when the engine itself is
 * unreachable.
 */
type AgenticRequest = {
  narrative?: string;
  age?: number | null;
  sex?: string | null;
  known_medications?: string[] | null;
  measured_vitals?: Record<string, number> | null;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AgenticRequest;

  if (!body.narrative || !body.narrative.trim()) {
    return NextResponse.json(
      { error: 'narrative is required' },
      { status: 422 },
    );
  }

  const aiEngineBase = process.env.AI_ENGINE_BASE_URL || 'http://localhost:8002';
  const url = `${aiEngineBase}/ai/agentic-triage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret':
          process.env.INTERNAL_API_SECRET ?? 'frudgecare-internal-dev-secret',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Agent engine returned ${response.status}`);
    }
    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      '[agentic-triage] engine unreachable, returning offline envelope:',
      error,
    );
    return NextResponse.json(
      {
        agent_available: false,
        synthesis_mode: 'offline',
        verdict: {
          urgency: 'MODERATE',
          rationale:
            'Agent engine is offline. Defaulting to MODERATE so a clinician reviews this case.',
          first_actions: [
            'Triage nurse to confirm vitals and history',
            'Restart the AI engine and re-run the agent',
          ],
        },
        trace: [],
        steps_used: 0,
        max_steps: 0,
        tools_offered: [],
        model: 'unavailable',
        elapsed_ms: 0,
        stop_reason: 'engine_unreachable',
        architecture: 'offline_fallback',
      },
      { status: 200 },
    );
  }
}
