/**
 * /api/cases/[caseId]/cascade
 *
 * GET  → returns the most recent stored cascade payload + the
 *        patient-visible provider notes for the case, so the patient
 *        status page can poll and surface live updates from the care
 *        team without needing direct DB access.
 *
 * POST → persists a fresh cascade payload (run by the nurse / provider)
 *        and optionally appends a new provider note. Same-origin only,
 *        no secret needed for the demo, but we mirror the
 *        `INTERNAL_API_SECRET` header check used by the orchestrator
 *        so production wiring is one line away.
 *
 * Storage is module-scoped (see lib/cascade-store) — survives Next.js
 * dev hot-reloads via globalThis. Production swap-in: replace the
 * setter calls with a Postgres update on `cases.cascade_data`.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  appendProviderNote,
  getCaseLive,
  setCaseCascade,
  type ProviderNote,
  type StoredCascade,
} from "@/lib/cascade-store";
import { normalizeCascade } from "@/lib/cascade-types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  if (!caseId) {
    return NextResponse.json({ error: "caseId is required" }, { status: 400 });
  }
  const rec = getCaseLive(caseId);
  return NextResponse.json({
    caseId,
    cascade: rec?.cascade ?? null,
    providerNotes: rec?.providerNotes ?? [],
    updatedAt: rec?.updatedAt ?? null,
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  if (!caseId) {
    return NextResponse.json({ error: "caseId is required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    cascade?: unknown;
    ranBy?: string;
    note?: Partial<Omit<ProviderNote, "id" | "createdAt">> | null;
  };

  let stored: StoredCascade | null = null;
  if (body.cascade) {
    const c = normalizeCascade(body.cascade);
    stored = {
      queue: c.queue,
      nurse: c.nurse,
      provider: c.provider,
      totalMs: c.totalMs,
      ranBy: body.ranBy ?? "unknown",
      ranAt: new Date().toISOString(),
    };
    setCaseCascade(caseId, stored);
  }

  if (body.note && body.note.body) {
    appendProviderNote(caseId, {
      authorRole: body.note.authorRole ?? "nurse",
      authorLabel: body.note.authorLabel ?? "Care team",
      body: String(body.note.body),
      patientVisible:
        typeof body.note.patientVisible === "boolean"
          ? body.note.patientVisible
          : true,
    });
  }

  const rec = getCaseLive(caseId);
  return NextResponse.json({
    ok: true,
    caseId,
    cascade: rec?.cascade ?? null,
    providerNotes: rec?.providerNotes ?? [],
    updatedAt: rec?.updatedAt ?? null,
  });
}
