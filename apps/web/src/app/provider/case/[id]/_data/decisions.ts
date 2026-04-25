/**
 * _data/decisions.ts
 *
 * Where submitted provider decisions live.
 *
 * Scope: mock / demo only. Save to localStorage under a single key
 * so the submit flow actually feels real across page refreshes.
 *
 * When the backend comes online, replace `saveDecision` with a change
 * (POST /provider/cases/:id/decisions) and `getDecision` with a query —
 * the component layer consumes this module as a plain API so swapping
 * the implementation is a one-file change.
 *
 * Schema-side shape mirrors `ProviderAction` in types/index.ts so that a
 * direct Supabase insert is straightforward.
 */

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * A provider's signed decision on a case.
 *
 * `nextAction.route` is the downstream workflow destination — the receipt
 * surfaces this so the provider can see *exactly* where their decision
 * was sent (front desk lab queue, pharmacy, referrals, resolution).
 */
export type NextAction =
  | "order_in_clinic_test"
  | "prescribe_medication"
  | "refer_to_specialist"
  | "close_and_discharge";

export const NEXT_ACTION_OPTIONS: {
  value: NextAction;
  label: string;
  /** Human-facing description of where this decision is routed. */
  route: string;
}[] = [
  { value: "order_in_clinic_test", label: "Order in-clinic test",   route: "Front-desk lab queue" },
  { value: "prescribe_medication", label: "Prescribe medication",   route: "Pharmacy + patient dashboard" },
  { value: "refer_to_specialist",  label: "Refer to specialist",    route: "Specialist referral queue" },
  { value: "close_and_discharge",  label: "Close case & discharge", route: "Case resolution + patient dashboard" },
];

export function labelForAction(v: NextAction): string {
  return NEXT_ACTION_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function routeForAction(v: NextAction): string {
  return NEXT_ACTION_OPTIONS.find((o) => o.value === v)?.route ?? "Unknown";
}

export type ProviderDecision = {
  caseId: string;
  providerId: string;
  providerName: string;
  nextAction: NextAction;
  encounterNote: string;
  /** Null when the toggle is off or the message is empty. */
  patientUpdate: string | null;
  /** ISO timestamp — the "signed at" moment. */
  signedAt: string;
};

// ─── Storage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "fc.provider.decisions.v1";

function loadAll(): Record<string, ProviderDecision> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, ProviderDecision>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Quota / disabled — fail silently in mock mode.
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Save a provider decision. Supabase-first via the /api/provider/decisions
 * route; if that fails (dev mode without DB, network blip, etc.) we fall back
 * to localStorage so the demo never loses a signed note.
 */
export async function saveDecision(d: ProviderDecision): Promise<void> {
  try {
    const res = await fetch("/api/provider/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    if (res.ok) {
      // Still mirror to localStorage so the receipt show on screen after refresh
      // even if the user's session is offline.
      const all = loadAll();
      all[d.caseId] = d;
      saveAll(all);
      return;
    }
  } catch {
    // Swallow and fall through to the local-only path below.
  }

  const all = loadAll();
  all[d.caseId] = d;
  saveAll(all);
}

export function getDecision(caseId: string): ProviderDecision | null {
  const all = loadAll();
  return all[caseId] ?? null;
}

export function clearDecision(caseId: string): void {
  const all = loadAll();
  delete all[caseId];
  saveAll(all);
}
