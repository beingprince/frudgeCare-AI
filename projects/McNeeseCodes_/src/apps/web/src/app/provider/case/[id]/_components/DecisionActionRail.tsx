"use client";

import React, { useState } from "react";
import { FilePlus, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { NEXT_ACTION_OPTIONS, type NextAction } from "../_data/decisions";

export type DecisionFormSubmit = {
  nextAction: NextAction;
  encounterNote: string;
  patientUpdate: string | null;
};

/**
 * Decision & action rail — the provider's primary interactive surface.
 *
 * Owns its own local form data. Submits by calling `onSubmit` with a
 * validated data package; the parent page save + transitions.
 *
 * Validation rules:
 *   - `nextAction` must be chosen
 *   - if patient-visible toggle is ON, the message must be non-empty
 * Submit is disabled until valid; we do NOT fail-late.
 */
export function DecisionActionRail({
  onSubmit,
  submitting = false,
}: {
  onSubmit: (payload: DecisionFormSubmit) => void;
  submitting?: boolean;
}) {
  const [nextAction, setNextAction] = useState<NextAction | "">("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [patientVisible, setPatientVisible] = useState(false);
  const [patientMessage, setPatientMessage] = useState("");

  const patientMessageTrim = patientMessage.trim();
  const isValid =
    nextAction !== "" &&
    (!patientVisible || patientMessageTrim.length > 0);

  function handleSubmit() {
    if (!isValid || submitting) return;
    onSubmit({
      nextAction: nextAction as NextAction,
      encounterNote: note.trim(),
      patientUpdate: patientVisible ? patientMessageTrim : null,
    });
  }

  return (
    <div className="fc-card p-5 md:p-6 flex flex-col min-h-full">
      <h2 className="fc-section-title mb-5">Decisions &amp; actions</h2>

      <div className="flex flex-col gap-5 flex-1">
        {/* Next provider action */}
        <div>
          <label htmlFor="next-action" className="fc-eyebrow block mb-1.5">
            Next provider action
            <span className="text-rose-600 ml-0.5" aria-hidden="true">*</span>
          </label>
          <select
            id="next-action"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value as NextAction | "")}
            className={cn(
              "fc-focus-ring w-full h-11 rounded-[8px] border border-slate-300 bg-white",
              "px-3 pr-9 text-[14px] font-medium text-slate-800",
              "focus:border-[var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/20",
              "transition-colors",
            )}
          >
            <option value="" disabled>Select an action…</option>
            {NEXT_ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Add encounter note — toggleable textarea */}
        <div>
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            aria-expanded={noteOpen}
            className={cn(
              "fc-focus-ring w-full inline-flex items-center justify-center gap-2 h-11 rounded-[8px]",
              "border text-[13px] font-semibold transition-colors",
              noteOpen
                ? "border-[var(--primary)] bg-[color:var(--primary)]/[0.03] text-slate-800"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400",
            )}
          >
            <FilePlus className="w-4 h-4 text-slate-500" aria-hidden="true" />
            {noteOpen ? "Hide encounter note" : "Add encounter note"}
          </button>

          <div
            className={cn(
              "grid overflow-hidden transition-all duration-200 ease-out",
              noteOpen
                ? "grid-rows-[1fr] opacity-100 mt-2"
                : "grid-rows-[0fr] opacity-0 mt-0",
            )}
          >
            <div className="min-h-0">
              <textarea
                aria-label="Encounter note (internal)"
                placeholder="Internal clinical note for this encounter…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={cn(
                  "fc-focus-ring w-full min-h-[96px] p-3 resize-y",
                  "rounded-[8px] border border-slate-300 bg-white",
                  "text-[14px] leading-[20px] text-slate-800 placeholder:text-slate-400",
                  "focus:border-[var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/20",
                )}
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-200" />

        {/* Patient-visible update */}
        <div>
          <div className="fc-eyebrow block mb-2">Patient-visible update</div>
          <button
            type="button"
            role="switch"
            aria-checked={patientVisible}
            onClick={() => setPatientVisible((v) => !v)}
            className={cn(
              "fc-focus-ring w-full flex items-center justify-between gap-3",
              "h-11 px-3 rounded-[8px] border bg-white transition-colors",
              patientVisible
                ? "border-[var(--primary)] bg-[color:var(--primary)]/[0.03]"
                : "border-slate-300 hover:bg-slate-50",
            )}
          >
            <span className="text-[13px] font-medium text-slate-800">
              Send update to patient dashboard
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "relative w-9 h-5 rounded-full transition-colors flex-shrink-0",
                patientVisible ? "bg-[var(--primary)]" : "bg-slate-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                  patientVisible ? "translate-x-4" : "translate-x-0",
                )}
              />
            </span>
          </button>

          <div
            className={cn(
              "grid overflow-hidden transition-all duration-200 ease-out",
              patientVisible
                ? "grid-rows-[1fr] opacity-100 mt-2"
                : "grid-rows-[0fr] opacity-0 mt-0",
            )}
          >
            <div className="min-h-0">
              <textarea
                aria-label="Plain-language message for the patient"
                placeholder="Write a plain-language update for the patient…"
                value={patientMessage}
                onChange={(e) => setPatientMessage(e.target.value)}
                className={cn(
                  "fc-focus-ring w-full min-h-[112px] p-3 resize-y",
                  "rounded-[8px] border border-slate-300 bg-white",
                  "text-[14px] leading-[20px] text-slate-800 placeholder:text-slate-400",
                  "focus:border-[var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/20",
                )}
              />
              {patientVisible && patientMessageTrim.length === 0 && (
                <p className="mt-1 text-[11.5px] text-slate-500">
                  A message is required when this toggle is on.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pinned submit */}
      <div className="mt-6 pt-4 border-t border-slate-100 sticky bottom-0 bg-white">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className={cn(
            "fc-focus-ring w-full inline-flex items-center justify-center gap-2 h-12 rounded-[8px]",
            "text-white text-[14px] font-semibold transition-[filter,background-color]",
            isValid && !submitting
              ? "bg-[var(--primary)] shadow-resting hover:brightness-105 active:brightness-95"
              : "bg-slate-300 cursor-not-allowed",
          )}
        >
          {submitting ? "Submitting…" : "Sign & submit"}
          {!submitting && <Send className="w-4 h-4" aria-hidden="true" />}
        </button>
        {!isValid && (
          <p className="mt-2 text-[11.5px] text-slate-500 text-center">
            Select a next action to sign.
          </p>
        )}
      </div>
    </div>
  );
}
