/**
 * cascade-store — server-only, in-memory store for the per-case AI
 * cascade payload + the patient-visible provider notes.
 *
 * Why in-memory rather than Postgres for the demo:
 *   - The hackathon judges may run the stack without a Supabase service
 *     key. The mock-service already follows the same pattern.
 *   - Adding a new column to `cases` would require a migration that
 *     races with the rest of the demo. Keeping cascade results in a
 *     module-scoped Map gives us O(1) reads, survives Next.js dev
 *     hot-reloads (via globalThis), and lets the patient status page
 *     poll one endpoint for live updates.
 *
 * When Supabase is wired up in production, replace these getters with a
 * row update on the `cases` table — no caller changes required.
 */

import type {
  CascadeQueue,
  CascadeNurse,
  CascadeProvider,
  ProviderNote,
} from "./cascade-types";

export type { ProviderNote } from "./cascade-types";

export interface StoredCascade {
  queue: CascadeQueue;
  nurse: CascadeNurse;
  provider: CascadeProvider;
  totalMs?: number;
  ranBy?: string;
  ranAt: string;
}

interface CaseLiveRecord {
  cascade?: StoredCascade;
  providerNotes: ProviderNote[];
  updatedAt: string;
}

type GlobalWithStore = typeof globalThis & {
  __frudgecareCaseLiveStore?: Map<string, CaseLiveRecord>;
};

const g = globalThis as GlobalWithStore;
if (!g.__frudgecareCaseLiveStore) {
  g.__frudgecareCaseLiveStore = new Map<string, CaseLiveRecord>();
}
const store = g.__frudgecareCaseLiveStore!;

function ensure(caseId: string): CaseLiveRecord {
  let rec = store.get(caseId);
  if (!rec) {
    rec = { providerNotes: [], updatedAt: new Date().toISOString() };
    store.set(caseId, rec);
  }
  return rec;
}

export function getCaseLive(caseId: string): CaseLiveRecord | null {
  return store.get(caseId) ?? null;
}

export function setCaseCascade(
  caseId: string,
  cascade: StoredCascade,
): CaseLiveRecord {
  const rec = ensure(caseId);
  rec.cascade = cascade;
  rec.updatedAt = new Date().toISOString();
  store.set(caseId, rec);
  return rec;
}

export function appendProviderNote(
  caseId: string,
  note: Omit<ProviderNote, "id" | "createdAt">,
): CaseLiveRecord {
  const rec = ensure(caseId);
  rec.providerNotes.push({
    ...note,
    id: cryptoRandomId(),
    createdAt: new Date().toISOString(),
  });
  rec.updatedAt = new Date().toISOString();
  store.set(caseId, rec);
  return rec;
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `note_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}
