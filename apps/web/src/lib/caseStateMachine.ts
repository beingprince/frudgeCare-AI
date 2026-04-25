/**
 * lib/caseStateMachine.ts
 *
 * Central finite-data machine for FrudgeCare case transitions.
 *
 * Why this module exists:
 *  - Before this file, transitions were scattered across UI pages as optimistic
 *    `setStatus(x)` calls — no single source of truth, and no way to refuse an
 *    invalid move (e.g. jumping straight from intake to provider action).
 *  - The API layer (/api/cases/transition) now calls `canTransition()` before
 *    writing, so a bug in a page can never create an impossible data.
 *
 * Canonical happy-path:
 *   intake_submitted
 *     -> ai_pretriage_ready
 *       -> frontdesk_review
 *         -> nurse_triage_pending
 *           -> nurse_triage_in_progress
 *             -> nurse_validated
 *               -> provider_review_pending
 *                 -> provider_action_issued
 *                   -> disposition_finalized
 */

export type CaseStatus =
  | 'intake_submitted'
  | 'ai_pretriage_ready'
  | 'frontdesk_review'
  | 'nurse_triage_pending'
  | 'nurse_triage_in_progress'
  | 'nurse_validated'
  | 'provider_review_pending'
  | 'provider_action_issued'
  | 'disposition_finalized';

export const VALID_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  intake_submitted:         ['ai_pretriage_ready'],
  ai_pretriage_ready:       ['frontdesk_review'],
  frontdesk_review:         ['nurse_triage_pending'],
  nurse_triage_pending:     ['nurse_triage_in_progress'],
  nurse_triage_in_progress: ['nurse_validated', 'provider_review_pending'],
  nurse_validated:          ['provider_review_pending'],
  provider_review_pending:  ['provider_action_issued'],
  provider_action_issued:   ['disposition_finalized'],
  disposition_finalized:    [],
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
  intake_submitted:         'Submitted',
  ai_pretriage_ready:       'AI Triage Ready',
  frontdesk_review:         'Front Desk Review',
  nurse_triage_pending:     'Awaiting Nurse',
  nurse_triage_in_progress: 'Nurse In Progress',
  nurse_validated:          'Nurse Validated',
  provider_review_pending:  'Awaiting Provider',
  provider_action_issued:   'Decision Issued',
  disposition_finalized:    'Closed',
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatus(current: CaseStatus): CaseStatus | null {
  return VALID_TRANSITIONS[current]?.[0] ?? null;
}
