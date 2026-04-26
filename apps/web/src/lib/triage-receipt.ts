/**
 * lib/triage-receipt.ts
 *
 * Triage assessment receipt — a single A4 page the patient (or judge) can
 * download from the /triage page after the AI engine returns a verdict.
 *
 * Shares the visual primitives of `lib/intake-receipt.ts` (header band,
 * brand stripe, section pattern, AI summary card, footer) so every PDF
 * coming out of FrudgeCare looks like it came from the same system.
 *
 * Pre-handoff context: at /triage we don't have a real Case object yet
 * (the patient hasn't been admitted to the front-desk queue), so this
 * module takes a `TriageReceiptInput` shape that maps directly to the
 * /triage page's local state. Once the user clicks "Send to front desk",
 * the patient downloads the proper intake receipt instead.
 *
 * Design rules (mirrored from intake-receipt.ts):
 *   • One page only — never call `addPage`.
 *   • Tight, predictable leading via `lineH(fontPt)`.
 *   • The QR card shows QR + caption — never the raw URL.
 *   • Footer is triage-specific (not the generic site disclaimer).
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

// ── Tokens ───────────────────────────────────────────────────────────────────
// Kept identical to intake-receipt.ts so both PDFs render with the same
// brand language. Update both files together if the brand stripe ever moves.

const COLORS = {
  brandPrimary: [15, 76, 129] as const,
  brandAccent:  [16, 185, 129] as const,
  ink:          [15, 23, 42]  as const,
  body:         [51, 65, 85]  as const,
  muted:        [100, 116, 139] as const,
  faint:        [148, 163, 184] as const,
  hairline:     [226, 232, 240] as const,
  bgCard:       [248, 250, 252] as const,
  bgBrandSoft:  [239, 246, 255] as const,
  warn:         [180, 83,  9]  as const,
  danger:       [185, 28,  28] as const,
  // Urgency channel — pinned to globals.css `--urgency-*` tokens.
  urgencyHigh:   [198, 40,  40] as const, // #C62828
  urgencyMedium: [230, 81,  0]  as const, // #E65100
  urgencyLow:    [ 46, 125, 50] as const, // #2E7D32
  urgencyCrit:   [153, 27,  27] as const, // #991B1B
};

const PAGE = {
  marginX:     16,
  topY:        14,
  bottomGuard: 14,
  width:       210,
  height:      297,
};

const LH_FACTOR = 1.18;
const PT_TO_MM  = 0.352778;

function lineH(pt: number): number {
  return pt * PT_TO_MM * LH_FACTOR;
}

// ── Public types ─────────────────────────────────────────────────────────────

export type TriageUrgency = 'CRITICAL' | 'URGENT' | 'SEMI-URGENT' | 'NON-URGENT';

export interface TriageReceiptVital {
  field: string;
  value: string | number;
  unit: string;
  status: 'critical' | 'warning' | 'normal' | string;
}

export interface TriageReceiptIcd10 {
  term: string;
  code: string;
  display: string;
}

export interface TriageReceiptInput {
  /** Synthea patient label or "Walk-in 1234" — never empty in the UI. */
  patientName?: string;
  patientAge?: number | null;
  patientSex?: string | null;
  patientHistory?: string;
  ageGroup: string;
  symptomNarrative: string;

  urgency: TriageUrgency;
  urgencyReason: string;
  recommendedRoute: string;
  clinicianBrief?: string;
  summary?: string;

  symptoms: string[];
  risks: string[];
  vitals: TriageReceiptVital[];
  icd10: TriageReceiptIcd10[];
  ragSource?: string;
  ragEvidence?: string;

  confidencePct: number;
  sourceTier?: number;
  llmProvider?: string;
  llmModel?: string;

  generatedAt?: Date;
  /** Optional URL embedded in the QR — e.g. the public /triage demo link. */
  caseUrl?: string;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function downloadTriageReceipt(input: TriageReceiptInput): Promise<string> {
  const doc = await buildTriageReceiptDocument(input);
  const filename = receiptFilename(input);
  doc.save(filename);
  return filename;
}

export async function buildTriageReceiptBlob(input: TriageReceiptInput): Promise<Blob> {
  const doc = await buildTriageReceiptDocument(input);
  return doc.output('blob');
}

// ── Composition ──────────────────────────────────────────────────────────────

async function buildTriageReceiptDocument(input: TriageReceiptInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setLineHeightFactor(LH_FACTOR);

  const url =
    input.caseUrl ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}/triage`
      : 'https://frudgecare.local/triage');

  let y = PAGE.topY;
  y = drawHeader(doc, y, input);
  y = drawIdentityStrip(doc, y, input);
  y = drawSection(doc, y, 'Patient context',     buildPatientRows(input));
  y = drawSection(doc, y, 'Symptom narrative',   buildSymptomRows(input));
  y = drawAIAssessment(doc, y, input);
  y = drawClinicalEvidence(doc, y, input);
  await drawQRFooter(doc, url, input);
  drawPageFooter(doc);

  return doc;
}

// ── Header ───────────────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, y: number, input: TriageReceiptInput): number {
  // Brand stripe (matches intake receipt exactly)
  doc.setFillColor(...COLORS.brandPrimary);
  doc.rect(0, 0, PAGE.width, 4.5, 'F');
  doc.setFillColor(...COLORS.brandAccent);
  doc.rect(0, 4.5, PAGE.width, 0.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.ink);
  doc.text('FrudgeCare AI', PAGE.marginX, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.body);
  doc.text('Triage Assessment Summary', PAGE.marginX, y + 9.5);

  // Urgency-tinted right-side badge
  const badge = `${input.urgency} TRIAGE`;
  const tone = urgencyTone(input.urgency);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const badgeW = doc.getTextWidth(badge) + 5;
  const badgeH = 5;
  const badgeX = PAGE.width - PAGE.marginX - badgeW;
  const badgeY = y + 1.2;
  const [br, bg, bb] = tone.bg;
  doc.setFillColor(br, bg, bb);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, 'F');
  const [fr, fg, fb] = tone.fg;
  doc.setTextColor(fr, fg, fb);
  doc.text(badge, badgeX + 2.5, badgeY + 3.5);

  return y + 13;
}

// ── Identity strip (no case_code yet — show generated timestamp) ─────────────

function drawIdentityStrip(doc: jsPDF, y: number, input: TriageReceiptInput): number {
  const stripH = 10;
  doc.setFillColor(...COLORS.bgBrandSoft);
  doc.roundedRect(PAGE.marginX, y, PAGE.width - PAGE.marginX * 2, stripH, 1.6, 1.6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.brandPrimary);
  const headline = input.patientName?.trim()
    ? `Triage assessment · ${input.patientName.trim()}`
    : 'Triage assessment · pre-intake preview';
  doc.text(headline, PAGE.marginX + 3.5, y + 4.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `Generated ${formatDateTime(input.generatedAt ?? new Date())}`,
    PAGE.marginX + 3.5,
    y + 8,
  );

  drawPill(
    doc,
    PAGE.width - PAGE.marginX - 3.5,
    y + 5.2,
    `Confidence ${Math.max(0, Math.min(100, Math.round(input.confidencePct)))}%`,
    confidencePillTone(input.confidencePct),
  );

  return y + stripH + 3;
}

// ── Sections (key/value, two-column) ─────────────────────────────────────────

interface KV { label: string; value: string; wide?: boolean }
const SECTION_GAP = 3;

function drawSection(doc: jsPDF, y: number, title: string, rows: KV[]): number {
  const populated = rows.filter(r => r.value && r.value.trim().length > 0);
  if (populated.length === 0) return y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(title.toUpperCase(), PAGE.marginX, y + 2);

  doc.setDrawColor(...COLORS.hairline);
  doc.setLineWidth(0.2);
  doc.line(PAGE.marginX, y + 3, PAGE.width - PAGE.marginX, y + 3);
  let cursor = y + 5;

  const colW   = (PAGE.width - PAGE.marginX * 2 - 4) / 2;
  let yLeft  = cursor;
  let yRight = cursor;
  let col: 0 | 1 = 0;

  populated.forEach((row) => {
    if (row.wide) {
      const synced = Math.max(yLeft, yRight);
      const next = drawKVBlock(doc, PAGE.marginX, synced, PAGE.width - PAGE.marginX * 2, row);
      yLeft = next;
      yRight = next;
      col = 0;
    } else if (col === 0) {
      yLeft = drawKVBlock(doc, PAGE.marginX, yLeft, colW, row);
      col = 1;
    } else {
      yRight = drawKVBlock(doc, PAGE.marginX + colW + 4, yRight, colW, row);
      col = 0;
    }
  });

  return Math.max(yLeft, yRight) + SECTION_GAP;
}

function drawKVBlock(doc: jsPDF, x: number, y: number, width: number, row: KV): number {
  const labelPt = 6.5;
  const valuePt = 9;
  const labelLine = lineH(labelPt);
  const valueLine = lineH(valuePt);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(labelPt);
  doc.setTextColor(...COLORS.muted);
  doc.text(row.label.toUpperCase(), x, y + labelLine);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(valuePt);
  doc.setTextColor(...COLORS.ink);
  const lines = doc.splitTextToSize(row.value, width);
  const valueTop = y + labelLine + valueLine;
  doc.text(lines, x, valueTop);

  const totalLines = Array.isArray(lines) ? lines.length : 1;
  return y + labelLine + totalLines * valueLine + 1.6;
}

function buildPatientRows(input: TriageReceiptInput): KV[] {
  const ageBits: string[] = [];
  if (input.patientAge != null) ageBits.push(`${input.patientAge}`);
  if (input.patientSex) ageBits.push(input.patientSex);
  if (input.ageGroup) ageBits.push(input.ageGroup);
  return [
    { label: 'Identity',       value: input.patientName?.trim() || 'Anonymous walk-in' },
    { label: 'Age / sex / band', value: ageBits.join(' · ') },
    { label: 'Relevant history', value: (input.patientHistory ?? '').trim(), wide: true },
  ];
}

function buildSymptomRows(input: TriageReceiptInput): KV[] {
  const symptomChips = (input.symptoms ?? []).slice(0, 8).join(', ');
  const riskChips = (input.risks ?? []).slice(0, 6).join(', ');
  return [
    { label: 'Narrative',          value: input.symptomNarrative.trim(), wide: true },
    { label: 'Extracted symptoms', value: symptomChips, wide: true },
    { label: 'Red-flag indicators', value: riskChips, wide: true },
  ];
}

// ── AI assessment block (the heart of the receipt) ──────────────────────────

const AI_BULLET_CAP = 4;

function drawAIAssessment(doc: jsPDF, y: number, input: TriageReceiptInput): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  doc.text('AI ASSESSMENT', PAGE.marginX, y + 2);

  // Tier pill on the right
  if (input.sourceTier) {
    drawPill(
      doc,
      PAGE.width - PAGE.marginX,
      y + 3.6,
      `Tier ${input.sourceTier} · ${tierLabel(input.sourceTier)}`,
      tierPillTone(input.sourceTier),
    );
  }

  doc.setDrawColor(...COLORS.hairline);
  doc.setLineWidth(0.2);
  doc.line(PAGE.marginX, y + 3, PAGE.width - PAGE.marginX, y + 3);

  let cursor = y + 5;
  const cardX = PAGE.marginX;
  const cardW = PAGE.width - PAGE.marginX * 2;
  const cardStart = cursor;
  const padX = 3;

  // Urgency line — colored swatch + label
  const tone = urgencyTone(input.urgency);
  const swatchSize = 4.5;
  const swatchY = cursor + lineH(10) - swatchSize + 0.4;
  const [sr, sg, sb] = tone.bg;
  doc.setFillColor(sr, sg, sb);
  doc.roundedRect(cardX + padX, swatchY, swatchSize, swatchSize, 1, 1, 'F');

  const headlinePt = 11;
  const headlineLH = lineH(headlinePt);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(headlinePt);
  doc.setTextColor(...COLORS.ink);
  cursor += headlineLH;
  doc.text(`${input.urgency} — ${urgencyHumanHeadline(input.urgency)}`, cardX + padX + swatchSize + 2, cursor);
  cursor += 1.2;

  // Reason
  if (input.urgencyReason) {
    const pt = 8.5;
    const lh = lineH(pt);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(pt);
    doc.setTextColor(...COLORS.body);
    const lines = doc.splitTextToSize(input.urgencyReason, cardW - padX * 2);
    cursor += lh;
    doc.text(lines, cardX + padX, cursor);
    cursor += (lines.length - 1) * lh + 2;
  }

  // Recommended next step
  if (input.recommendedRoute) {
    cursor = drawLabelledLine(doc, cursor, cardW, padX, 'Recommended next step', input.recommendedRoute);
  }

  // Clinician brief (if present and distinct from urgency reason)
  if (input.clinicianBrief && input.clinicianBrief !== input.urgencyReason) {
    cursor = drawLabelledLine(doc, cursor, cardW, padX, 'Clinician brief', input.clinicianBrief);
  }

  // Bullet groups
  cursor = drawBulletGroup(doc, cursor, cardW, padX, 'Symptoms parsed by AI',
    cap(input.symptoms, AI_BULLET_CAP), COLORS.brandPrimary);
  cursor = drawBulletGroup(doc, cursor, cardW, padX, 'Red-flag indicators',
    cap(input.risks, AI_BULLET_CAP), COLORS.danger);

  // Provider attribution footer line
  if (input.llmProvider) {
    const pt = 7.5;
    const lh = lineH(pt);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(pt);
    doc.setTextColor(...COLORS.muted);
    cursor += lh;
    const text =
      input.llmProvider === 'deterministic'
        ? 'Generated from local clinical knowledge base — no live LLM was called for this verdict.'
        : `Generated with ${input.llmProvider}${input.llmModel ? ` ${input.llmModel}` : ''}, grounded by local clinical KB.`;
    doc.text(text, cardX + padX, cursor);
    cursor += 1;
  }

  // Card outline
  doc.setDrawColor(...COLORS.hairline);
  doc.setLineWidth(0.3);
  doc.roundedRect(cardX, cardStart - 1.2, cardW, cursor - cardStart + 2.6, 1.6, 1.6, 'S');

  return cursor + SECTION_GAP + 1;
}

function drawLabelledLine(
  doc: jsPDF,
  y: number,
  cardW: number,
  padX: number,
  label: string,
  value: string,
): number {
  const labelPt = 7;
  const valuePt = 9;
  const labelLH = lineH(labelPt);
  const valueLH = lineH(valuePt);
  let cursor = y + labelLH;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(labelPt);
  doc.setTextColor(...COLORS.muted);
  doc.text(label.toUpperCase(), PAGE.marginX + padX, cursor);
  cursor += 0.6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(valuePt);
  doc.setTextColor(...COLORS.ink);
  const lines = doc.splitTextToSize(value, cardW - padX * 2);
  cursor += valueLH;
  doc.text(lines, PAGE.marginX + padX, cursor);
  cursor += (Array.isArray(lines) ? lines.length - 1 : 0) * valueLH + 1.6;
  return cursor;
}

function drawBulletGroup(
  doc: jsPDF,
  y: number,
  cardW: number,
  padX: number,
  title: string,
  items: string[] | undefined,
  bulletColor: readonly [number, number, number],
): number {
  if (!items || items.length === 0) return y;

  const titlePt = 7;
  const itemPt  = 8.5;
  const titleLH = lineH(titlePt);
  const itemLH  = lineH(itemPt);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titlePt);
  doc.setTextColor(...COLORS.muted);
  let cursor = y + titleLH + 0.5;
  doc.text(title.toUpperCase(), PAGE.marginX + padX, cursor);
  cursor += 0.6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(itemPt);
  doc.setTextColor(...COLORS.body);

  items.forEach((item) => {
    const wrapped = doc.splitTextToSize(item, cardW - padX * 2 - 4.5);
    const lineCount = Array.isArray(wrapped) ? wrapped.length : 1;
    const baseline = cursor + itemLH;
    const [br, bg, bb] = bulletColor;
    doc.setFillColor(br, bg, bb);
    doc.circle(PAGE.marginX + padX + 1.4, baseline - itemLH * 0.35, 0.7, 'F');
    doc.text(wrapped, PAGE.marginX + padX + 4, baseline);
    cursor += lineCount * itemLH + 0.4;
  });

  return cursor;
}

function cap<T>(arr: T[] | undefined, n: number): T[] {
  return Array.isArray(arr) ? arr.slice(0, n) : [];
}

// ── Clinical evidence (RAG + ICD-10) ─────────────────────────────────────────

function drawClinicalEvidence(doc: jsPDF, y: number, input: TriageReceiptInput): number {
  if (!input.ragEvidence && (input.icd10 ?? []).length === 0 && input.vitals.length === 0) {
    return y;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  doc.text('CLINICAL EVIDENCE', PAGE.marginX, y + 2);
  doc.setDrawColor(...COLORS.hairline);
  doc.setLineWidth(0.2);
  doc.line(PAGE.marginX, y + 3, PAGE.width - PAGE.marginX, y + 3);

  let cursor = y + 5;
  const cardW = PAGE.width - PAGE.marginX * 2;
  const padX = 3;

  // Vitals strip — single line of "field value unit (status)" entries
  if (input.vitals.length > 0) {
    const pt = 8.5;
    const lh = lineH(pt);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    cursor += lineH(7);
    doc.text('VITALS EXTRACTED', PAGE.marginX + padX, cursor);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(pt);
    doc.setTextColor(...COLORS.ink);
    const text = input.vitals
      .slice(0, 8)
      .map(v => `${v.field} ${v.value}${v.unit}${v.status !== 'normal' ? ` (${v.status})` : ''}`)
      .join('  ·  ');
    cursor += lh;
    const wrapped = doc.splitTextToSize(text, cardW - padX * 2);
    doc.text(wrapped, PAGE.marginX + padX, cursor);
    cursor += (Array.isArray(wrapped) ? wrapped.length - 1 : 0) * lh + 2;
  }

  // RAG evidence
  if (input.ragEvidence) {
    cursor = drawLabelledLine(
      doc,
      cursor,
      cardW,
      padX,
      input.ragSource ? `Matched guideline · ${input.ragSource}` : 'Matched guideline',
      input.ragEvidence,
    );
  }

  // ICD-10 codes — joined inline
  if (input.icd10.length > 0) {
    const codes = input.icd10
      .slice(0, 8)
      .map(t => `${t.code} ${t.display}`)
      .join('  ·  ');
    cursor = drawLabelledLine(doc, cursor, cardW, padX, 'ICD-10 candidate codes', codes);
  }

  return cursor + SECTION_GAP;
}

// ── QR card (anchored to bottom — same geometry as intake receipt) ───────────

async function drawQRFooter(doc: jsPDF, url: string, input: TriageReceiptInput): Promise<void> {
  const cardH = 26;
  const footerBand = 10;
  const cardY = PAGE.height - PAGE.bottomGuard - footerBand - cardH;
  const cardX = PAGE.marginX;
  const cardW = PAGE.width - PAGE.marginX * 2;

  doc.setFillColor(...COLORS.bgCard);
  doc.roundedRect(cardX, cardY, cardW, cardH, 1.6, 1.6, 'F');
  doc.setDrawColor(...COLORS.hairline);
  doc.setLineWidth(0.3);
  doc.roundedRect(cardX, cardY, cardW, cardH, 1.6, 1.6, 'S');

  const qrDataUrl = await QRCode.toDataURL(url, {
    margin: 0,
    width: 240,
    color: { dark: '#0F4C81', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
  const qrSize = 20;
  const qrX = cardX + 4;
  const qrY = cardY + (cardH - qrSize) / 2;
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  const textX = qrX + qrSize + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.ink);
  doc.text('Scan to revisit the triage demo', textX, cardY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...COLORS.body);
  const caption = doc.splitTextToSize(
    'This is a triage assessment summary, not a medical record. Once the case is sent to the front desk you will receive an intake receipt with your case code.',
    cardW - qrSize - 14,
  );
  doc.text(caption, textX, cardY + 12);

  // Mode tag at bottom-right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.brandPrimary);
  const modeTag = input.llmProvider && input.llmProvider !== 'deterministic'
    ? `${input.llmProvider}${input.llmModel ? ` · ${input.llmModel}` : ''}`
    : 'KB · deterministic';
  doc.text(modeTag, cardX + cardW - 4, cardY + cardH - 3.5, { align: 'right' });
}

// ── Footer ───────────────────────────────────────────────────────────────────

function drawPageFooter(doc: jsPDF): void {
  const yFooter = PAGE.height - 7;

  doc.setDrawColor(...COLORS.hairline);
  doc.setLineWidth(0.2);
  doc.line(PAGE.marginX, yFooter - 3, PAGE.width - PAGE.marginX, yFooter - 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...COLORS.brandPrimary);
  doc.text('Triage assessment · clinical decision support only', PAGE.marginX, yFooter);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...COLORS.muted);
  const generated = `Generated ${new Date().toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: 'numeric', minute: '2-digit',
  })}`;
  doc.text(generated, PAGE.width / 2, yFooter, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.text('Not a medical record', PAGE.width - PAGE.marginX, yFooter, { align: 'right' });
}

// ── Tone helpers ─────────────────────────────────────────────────────────────

function drawPill(
  doc: jsPDF,
  rightX: number,
  baselineY: number,
  text: string,
  tone: { bg: readonly [number, number, number]; fg: readonly [number, number, number] },
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const w = doc.getTextWidth(text) + 4;
  const h = 4.6;
  const x = rightX - w;
  const yTop = baselineY - h + 1.2;

  const [br, bg, bb] = tone.bg;
  doc.setFillColor(br, bg, bb);
  doc.roundedRect(x, yTop, w, h, 1.2, 1.2, 'F');

  const [fr, fg, fb] = tone.fg;
  doc.setTextColor(fr, fg, fb);
  doc.text(text, x + 2, yTop + h - 1.4);
}

function urgencyTone(u: TriageUrgency): { bg: readonly [number, number, number]; fg: readonly [number, number, number] } {
  switch (u) {
    case 'CRITICAL':    return { bg: COLORS.urgencyCrit,   fg: [255, 255, 255] as const };
    case 'URGENT':      return { bg: COLORS.urgencyHigh,   fg: [255, 255, 255] as const };
    case 'SEMI-URGENT': return { bg: COLORS.urgencyMedium, fg: [255, 255, 255] as const };
    case 'NON-URGENT':  return { bg: COLORS.urgencyLow,    fg: [255, 255, 255] as const };
  }
}

function tierPillTone(tier: number) {
  switch (tier) {
    case 1: return { bg: [220, 252, 231] as const, fg: [22, 101, 52] as const };
    case 2: return { bg: [224, 231, 255] as const, fg: [55, 48, 163] as const };
    case 3: return { bg: [254, 243, 199] as const, fg: [146, 64, 14] as const };
    default: return { bg: [241, 245, 249] as const, fg: [51, 65, 85] as const };
  }
}

function confidencePillTone(pct: number) {
  if (pct >= 75) return { bg: [220, 252, 231] as const, fg: [22, 101, 52] as const };
  if (pct >= 50) return { bg: [224, 231, 255] as const, fg: [55, 48, 163] as const };
  return { bg: [254, 243, 199] as const, fg: [146, 64, 14] as const };
}

function tierLabel(tier: number): string {
  switch (tier) {
    case 1: return 'Grounded AI';
    case 2: return 'Local KB';
    case 3: return 'Safe default';
    default: return 'Unknown';
  }
}

function urgencyHumanHeadline(u: TriageUrgency): string {
  switch (u) {
    case 'CRITICAL':    return 'Emergency care now';
    case 'URGENT':      return 'Urgent care within an hour';
    case 'SEMI-URGENT': return 'Same-day clinic visit';
    case 'NON-URGENT':  return 'Routine primary care follow-up';
  }
}

function formatDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: 'numeric', minute: '2-digit',
  });
}

function receiptFilename(input: TriageReceiptInput): string {
  const tag = input.urgency.replace(/[^A-Z0-9]/g, '');
  const date = (input.generatedAt ?? new Date()).toISOString().split('T')[0];
  return `frudgecare-triage-${tag}-${date}.pdf`;
}
