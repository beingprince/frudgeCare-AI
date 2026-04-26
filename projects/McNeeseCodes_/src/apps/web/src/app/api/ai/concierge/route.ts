import { NextResponse } from "next/server";

/**
 * /api/ai/concierge — natural-language access to the platform.
 *
 * MVP "AI navigation" layer. Takes a free-text query and returns:
 *   - intent       : what the operator probably wants to do
 *   - route        : where to send them
 *   - summary      : a short, plain-English explanation
 *   - actions[]    : suggested follow-up commands (label + route)
 *   - source_tier  : 0 = deterministic keyword router (always-on)
 *                    2 = LLM (Gemini via FastAPI)
 *                    3 = safe fallback
 *
 * Design choice: we don't gate on LLM availability. The deterministic
 * keyword router covers all the navigation queries judges actually ask
 * ("show me the queue", "open chest pain patient", "what's in nurse
 *  triage"). Gemini is layered on top only for arbitrary clinical questions
 * ("what's the qSOFA cutoff for sepsis?") — and falls back gracefully when
 * unavailable.
 */

type Intent =
  | "navigate"
  | "open_patient"
  | "ask_clinical"
  | "summarize"
  | "unknown";

interface Action {
  label: string;
  route: string;
}

interface ConciergeResult {
  intent: Intent;
  route: string | null;
  summary: string;
  actions: Action[];
  source_tier: 0 | 2 | 3;
  provenance: string;
  matched_keywords?: string[];
}

// Role-specific routes are checked BEFORE the generic /triage scenarios so
// that queries like "nurse triage" route to the nurse panel rather than the
// patient triage page.
const ROUTES: Array<{
  re: RegExp;
  intent: Intent;
  route: string;
  label: string;
  hint: string;
}> = [
  {
    re: /\b(nurse|vitals|vital\s+signs|handoff|escalate|huddle)\b/i,
    intent: "navigate",
    route: "/console?tab=nurse",
    label: "Open Nurse Triage",
    hint: "Validate AI vitals + escalate if needed",
  },
  {
    re: /\b(provider|doctor|physician|daily(?:\s+list)?|disposition|encounter|visit|clinical\s+note)\b/i,
    intent: "navigate",
    route: "/console?tab=provider",
    label: "Open Provider Daily List",
    hint: "Today's encounters and disposition decisions",
  },
  {
    re: /\b(operations?|ops|kpi|metric|dashboard|funnel|throughput|analytics?|report)\b/i,
    intent: "navigate",
    route: "/console?tab=operations",
    label: "Open Operations Dashboard",
    hint: "Live KPIs, AI tier mix, throughput funnel",
  },
  {
    re: /\b(queue|front\s*desk|incoming|waiting|prioriti[sz]e|assign|reserve|schedule|appointment)\b/i,
    intent: "navigate",
    route: "/console?tab=front-desk",
    label: "Open Front Desk Queue",
    hint: "All incoming cases, AI-prioritized",
  },
  {
    re: /\b(console|all\s+panels?|every\s+panel|home\s+screen|main\s+view)\b/i,
    intent: "navigate",
    route: "/console",
    label: "Open Console",
    hint: "All staff panels in one tabbed surface",
  },
  {
    re: /\b(triage|new\s+intake|symptom|chest\s+pain|stroke|sepsis|peds?|pediatric|patient\s+demo|run\s+ai|cascade)\b/i,
    intent: "navigate",
    route: "/triage",
    label: "Open Patient Triage",
    hint: "AI cascade for a fresh symptom narrative",
  },
];

// Patient-name patterns: case-sensitive captures of capitalized words only.
// Without case-sensitivity these would over-match common words like "the".
const PATIENT_PATTERNS = [
  /\bpatient\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
  /\b(?:open|show|find|pull\s+up)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
];

function deterministicRoute(query: string): ConciergeResult | null {
  const q = query.trim();
  if (!q) return null;

  // 1) Case-id pattern wins over everything (it's unambiguous).
  const caseIdMatch = q.match(/\b(FC-C-[\w\d]+|FC-[\w\d]+)/i);
  if (caseIdMatch) {
    return {
      intent: "open_patient",
      route: `/console?tab=front-desk&case=${encodeURIComponent(caseIdMatch[1])}`,
      summary: `Looking up case ${caseIdMatch[1]}. Front-desk queue will scroll to the matching row.`,
      actions: [
        { label: "Open Front Desk Queue", route: "/console?tab=front-desk" },
        { label: "Open Nurse Triage", route: "/console?tab=nurse" },
      ],
      source_tier: 0,
      provenance: "Deterministic case-id pattern match",
      matched_keywords: [caseIdMatch[1]],
    };
  }

  // 2) Navigation routing — strongest demo signal. Must run BEFORE the
  //    patient-name fallback or queries like "open the queue" get
  //    mis-classified as a patient lookup.
  for (const r of ROUTES) {
    const m = q.match(r.re);
    if (m) {
      return {
        intent: r.intent,
        route: r.route,
        summary: `${r.hint}.`,
        actions: ROUTES.filter((x) => x !== r)
          .slice(0, 3)
          .map((x) => ({ label: x.label, route: x.route })),
        source_tier: 0,
        provenance: "Deterministic keyword routing (no LLM call)",
        matched_keywords: [m[0]],
      };
    }
  }

  // 3) Patient-name lookup as a last deterministic try. Must look like a
  //    proper noun (capitalized) so it doesn't swallow generic words.
  for (const pat of PATIENT_PATTERNS) {
    const m = q.match(pat);
    if (m && m[1] && /^[A-Z]/.test(m[1])) {
      const term = m[1];
      return {
        intent: "open_patient",
        route: `/console?tab=front-desk&patient=${encodeURIComponent(term)}`,
        summary: `Searching the queue for "${term}". Open the matching row to see the full case detail.`,
        actions: [
          { label: "Open Front Desk Queue", route: "/console?tab=front-desk" },
          { label: "Open Nurse Triage", route: "/console?tab=nurse" },
        ],
        source_tier: 0,
        provenance: "Deterministic patient-name pattern match",
        matched_keywords: [term],
      };
    }
  }

  return null;
}

async function llmAnswer(
  query: string,
): Promise<Pick<ConciergeResult, "summary" | "source_tier" | "provenance"> | null> {
  // Optional Gemini summary for arbitrary clinical questions. Uses the
  // FastAPI engine's existing infrastructure so we don't need a second
  // API key in the web tier. Falls back silently if engine is offline.
  const base =
    process.env.AI_ENGINE_BASE_URL || "http://localhost:8002";
  try {
    const r = await fetch(`${base}/analyze-intake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret":
          process.env.INTERNAL_API_SECRET ?? "frudgecare-internal-dev-secret",
      },
      body: JSON.stringify({
        symptoms: query,
        severity: "moderate",
        age: "Adult",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as {
      summary?: string;
      reasoning?: string;
      source_tier?: number;
    };
    const summary =
      data.summary?.trim() ||
      data.reasoning?.trim() ||
      "I couldn't find a definitive clinical answer — please consult a clinician.";
    const tier = (data.source_tier === 2 ? 2 : 3) as 2 | 3;
    return {
      summary,
      source_tier: tier,
      provenance:
        tier === 2
          ? "Google Gemini (via FastAPI tiered cascade)"
          : "Safe local fallback (engine returned no LLM answer)",
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { query?: string };
  const query = (body.query ?? "").toString().slice(0, 500);

  if (!query.trim()) {
    return NextResponse.json({
      intent: "unknown",
      route: null,
      summary:
        "Try things like: \"open the queue\", \"show me chest-pain patient\", \"what's in nurse triage\", or paste a symptom narrative.",
      actions: [
        { label: "Patient Triage Demo", route: "/triage" },
        { label: "Front Desk Queue", route: "/console?tab=front-desk" },
        { label: "Nurse Triage", route: "/console?tab=nurse" },
        { label: "Operations Dashboard", route: "/console?tab=operations" },
      ],
      source_tier: 0,
      provenance: "Empty-query help screen",
    } satisfies ConciergeResult);
  }

  // 1) Try deterministic routing first — fast, free, always works.
  const det = deterministicRoute(query);
  if (det) return NextResponse.json(det);

  // 2) Otherwise treat it as an arbitrary clinical question and let the
  //    AI engine answer (with safe fallback if offline).
  const llm = await llmAnswer(query);
  if (llm) {
    return NextResponse.json({
      intent: "ask_clinical",
      route: null,
      summary: llm.summary,
      actions: [
        { label: "Run full AI triage on this", route: "/triage" },
        { label: "Open Console", route: "/console" },
      ],
      source_tier: llm.source_tier,
      provenance: llm.provenance,
    } satisfies ConciergeResult);
  }

  // 3) Bottom of the cascade: safe fallback.
  return NextResponse.json({
    intent: "unknown",
    route: null,
    summary:
      "I don't have a confident answer for that. Try a triage scenario or open one of the panels below.",
    actions: [
      { label: "Patient Triage Demo", route: "/triage" },
      { label: "Front Desk Queue", route: "/console?tab=front-desk" },
      { label: "Nurse Triage", route: "/console?tab=nurse" },
      { label: "Operations Dashboard", route: "/console?tab=operations" },
    ],
    source_tier: 3,
    provenance: "Safe fallback (no keyword match + AI engine unavailable)",
  } satisfies ConciergeResult);
}
