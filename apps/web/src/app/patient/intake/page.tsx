"use client";

/**
 * /patient/intake
 *
 * Two-step intake form:
 *   Step 1 — Your details   (basics + symptoms + preferences)
 *   Step 2 — Review & submit
 *
 * The final step POSTs to /api/ai/analyze-intake, creates a case via
 * /api/cases/create with the triage result, and forwards the patient to
 * /patient/status with the new case id + urgency so the status page can
 * show a triage banner immediately.
 *
 * The original 4-step flow was collapsed into 2 steps because none of the
 * individual groups had enough content to justify a full page, and patients
 * routinely abandon long click-through wizards. Section anchors replace
 * the old per-step pages.
 */

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, ArrowLeft, HeartPulse, AlignLeft, Calendar as CalendarIcon,
  Check, Save, Loader2, AlertCircle, User, ClipboardList, Lock, Eye, EyeOff,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COUNTRY_CODES, DEFAULT_COUNTRY_ISO, findCountry, formatPhoneWithCountry,
} from "@/lib/country-codes";

const STEPS = ["Your details", "Review & submit"] as const;

const GENDER_OPTIONS = [
  "Female",
  "Male",
  "Non-binary",
  "Prefer not to say",
  "Other",
] as const;
type Gender = typeof GENDER_OPTIONS[number] | "";

interface IntakeFormState {
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  phoneCountryIso: string;
  phone: string;
  email: string;
  // Account creation. The intake form doubles as a sign-up: submitting
  // creates a `patient_profiles` row with a bcrypt-hashed password, so
  // the patient can log back in later via /login/patient.
  password: string;
  passwordConfirm: string;
  chiefComplaint: string;
  severity: number;
  duration: string;
  additionalDetails: string;
  preferredTiming: "asap" | "today" | "flexible";
  preferredProvider: string;
  medicalHistory: string;
}

const MIN_PASSWORD_LENGTH = 8;

function passwordIssue(pw: string, confirm: string): string | null {
  if (!pw) return "Choose a password to protect your account.";
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirm && pw !== confirm) return "Passwords don't match.";
  return null;
}

// The form starts empty so the patient (or a front-desk staffer typing on
// their behalf) is never left thinking pre-filled placeholder data was
// actually submitted. Every field below is captured verbatim and forwarded
// to /api/ai/analyze-intake, /api/ai/build-patient-profile, and
// /api/cases/create — so what the patient enters is what /patient/status
// show on screen back.
const INITIAL_STATE: IntakeFormState = {
  fullName: "",
  dateOfBirth: "",
  gender: "",
  phoneCountryIso: DEFAULT_COUNTRY_ISO,
  phone: "",
  email: "",
  password: "",
  passwordConfirm: "",
  chiefComplaint: "",
  severity: 5,
  duration: "",
  additionalDetails: "",
  preferredTiming: "asap",
  preferredProvider: "",
  medicalHistory: "",
};

function computeAge(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * Lightweight phone validation. We don't need full E.164 parsing —
 * just enough digits to be a real number, and no obviously bogus chars.
 * Real production would use libphonenumber; this keeps the bundle small.
 */
function isValidNationalPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function isValidEmailOptional(raw: string): boolean {
  if (!raw.trim()) return true; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export default function PatientIntake() {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<IntakeFormState>(INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const update = <K extends keyof IntakeFormState>(field: K, value: IntakeFormState[K]) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const severityHint = (s: number): "mild" | "moderate" | "severe" =>
    s <= 3 ? "mild" : s <= 7 ? "moderate" : "severe";

  // ── Calculated intake values used in multiple places ────────────────
  const age = useMemo(() => computeAge(formData.dateOfBirth), [formData.dateOfBirth]);
  const country = useMemo(
    () => findCountry(formData.phoneCountryIso),
    [formData.phoneCountryIso],
  );
  const phoneIsValid    = isValidNationalPhone(formData.phone);
  const emailIsValid    = isValidEmailOptional(formData.email);
  const fullPhoneForApi = formatPhoneWithCountry(formData.phone, formData.phoneCountryIso);
  const passwordError   = passwordIssue(formData.password, formData.passwordConfirm);

  // Step 1 gating — every required field must be filled.
  // Phone is now required (national-format-valid). Email is optional but,
  // if entered, must look like an email. Password protects the account
  // that gets created on submit.
  const canContinueFromStep1 =
    formData.fullName.trim().length > 0 &&
    formData.dateOfBirth.trim().length > 0 &&
    age !== null &&
    formData.gender !== "" &&
    phoneIsValid &&
    emailIsValid &&
    passwordError === null &&
    formData.password === formData.passwordConfirm &&
    formData.chiefComplaint.trim().length > 0;

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 0) Create the patient account first. Doing this BEFORE any AI
      //    calls means a duplicate-account error shows up immediately
      //    without burning Gemini quota or producing an orphan case.
      //    The response sets fc_session, so the subsequent
      //    /api/cases/create call will auto-bind the case to this profile.
      const regRes = await fetch("/api/patient/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: formData.fullName,
          date_of_birth: formData.dateOfBirth,
          gender: formData.gender,
          phone: fullPhoneForApi,
          phone_country: formData.phoneCountryIso,
          email: formData.email,
          password: formData.password,
        }),
      });
      const reg = await regRes.json();
      if (!regRes.ok || !reg.success) {
        // 409 (duplicate) returns a friendly message + redirect path.
        if (regRes.status === 409 && reg.redirect) {
          setSubmitError(
            reg.message ||
              "An account with that contact already exists. Please sign in.",
          );
          setIsSubmitting(false);
          return;
        }
        throw new Error(reg.error || "Could not create your account.");
      }
      const patientProfileId: string = reg.patient_profile_id;

      // 1) Pre-triage (urgency + clinician brief).
      const aiRes = await fetch("/api/ai/analyze-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: `${formData.chiefComplaint}. ${formData.additionalDetails}`.trim(),
          duration: formData.duration || "Not specified",
          severity: `${formData.severity}/10 (${severityHint(formData.severity)})`,
          patient_history: formData.medicalHistory ?? "",
        }),
      });

      if (!aiRes.ok) throw new Error("Triage service unavailable");
      const ai = await aiRes.json();

      // 2) LLM patient-profile builder (Gemini → templated cascade).
      //    This is what turns the raw form into the narrative the
      //    /patient/status page and the care team see. We don't fail the
      //    whole submission if the profile call returns a backup option —
      //    the proxy already degrades to a Tier 3 profile.
      let aiProfile: Record<string, unknown> | null = null;
      try {
        const profileRes = await fetch("/api/ai/build-patient-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: formData.fullName,
            date_of_birth: formData.dateOfBirth,
            age,
            gender: formData.gender,
            phone: fullPhoneForApi,
            email: formData.email,
            chief_complaint: formData.chiefComplaint,
            severity: `${formData.severity}/10 (${severityHint(formData.severity)})`,
            duration: formData.duration,
            additional_details: formData.additionalDetails,
            medical_history: formData.medicalHistory,
            preferred_timing: formData.preferredTiming,
            preferred_provider: formData.preferredProvider,
            pretriage_urgency: ai.urgency,
            pretriage_summary: ai.summary,
            pretriage_risks: ai.risks ?? [],
            pretriage_clinician_brief: ai.clinician_brief,
          }),
        });
        if (profileRes.ok) {
          aiProfile = await profileRes.json();
        }
      } catch (profileErr) {
        console.warn("Profile builder unreachable, proceeding without it:", profileErr);
      }

      // 3) Save the case with everything the patient typed AND the AI
      //    artifacts. /patient/status will GET this back by id and show on screen
      //    the real data instead of placeholder copy.
      //    `patient_profile_id` makes the case retrievable later by the
      //    same patient through /api/patient/me/cases. The server will
      //    also auto-bind it from the session cookie set by /register,
      //    so this is belt-and-braces.
      const casePayload = {
        patient_profile_id: patientProfileId,
        status: "ai_pretriage_ready",
        urgency_suggested: ai.urgency,
        urgency_final: ai.urgency,
        urgency_reason: ai.reasoning,
        structured_summary: ai.summary,
        risky_flags: ai.risks ?? [],
        symptom_text: formData.chiefComplaint,
        duration_text: formData.duration,
        severity_hint: severityHint(formData.severity),
        source_channel: "intake_form",
        ai_clinician_brief: ai.clinician_brief,

        // Captured intake fields — surfaced verbatim on /patient/status.
        patient_full_name: formData.fullName,
        patient_date_of_birth: formData.dateOfBirth,
        patient_age: age,
        patient_gender: formData.gender,
        patient_phone: fullPhoneForApi,
        patient_phone_country: formData.phoneCountryIso,
        patient_email: formData.email,
        additional_details: formData.additionalDetails,
        preferred_timing: formData.preferredTiming,
        preferred_provider: formData.preferredProvider,
        patient_history: formData.medicalHistory,

        // The Gemini-built patient profile (or templated backup option).
        ai_patient_profile: aiProfile,

        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const caseRes = await fetch("/api/cases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(casePayload),
      });

      if (!caseRes.ok) throw new Error("Failed to create case record");
      const { caseId } = await caseRes.json();

      const tierParam = ai.source_tier ? `&tier=${encodeURIComponent(ai.source_tier)}` : "";
      router.push(
        `/patient/status?caseId=${encodeURIComponent(caseId)}&urgency=${encodeURIComponent(ai.urgency)}${tierParam}`
      );
    } catch (err) {
      console.error("Intake submission error:", err);
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  const handleContinue = () => {
    if (currentStep === 2) {
      void handleFinalSubmit();
      return;
    }
    setCurrentStep(2);
  };

  // ── Loading overlay while triage is running ──
  if (isSubmitting) {
    return (
      <div className="bg-[#F1F5F9] min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-[20px] shadow-xl border border-slate-200 p-8 max-w-md w-full flex flex-col items-center text-center gap-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-[#0F4C81]/10 border border-[#0F4C81]/20 flex items-center justify-center">
              <HeartPulse className="w-8 h-8 text-[#0F4C81]" />
            </div>
            <Loader2 className="w-20 h-20 text-[#0F4C81]/40 animate-spin absolute -top-2 -left-2" strokeWidth={1} />
          </div>
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900 mb-1">
              Reviewing your symptoms
            </h2>
            <p className="text-[14px] text-slate-500">
              Our triage system is assessing urgency and preparing a brief for the care team.
              This usually takes about 5 seconds.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0F4C81] animate-pulse" />
            A clinician validates every result
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#F1F5F9] min-h-screen text-slate-900 flex flex-col relative pb-[80px] md:pb-0">
      {/* ── Top progress stepper (2 steps) ── */}
      <div className="sticky top-0 z-50 h-[52px] bg-white border-b border-slate-200 flex items-center justify-center px-4 shadow-sm flex-shrink-0">
        <div className="max-w-[760px] w-full flex items-center justify-center gap-6">
          {STEPS.map((stepName, i) => {
            const stepNum = (i + 1) as 1 | 2;
            const isActive = stepNum === currentStep;
            const isPast = stepNum < currentStep;
            return (
              <React.Fragment key={i}>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-colors",
                      isActive ? "bg-[#0F4C81] text-white" :
                      isPast ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-400 border border-slate-200",
                    )}
                  >
                    {isPast ? <Check className="w-4 h-4" /> : stepNum}
                  </div>
                  <span
                    className={cn(
                      "text-[13px] font-semibold",
                      isActive ? "text-[#0F4C81]" : isPast ? "text-teal-600" : "text-slate-400",
                    )}
                  >
                    {stepName}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "h-[2px] w-12 md:w-24",
                      isPast ? "bg-teal-500" : "bg-slate-200",
                    )}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="flex-1 w-full max-w-[760px] mx-auto px-4 md:px-0 pt-5 md:pt-8 pb-6 flex flex-col">
        {submitError && (
          <div className="w-full mb-4 p-4 rounded-[12px] bg-red-50 border border-red-200 flex items-start gap-3 text-red-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-[13px]">
              <p className="font-semibold">Submission failed</p>
              <p className="opacity-80">{submitError}</p>
            </div>
          </div>
        )}

        {/* ─────────────────────────  STEP 1  ─────────────────────────
            "Your details" — one scrollable page with 3 anchored sections.
            Anchored section headers let patients skim or jump by section
            without a 4-page carousel. */}
        {currentStep === 1 && (
          <div className="w-full flex flex-col gap-6 animate-in fade-in duration-200">
            <div className="text-center mb-2">
              <h1 className="text-[24px] font-bold text-slate-900 mb-2">Tell us about your visit</h1>
              <p className="text-slate-600 text-[14px]">
                Fill this in once. We&apos;ll prepare a brief for the care team on the next step.
              </p>
            </div>

            {/* Section 1 — About you */}
            <Section icon={<User className="w-4 h-4 text-[#0F4C81]" />} title="About you">
              <Field label="Full name" required>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={e => update("fullName", e.target.value)}
                  placeholder="Your legal name"
                  className={inputClass}
                  autoComplete="name"
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Date of birth"
                  required
                  hint={
                    age !== null
                      ? `You are ${age} year${age === 1 ? "" : "s"} old.`
                      : undefined
                  }
                >
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={e => update("dateOfBirth", e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className={inputClass}
                    autoComplete="bday"
                  />
                </Field>

                <Field label="Gender" required>
                  <select
                    value={formData.gender}
                    onChange={e => update("gender", e.target.value as Gender)}
                    className={cn(inputClass, "bg-white appearance-none")}
                  >
                    <option value="" disabled>Select your gender</option>
                    {GENDER_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field
                label="Contact number"
                required
                hint={
                  formData.phone && !phoneIsValid
                    ? "Enter a valid number (7–15 digits)."
                    : "We'll text you with case updates."
                }
              >
                <div className="flex gap-2">
                  <select
                    value={formData.phoneCountryIso}
                    onChange={e => update("phoneCountryIso", e.target.value)}
                    aria-label="Country dial code"
                    className={cn(
                      "h-[44px] px-2.5 border border-slate-300 rounded-[10px]",
                      "focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] outline-none",
                      "text-[14px] bg-white appearance-none w-[140px] flex-shrink-0",
                    )}
                  >
                    {COUNTRY_CODES.map(c => (
                      <option key={c.iso} value={c.iso}>
                        {c.flag} {c.iso} {c.dial}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={formData.phone}
                    onChange={e => update("phone", e.target.value)}
                    placeholder={country.iso === "US" ? "(555) 123-4567" : "Phone number"}
                    aria-invalid={Boolean(formData.phone) && !phoneIsValid}
                    className={cn(
                      inputClass,
                      "flex-1",
                      formData.phone && !phoneIsValid && "border-red-300 focus:border-red-500 focus:ring-red-500",
                    )}
                    autoComplete="tel-national"
                  />
                </div>
                {formData.phone && phoneIsValid && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Saved as <span className="font-mono">{fullPhoneForApi}</span>
                  </p>
                )}
              </Field>

              <Field
                label="Email (optional)"
                hint={
                  formData.email && !emailIsValid
                    ? "That doesn't look like a valid email."
                    : "We'll send you a copy of your intake receipt."
                }
              >
                <input
                  type="email"
                  inputMode="email"
                  value={formData.email}
                  onChange={e => update("email", e.target.value)}
                  placeholder="you@example.com"
                  aria-invalid={Boolean(formData.email) && !emailIsValid}
                  className={cn(
                    inputClass,
                    formData.email && !emailIsValid && "border-red-300 focus:border-red-500 focus:ring-red-500",
                  )}
                  autoComplete="email"
                />
              </Field>
            </Section>

            {/* Section 1b — Account password (creates the account on submit) */}
            <Section
              icon={<ShieldCheck className="w-4 h-4 text-[#0F4C81]" />}
              title="Secure your account"
              subtitle="So you can sign back in later to view your case status and clinical updates."
            >
              <Field
                label="Password"
                required
                hint={
                  formData.password
                    ? passwordError ?? `Looks good — at least ${MIN_PASSWORD_LENGTH} characters.`
                    : `At least ${MIN_PASSWORD_LENGTH} characters. Use something only you know.`
                }
              >
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={e => update("password", e.target.value)}
                    placeholder="Choose a password"
                    aria-invalid={
                      Boolean(formData.password) && passwordError !== null
                    }
                    className={cn(
                      inputClass,
                      "pl-9 pr-10",
                      formData.password &&
                        passwordError &&
                        "border-red-300 focus:border-red-500 focus:ring-red-500",
                    )}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <Field
                label="Confirm password"
                required
                hint={
                  formData.passwordConfirm &&
                  formData.password !== formData.passwordConfirm
                    ? "Passwords don't match yet."
                    : undefined
                }
              >
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.passwordConfirm}
                    onChange={e => update("passwordConfirm", e.target.value)}
                    placeholder="Re-enter to confirm"
                    aria-invalid={
                      Boolean(formData.passwordConfirm) &&
                      formData.password !== formData.passwordConfirm
                    }
                    className={cn(
                      inputClass,
                      "pl-9",
                      formData.passwordConfirm &&
                        formData.password !== formData.passwordConfirm &&
                        "border-red-300 focus:border-red-500 focus:ring-red-500",
                    )}
                    autoComplete="new-password"
                  />
                </div>
              </Field>
            </Section>

            {/* Section 2 — Symptoms */}
            <Section icon={<HeartPulse className="w-4 h-4 text-[#0F4C81]" />} title="Your symptoms">
              <Field
                label="Chief complaint"
                hint="In a few words, what's the main reason for your visit?"
                required
              >
                <input
                  type="text"
                  value={formData.chiefComplaint}
                  onChange={e => update("chiefComplaint", e.target.value)}
                  placeholder="e.g. Sharp pain in lower back"
                  className={inputClass}
                />
              </Field>

              <Field label={`Severity   ·   ${formData.severity} / 10`}>
                <div className="flex items-center gap-1 h-[40px]">
                  {[1,2,3,4,5,6,7,8,9,10].map(s => {
                    let colorClass = "bg-green-100 hover:bg-green-200 text-green-800";
                    if (s > 7) colorClass = "bg-red-100 hover:bg-red-200 text-red-800";
                    else if (s > 4) colorClass = "bg-amber-100 hover:bg-amber-200 text-amber-800";
                    const isSelected = formData.severity === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => update("severity", s)}
                        className={cn(
                          "flex-1 h-full rounded-[8px] font-bold text-[13px] border transition-all",
                          isSelected
                            ? cn(colorClass, "border-black/20 shadow-sm")
                            : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100",
                        )}
                        aria-pressed={isSelected}
                        aria-label={`Severity ${s} out of 10`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 font-medium mt-1.5">
                  <span>1 — Barely noticeable</span>
                  <span>10 — Worst imaginable</span>
                </div>
              </Field>

              <Field
                label={<span className="flex items-center gap-2"><AlignLeft className="w-4 h-4" /> Duration &amp; details</span>}
              >
                <input
                  type="text"
                  value={formData.duration}
                  onChange={e => update("duration", e.target.value)}
                  placeholder="How long? e.g. 2 days, 6 hours"
                  className={inputClass}
                />
                <textarea
                  value={formData.additionalDetails}
                  onChange={e => update("additionalDetails", e.target.value)}
                  placeholder="Anything else the care team should know? Aggravating or relieving factors, medications tried…"
                  className={cn(inputClass, "min-h-[96px] py-3 resize-y h-auto")}
                />
              </Field>
            </Section>

            {/* Section 3 — Preferences */}
            <Section icon={<CalendarIcon className="w-4 h-4 text-[#0F4C81]" />} title="Scheduling preferences">
              <Field label="When do you need to be seen?">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {([
                    { id: "asap",     label: "As soon as possible" },
                    { id: "today",    label: "Later today" },
                    { id: "flexible", label: "Next 3 days" },
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => update("preferredTiming", opt.id)}
                      className={cn(
                        "h-[44px] px-3 border rounded-[10px] text-[13px] font-semibold transition-all",
                        formData.preferredTiming === opt.id
                          ? "bg-[#0F4C81]/10 border-[#0F4C81] text-[#0F4C81]"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50",
                      )}
                      aria-pressed={formData.preferredTiming === opt.id}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Preferred provider (optional)">
                  <select
                    value={formData.preferredProvider}
                    onChange={e => update("preferredProvider", e.target.value)}
                    className={cn(inputClass, "bg-white appearance-none")}
                  >
                    <option value="">No preference</option>
                    <option>Dr. Emily Carter</option>
                    <option>Dr. Marcus Lee</option>
                    <option>Dr. Sarah Chen</option>
                  </select>
                </Field>

                <Field label="Relevant history (optional)">
                  <input
                    type="text"
                    value={formData.medicalHistory}
                    onChange={e => update("medicalHistory", e.target.value)}
                    placeholder="Chronic conditions, medications, allergies…"
                    className={inputClass}
                  />
                </Field>
              </div>
            </Section>
          </div>
        )}

        {/* ─────────────────────────  STEP 2  ───────────────────────── */}
        {currentStep === 2 && (
          <div className="w-full flex flex-col gap-5 animate-in fade-in duration-200">
            <div className="text-center mb-1">
              <h1 className="text-[24px] font-bold text-slate-900 mb-2">Review your details</h1>
              <p className="text-slate-600 text-[14px]">
                Check that everything is correct. Our triage system will prepare a summary for the care team.
              </p>
            </div>

            {/* Compact review blocks — fc-dl replaces the previous 3 ad-hoc card grids. */}
            <div className="fc-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-[#0F4C81]" />
                <h3 className="fc-section-title">Your details</h3>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="ml-auto text-[12px] font-semibold text-[#0F4C81] hover:underline underline-offset-4"
                >
                  Edit
                </button>
              </div>
              <dl className="fc-dl">
                <div><dt>Name</dt><dd>{formData.fullName || "—"}</dd></div>
                <div>
                  <dt>Date of birth</dt>
                  <dd>
                    {formData.dateOfBirth || "—"}
                    {age !== null && (
                      <span className="text-slate-500 font-normal"> · age {age}</span>
                    )}
                  </dd>
                </div>
                <div><dt>Gender</dt><dd>{formData.gender || "—"}</dd></div>
                <div>
                  <dt>Phone</dt>
                  <dd className="font-mono">{fullPhoneForApi || "—"}</dd>
                </div>
                {formData.email && (
                  <div><dt>Email</dt><dd>{formData.email}</dd></div>
                )}
              </dl>
            </div>

            <div className="fc-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <HeartPulse className="w-4 h-4 text-[#0F4C81]" />
                <h3 className="fc-section-title">Symptoms</h3>
              </div>
              <dl className="fc-dl">
                <div>
                  <dt>Chief complaint</dt>
                  <dd className="text-right max-w-[65%]">{formData.chiefComplaint || "—"}</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd
                    className={cn(
                      "font-semibold",
                      formData.severity > 7 ? "text-red-600"
                      : formData.severity > 4 ? "text-amber-600"
                      : "text-emerald-600",
                    )}
                  >
                    {formData.severity} / 10 · {severityHint(formData.severity)}
                  </dd>
                </div>
                <div><dt>Duration</dt><dd>{formData.duration || "—"}</dd></div>
                {formData.additionalDetails && (
                  <div>
                    <dt>Details</dt>
                    <dd className="text-right max-w-[65%] break-words font-normal text-slate-700">
                      {formData.additionalDetails}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="fc-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <CalendarIcon className="w-4 h-4 text-[#0F4C81]" />
                <h3 className="fc-section-title">Preferences</h3>
              </div>
              <dl className="fc-dl">
                <div>
                  <dt>Timing</dt>
                  <dd>
                    {formData.preferredTiming === "asap" ? "As soon as possible"
                      : formData.preferredTiming === "today" ? "Later today"
                      : "Next 3 days"}
                  </dd>
                </div>
                <div>
                  <dt>Provider</dt>
                  <dd>{formData.preferredProvider || "No preference"}</dd>
                </div>
              </dl>
            </div>

            <div className="fc-card fc-highlight-primary p-4 flex gap-3 text-slate-700 text-[13px] bg-[#EEF2FF]">
              <HeartPulse className="w-5 h-5 flex-shrink-0 text-[#1565C0]" />
              <div>
                <p className="font-semibold text-slate-900">What happens after you submit</p>
                <p className="mt-0.5 text-slate-600">
                  A triage summary is prepared for the care team, then a nurse reviews it before anything
                  is acted on. You&apos;ll see status updates on the next page.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop action bar */}
      <div className="hidden md:flex justify-between items-center w-full max-w-[760px] mx-auto px-4 py-4 mb-8">
        <div>
          {currentStep === 2 && (
            <button
              onClick={() => setCurrentStep(1)}
              className="px-5 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-[12px] text-[14px] font-semibold text-slate-700 flex items-center gap-2 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            <Save className="w-4 h-4" /> Save as draft
          </button>
          <button
            onClick={handleContinue}
            disabled={currentStep === 1 && !canContinueFromStep1}
            className="px-6 py-2.5 bg-[#0F4C81] hover:bg-[#0c3d68] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-[12px] text-[14px] font-semibold text-white flex items-center gap-2 shadow-elevated transition-colors"
          >
            {currentStep === 2 ? "Submit for triage" : "Continue"} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50 flex items-center justify-between gap-3">
        {currentStep === 2 && (
          <button
            onClick={() => setCurrentStep(1)}
            className="w-[44px] h-[48px] border border-slate-300 bg-slate-50 rounded-[12px] flex items-center justify-center flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
        )}
        <button
          onClick={handleContinue}
          disabled={currentStep === 1 && !canContinueFromStep1}
          className="flex-1 h-[48px] bg-[#0F4C81] disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-[12px] text-[15px] font-bold flex items-center justify-center gap-2 shadow-sm"
        >
          {currentStep === 2 ? "Submit" : "Continue"} <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// Local presentational helpers — keep the main tree readable.

const inputClass =
  "w-full h-[44px] px-3 border border-slate-300 rounded-[10px] focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] outline-none text-[14px] bg-white";

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fc-card p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-1 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="fc-section-title">{title}</h2>
        </div>
        {subtitle && (
          <p className="text-[12px] text-slate-500 leading-relaxed">{subtitle}</p>
        )}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-slate-700 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <p className="text-[12px] text-slate-500">{hint}</p>}
    </div>
  );
}
