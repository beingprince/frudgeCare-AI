/**
 * lib/intake-receipt.ts
 *
 * Patient intake receipt — a single A4 page the patient can download
 * after they submit the intake form.
 *
 *   ┌─ FrudgeCare AI ──────────────────────────────────┐
 *   │ Patient Intake Form                              │
 *   │ Case FC-C-XXXXXX · Submitted Apr 24, 2026 5:30p  │
 *   ├──────────────────────────────────────────────────┤
 *   │ Patient details                                  │
 *   │ Symptoms                                         │
 *   │ Preferences                                      │
 *   │ AI summary (Tier badge)                          │
 *   ├──────────────────────────────────────────────────┤
 *   │ [QR]  Scan to revisit your case online           │
 *   └──────────────────────────────────────────────────┘
 *
 * Design rules driven by the latest review:
 *   • One page only — never call `addPage`.
 *   • Tight, predictable leading: every text block uses `lineH(fontPt)`
 *     so the y-advance matches what jsPDF actually drew.
 *   • The QR card shows the QR + caption — never the raw URL.
 *   • Footer is intake-specific (not the generic site disclaimer).
 *
 * Variable-length content (AI bullets) is capped so the page always fits.
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { Case, AIPatientProfile } from '@/types';
import { formatPhoneWithCountry } from './country-codes';

// Tokens

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
};

const PAGE = {
  marginX:     16,
  topY:        14,
  bottomGuard: 14, // never write below this many mm from the bottom
  width:       210,
  height:      297,
};

const LH_FACTOR = 1.18;
const PT_TO_MM  = 0.352778;
/**
 * Vertical advance per line at our chosen line-height factor.
 * Use this for ALL text-block y-advance math so the next thing we draw
 * doesn't overlap the previous block.
 */
function lineH(pt: number): number {
  return pt * PT_TO_MM * LH_FACTOR;
}

export type IntakeReceiptVariant = 'patient' | 'front_desk';

interface ReceiptOptions {
  caseData: Case;
  caseUrl?: string;
  /** `front_desk` — labels/footer for staff review copy, not the patient handout. */
  variant?: IntakeReceiptVariant;
}

// Public API

export async function downloadIntakeReceipt(opts: ReceiptOptions): Promise<string> {
  const doc = await buildReceiptDocument(opts);
  const filename = receiptFilename(opts.caseData);
  doc.save(filename);
  return filename;
}

export async function buildIntakeReceiptBlob(opts: ReceiptOptions): Promise<Blob> {
  const doc = await buildReceiptDocument(opts);
  return doc.output('blob');
}

// Composition

async function buildReceiptDocument({
  caseData,
  caseUrl,
  variant = 'patient',
}: ReceiptOptions): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setLineHeightFactor(LH_FACTOR);

  const url =
    caseUrl ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}/patient/status?caseId=${encodeURIComponent(caseData.case_code || caseData.id)}`
      : `https://frudgecare.local/patient/status?caseId=${caseData.case_code || caseData.id}`);

  // 1-page budget: header → strip → patient → symptoms → prefs → AI → QR.
  // Reserve a fixed footer band (8mm) at the very bottom.
  let y = PAGE.topY;
  y = drawHeader(doc, y, variant);
  y = drawCaseStrip(doc, y, caseData);
  y = drawSection(doc, y, 'Patient details',         buildPatientDetailRows(caseData));
  y = drawSection(doc, y, 'Symptoms',                buildSymptomRows(caseData));
  y = drawSection(doc, y, 'Scheduling preferences',  buildPreferenceRows(caseData));
  y = drawAISummary(doc, y, caseData.ai_patient_profile);
  await drawQRFooter(doc, url, caseData, variant);
  drawPageFooter(doc, variant);

  return doc;
}

// Header

function drawHeader(doc: jsPDF, y: number, variant: IntakeReceiptVariant): number {
  // Slim brand stripe
  doc.setFillColor(...COLORS.brandPrimary);
  doc.rect(0, 0, PAGE.width, 4.5, 'F');
  doc.setFillColor(...COLORS.brandAccent);
  doc.rect(0, 4.5, PAGE.width, 0.9, 'F');

  // Brand
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.ink);
  doc.text('FrudgeCare AI', PAGE.marginX, y + 4.5);

  // Document title
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.body);
  const docTitle =
    variant === 'front_desk'
      ? 'Patient intake (front desk review copy)'
      : 'Patient Intake Form';
  doc.text(docTitle, PAGE.marginX, y + 9.5);

  // Outline pill on the right
  const badge = variant === 'front_desk' ? 'REVIEW' : 'INTAKE RECEIPT';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const badgeW = doc.getTextWidth(badge) + 5;
  const badgeH = 5;
  const badgeX = PAGE.width - PAGE.marginX - badgeW;
  const badgeY = y + 1.2;
  doc.setDrawColor(...COLORS.brandPrimary);
  doc.setLineWidth(0.35);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, 'S');
  doc.setTextColor(...COLORS.brandPrimary);
  doc.text(badge, badgeX + 2.5, badgeY + 3.5);

  return y + 13;
}

// Case identity strip

function drawCaseStrip(doc: jsPDF, y: number, c: Case): number {
  const stripH = 10;
  doc.setFillColor(...COLORS.bgBrandSoft);
  doc.roundedRect(PAGE.marginX, y, PAGE.width - PAGE.marginX * 2, stripH, 1.6, 1.6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.brandPrimary);
  doc.text(`Case ${c.case_code || c.id}`, PAGE.marginX + 3.5, y + 4.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Submitted ${formatDateTime(c.created_at)}`, PAGE.marginX + 3.5, y + 8);

  drawPill(
    doc,
    PAGE.width - PAGE.marginX - 3.5,
    y + 5.2,
    humanStatus(c.status as string),
    statusPillTone(c.status as string),
  );

  return y + stripH + 3;
}

// Sections (key-value blocks in two columns)

interface KV { label: string; value: string; wide?: boolean }

const SECTION_GAP = 3;

function drawSection(doc: jsPDF, y: number, title: string, rows: KV[]): number {
  // Drop empty rows so we don't waste vertical space show on screen "—" for
  // every field the patient skipped.
  const populated = rows.filter(r => r.value && r.value.trim().length > 0);
  if (populated.length === 0) return y;

  // Section title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(title.toUpperCase(), PAGE.marginX, y + 2);

  // Hairline under title
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
      // Flush half-rows first.
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

/**
 * Draw a label-on-top, value-below block and return the new y just
 * below the block. Uses lineH() so multi-line values don't overlap
 * whatever's drawn next.
 */
function drawKVBlock(doc: jsPDF, x: number, y: number, width: number, row: KV): number {
  const labelPt = 6.5;
  const valuePt = 9;
  const labelLine = lineH(labelPt);     // ~2.7mm
  const valueLine = lineH(valuePt);     // ~3.7mm

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(labelPt);
  doc.setTextColor(...COLORS.muted);
  doc.text(row.label.toUpperCase(), x, y + labelLine);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(valuePt);
  doc.setTextColor(...COLORS.ink);
  const lines = doc.splitTextToSize(row.value, width);
  const valueTop = y + labelLine + valueLine; // first baseline
  doc.text(lines, x, valueTop);

  // Total block height: label baseline (y+labelLine) + value lines + 1.4mm padding.
  const totalLines = Array.isArray(lines) ? lines.length : 1;
  return y + labelLine + totalLines * valueLine + 1.6;
}

// Section row builders

function buildPatientDetailRows(c: Case): KV[] {
  // DOB and Age are merged into one row so the receipt always shows the
  // computed age right next to the birth date the patient typed.
  const dobLine = c.patient_date_of_birth
    ? c.patient_age != null
      ? `${c.patient_date_of_birth}  ·  age ${c.patient_age}`
      : c.patient_date_of_birth
    : '';

  return [
    { label: 'Name',          value: nz(c.patient_full_name) },
    { label: 'Date of birth', value: dobLine },
    { label: 'Gender',        value: nz(c.patient_gender) },
    { label: 'Phone',         value: formatPhoneWithCountry(c.patient_phone, c.patient_phone_country) },
    { label: 'Email',         value: nz(c.patient_email) },
    { label: 'Relevant history', value: nz(c.patient_history), wide: true },
  ];
}

function buildSymptomRows(c: Case): KV[] {
  return [
    { label: 'Chief complaint',    value: nz(c.symptom_text), wide: true },
    { label: 'Severity',           value: severityDisplay(c) },
    { label: 'Duration',           value: nz(c.duration_text) },
    { label: 'Additional details', value: nz(c.additional_details), wide: true },
  ];
}

function buildPreferenceRows(c: Case): KV[] {
  return [
    { label: 'Preferred timing',   value: timingDisplay(c.preferred_timing) },
    { label: 'Preferred provider', value: c.preferred_provider || '' },
  ];
}

// AI summary block

const AI_BULLET_CAP = 3; // hard cap per group so the page always fits

function drawAISummary(doc: jsPDF, y: number, profile: AIPatientProfile | undefined): number {
  if (!profile) return y;

  // Title row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  doc.text('AI SUMMARY', PAGE.marginX, y + 2);

  doc.setFillColor(...COLORS.brandAccent);
  doc.circle(PAGE.marginX + 22, y + 1.4, 0.7, 'F');

  drawPill(
    doc,
    PAGE.width - PAGE.marginX,
    y + 3.6,
    `Tier ${profile.source_tier} · ${tierLabel(profile.source_tier)}`,
    tierPillTone(profile.source_tier),
  );

  doc.setDrawColor(...COLORS.hairline);
  doc.setLineWidth(0.2);
  doc.line(PAGE.marginX, y + 3, PAGE.width - PAGE.marginX, y + 3);

  let cursor = y + 5;
  const cardX = PAGE.marginX;
  const cardW = PAGE.width - PAGE.marginX * 2;
  const cardStart = cursor;
  const padX = 3;

  // Headline
  if (profile.chief_complaint_short) {
    const pt = 9.5;
    const lh = lineH(pt);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(pt);
    doc.setTextColor(...COLORS.ink);
    const lines = doc.splitTextToSize(profile.chief_complaint_short, cardW - padX * 2);
    cursor += lh; // first baseline
    doc.text(lines, cardX + padX, cursor);
    cursor += (lines.length - 1) * lh + 1.2;
  }

  // Narrative
  if (profile.narrative_summary) {
    const pt = 8.5;
    const lh = lineH(pt);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(pt);
    doc.setTextColor(...COLORS.body);
    const lines = doc.splitTextToSize(profile.narrative_summary, cardW - padX * 2);
    cursor += lh;
    doc.text(lines, cardX + padX, cursor);
    cursor += (lines.length - 1) * lh + 2;
  }

  // Bullet groups
  cursor = drawBulletGroup(doc, cursor, cardW, padX, 'Key clinical signals',
    cap(profile.key_clinical_signals, AI_BULLET_CAP), COLORS.brandPrimary);
  cursor = drawBulletGroup(doc, cursor, cardW, padX, 'Flags for the care team',
    cap(profile.red_flags_for_team, AI_BULLET_CAP), COLORS.danger);
  cursor = drawBulletGroup(doc, cursor, cardW, padX, 'Questions your nurse may ask',
    cap(profile.recommended_questions_for_nurse, AI_BULLET_CAP), COLORS.brandPrimary);

  // Card outline
  doc.setDrawColor(...COLORS.hairline);
  doc.setLineWidth(0.3);
  doc.roundedRect(cardX, cardStart - 1.2, cardW, cursor - cardStart + 2.6, 1.6, 1.6, 'S');

  return cursor + SECTION_GAP + 1;
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
    // Bullet aligned to the first text line.
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

// QR card — anchored to the bottom; shows QR + caption only.

async function drawQRFooter(
  doc: jsPDF,
  url: string,
  c: Case,
  variant: IntakeReceiptVariant,
): Promise<void> {
  const cardH = 32;
  const footerBand = 10; // reserved at the bottom for the footer line
  const cardY = PAGE.height - PAGE.bottomGuard - footerBand - cardH;
  const cardX = PAGE.marginX;
  const cardW = PAGE.width - PAGE.marginX * 2;

  doc.setFillColor(...COLORS.bgCard);
  doc.roundedRect(cardX, cardY, cardW, cardH, 1.6, 1.6, 'F');
  doc.setDrawColor(...COLORS.hairline);
  doc.setLineWidth(0.3);
  doc.roundedRect(cardX, cardY, cardW, cardH, 1.6, 1.6, 'S');

  // QR
  const qrDataUrl = await QRCode.toDataURL(url, {
    margin: 0,
    width: 280,
    color: { dark: '#0F4C81', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
  const qrSize = 24;
  const qrX = cardX + 4;
  const qrY = cardY + (cardH - qrSize) / 2;
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  // Caption (no raw URL, per latest review)
  const textX = qrX + qrSize + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.ink);
  doc.text(
    variant === 'front_desk' ? 'Scan to open case status' : 'Scan to revisit your case',
    textX,
    cardY + 8,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...COLORS.body);
  const caption = doc.splitTextToSize(
    variant === 'front_desk'
      ? 'For front desk verification: this matches the patient intake. Share with the unit as needed. Not a patient handout unless you print for them.'
      : 'This QR opens your live status page so you can check updates anytime. Your nurse and provider see the same information.',
    cardW - qrSize - 14,
  );
  doc.text(caption, textX, cardY + 13);

  // Case code at the bottom-right of the card
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.brandPrimary);
  doc.text(
    `Case ${c.case_code || c.id}`,
    cardX + cardW - 4,
    cardY + cardH - 3.5,
    { align: 'right' },
  );
}

// Footer — intake-receipt-specific (NOT the generic site footer).

function drawPageFooter(doc: jsPDF, variant: IntakeReceiptVariant): void {
  const yFooter = PAGE.height - 7;

  doc.setDrawColor(...COLORS.hairline);
  doc.setLineWidth(0.2);
  doc.line(PAGE.marginX, yFooter - 3, PAGE.width - PAGE.marginX, yFooter - 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...COLORS.brandPrimary);
  doc.text(
    variant === 'front_desk' ? 'Front desk review — intake on file' : 'Patient intake receipt',
    PAGE.marginX,
    yFooter,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...COLORS.muted);
  const generated = `Generated ${new Date().toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: 'numeric', minute: '2-digit',
  })}`;
  doc.text(generated, PAGE.width / 2, yFooter, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.text(
    variant === 'front_desk' ? 'For internal / patient service use' : 'Keep for your records',
    PAGE.width - PAGE.marginX,
    yFooter,
    { align: 'right' },
  );
}

// Helpers

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

function statusPillTone(status: string) {
  switch (status) {
    case 'intake_submitted':
    case 'ai_pretriage_ready':
    case 'submitted':
      return { bg: [241, 245, 249] as const, fg: [51, 65, 85] as const };
    case 'frontdesk_review':
      return { bg: [219, 234, 254] as const, fg: [29, 78, 216] as const };
    case 'nurse_triage_pending':
    case 'nurse_triage_in_progress':
      return { bg: [254, 243, 199] as const, fg: [146, 64, 14] as const };
    case 'nurse_validated':
      return { bg: [220, 252, 231] as const, fg: [22, 101, 52] as const };
    case 'provider_review_pending':
    case 'provider_action_issued':
      return { bg: [224, 231, 255] as const, fg: [55, 48, 163] as const };
    case 'disposition_finalized':
      return { bg: [187, 247, 208] as const, fg: [22, 101, 52] as const };
    default:
      return { bg: [241, 245, 249] as const, fg: [51, 65, 85] as const };
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

function tierLabel(tier: number): string {
  switch (tier) {
    case 1: return 'Grounded AI';
    case 2: return 'Local KB';
    case 3: return 'Safe default';
    default: return 'Unknown';
  }
}

function humanStatus(s: string): string {
  return ({
    intake_submitted:         'Submitted',
    ai_pretriage_ready:       'Triage Ready',
    frontdesk_review:         'Front Desk Review',
    nurse_triage_pending:     'Nurse Pending',
    nurse_triage_in_progress: 'Nurse In Progress',
    nurse_validated:          'Nurse Validated',
    provider_review_pending:  'Provider Review',
    provider_action_issued:   'Decision Issued',
    disposition_finalized:    'Closed',
  } as Record<string, string>)[s] ?? s;
}

function severityDisplay(c: Case): string {
  const hint = (c.severity_hint || '').toString();
  return hint ? hint.charAt(0).toUpperCase() + hint.slice(1) : '';
}

function timingDisplay(t: string | undefined): string {
  switch (t) {
    case 'asap':     return 'As soon as possible';
    case 'today':    return 'Later today';
    case 'flexible': return 'Within the next 3 days';
    default:         return '';
  }
}

function nz(v: string | null | undefined): string {
  return v ? v.toString() : '';
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: 'numeric', minute: '2-digit',
  });
}

function receiptFilename(c: Case): string {
  const code = (c.case_code || c.id || 'case').replace(/[^A-Z0-9-]/gi, '');
  const date = (c.created_at ? new Date(c.created_at) : new Date())
    .toISOString()
    .split('T')[0];
  return `frudgecare-intake-${code}-${date}.pdf`;
}
