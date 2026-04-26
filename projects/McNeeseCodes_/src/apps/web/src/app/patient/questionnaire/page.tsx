"use client";

/**
 * /patient/questionnaire
 *
 * Focused medical-history capture opened from the patient status dashboard
 * ("Complete Medical History" / Start Questionnaire). Uses the same visual
 * primitives as intake; data is local-only until backend hooks exist
 * (sessionStorage flag + JSON data package for future API wiring).
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, HeartPulse, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "fc_questionnaire_payload";
const COMPLETE_KEY = "fc_questionnaire_complete";

const inputClass =
  "w-full min-h-[44px] px-3 py-2.5 border border-slate-300 rounded-[10px] focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] outline-none text-[14px] bg-white";
const textareaClass = cn(inputClass, "min-h-[100px] resize-y h-auto");

interface FormState {
  allergies: string;
  medications: string;
  conditions: string;
  familyHistory: string;
}

const INITIAL: FormState = {
  allergies: "",
  medications: "",
  conditions: "",
  familyHistory: "",
};

export default function PatientQuestionnairePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    form.allergies.trim().length > 0 ||
    form.medications.trim().length > 0 ||
    form.conditions.trim().length > 0 ||
    form.familyHistory.trim().length > 0;

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) {
      setError("Please fill in at least one field before submitting.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...form, savedAt: new Date().toISOString() }),
          );
          sessionStorage.setItem(COMPLETE_KEY, "1");
        } catch {
          // Private mode or quota — still navigate; user completed the flow in-app.
        }
      }
      // Brief beat so the button shows a real loading data.
      await new Promise(r => setTimeout(r, 180));
      router.push("/patient/status?questionnaire=complete");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-slate-900 pb-24 md:pb-10">
      <header className="bg-[var(--card)] border-b border-slate-200/90">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/patient/status"
            className="shrink-0 w-10 h-10 rounded-[10px] border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 fc-focus-ring"
            aria-label="Back to your status"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <p className="fc-eyebrow">Medical history</p>
            <h1 className="text-lg md:text-[22px] font-semibold tracking-tight text-slate-900">
              Complete your questionnaire
            </h1>
            <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">
              Your answers help your care team prepare before your visit.
            </p>
          </div>
        </div>
      </header>

      <form
        id="patient-questionnaire-form"
        onSubmit={e => {
          void handleSubmit(e);
        }}
        className="max-w-2xl mx-auto px-4 pt-4 flex flex-col gap-4"
        noValidate
      >
        {error && (
          <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900">
            {error}
          </div>
        )}

        <section className="fc-card p-4 md:p-5">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-3">
            <HeartPulse className="w-4 h-4 text-[var(--primary)]" aria-hidden />
            <h2 className="fc-section-title">Health background</h2>
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Allergies</span>
              <span className="text-[12px] text-slate-500 -mt-0.5">Medication, food, or environmental</span>
              <textarea
                className={textareaClass}
                value={form.allergies}
                onChange={e => update("allergies", e.target.value)}
                placeholder="e.g. Penicillin — hives; seasonal pollen"
                rows={3}
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Current medications</span>
              <textarea
                className={textareaClass}
                value={form.medications}
                onChange={e => update("medications", e.target.value)}
                placeholder="Name, dose, and how often (or “none”)"
                rows={3}
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Ongoing conditions</span>
              <textarea
                className={textareaClass}
                value={form.conditions}
                onChange={e => update("conditions", e.target.value)}
                placeholder="e.g. Hypertension, diabetes, asthma"
                rows={3}
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Relevant family history (optional)</span>
              <textarea
                className={textareaClass}
                value={form.familyHistory}
                onChange={e => update("familyHistory", e.target.value)}
                placeholder="Conditions that run in your family, if you know"
                rows={2}
                autoComplete="off"
              />
            </label>
          </div>
        </section>

        <div className="fc-card-muted p-3 md:p-4 flex gap-2.5 text-[13px] text-slate-600 leading-snug">
          <ClipboardList className="w-4 h-4 text-[var(--primary)] flex-shrink-0 mt-0.5" />
          <p>
            You can leave fields blank you are unsure about. Add anything that helps the clinician see the full
            picture.
          </p>
        </div>

        <div className="hidden md:flex justify-end gap-3 pt-1 pb-4">
          <Link
            href="/patient/status"
            className="h-11 px-4 rounded-[10px] border border-slate-300 bg-white text-[14px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center fc-focus-ring"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="h-11 px-6 rounded-[10px] bg-[var(--primary)] text-white text-[14px] font-semibold shadow-elevated hover:opacity-95 disabled:opacity-60 flex items-center gap-2 fc-focus-ring"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save and return"
            )}
          </button>
        </div>
      </form>

      {/* Mobile sticky — submits the main form via the `form` attribute */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--card)] border-t border-slate-200 p-3 safe-area-pb z-40 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
        <button
          type="submit"
          form="patient-questionnaire-form"
          disabled={saving}
          className="w-full h-12 rounded-[10px] bg-[var(--primary)] text-white text-[15px] font-bold disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save and return"
          )}
        </button>
      </div>
    </div>
  );
}
