"use client";

import React from "react";
import {
  Settings, RefreshCcw, Database, User, ShieldCheck, Layout,
} from "lucide-react";
import { FormField } from "@/components/shared/FormField";
import { useToast } from "@/components/shared/Toast";

export default function SettingsPage() {
  const toast = useToast();
  const [resetting, setResetting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");

  const handleSave = async () => {
    if (!name.trim() && !email.trim()) {
      toast.warn("Nothing to save", "Enter a name or email first.");
      return;
    }
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      toast.success("Profile saved", "Your display preferences were updated.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      if (res.ok) {
        toast.success("System reset", "Demo data was re-seeded.");
        setTimeout(() => window.location.reload(), 700);
      } else {
        toast.error("Reset failed", "The server rejected the request.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Reset failed", "Could not reach the reset endpoint.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-4xl mx-auto px-5 md:px-6 py-8 md:py-10 space-y-8">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-[12px] bg-[#0F4C81]/8 text-[#0F4C81] flex items-center justify-center">
            <Settings size={20} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="fc-page-title">System Settings</h1>
            <p className="fc-page-subtitle">Manage your profile and demo environment state.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          <div className="md:col-span-2 space-y-5 md:space-y-6">
            <section className="fc-card p-6">
              <h2 className="fc-section-title flex items-center gap-2 mb-5">
                <User size={16} className="text-slate-500" /> Personal profile
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Display name" id="display-name">
                  {(c) => (
                    <input
                      {...c}
                      type="text"
                      className={c.inputClass}
                      placeholder="Maria Johnson"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Email address" id="email">
                  {(c) => (
                    <input
                      {...c}
                      type="email"
                      className={c.inputClass}
                      placeholder="maria.j@frudgecare.demo"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  )}
                </FormField>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="mt-5 px-5 h-10 bg-[#0F4C81] text-white rounded-[10px] font-semibold text-[13px] hover:bg-[#0B3D66] fc-focus-ring disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </section>

            <section className="fc-card p-6 border-l-4 border-l-[#C62828]">
              <h2 className="fc-section-title flex items-center gap-2 mb-4" style={{ color: "#C62828" }}>
                <Database size={16} /> Danger zone · Demo tools
              </h2>
              <div className="p-5 rounded-[12px] border border-red-100 bg-red-50/60 space-y-3">
                <h3 className="text-[15px] font-semibold text-red-900 tracking-tight">Deterministic demo reset</h3>
                <p className="text-[13px] text-red-900/70 leading-relaxed">
                  Wipes all current cases, appointments, and events, then re-seeds the system with the 12 master demo cases as defined in the build contract.
                </p>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="inline-flex items-center gap-2 px-4 h-10 bg-[#C62828] text-white rounded-[10px] font-semibold text-[13px] hover:bg-[#B71C1C] transition-colors disabled:opacity-50 fc-focus-ring"
                >
                  <RefreshCcw size={14} className={resetting ? "animate-spin" : ""} />
                  {resetting ? "Resetting system…" : "Execute full system reset"}
                </button>
              </div>
            </section>
          </div>

          <aside className="space-y-5 md:space-y-6">
            <section className="fc-card p-6">
              <h3 className="fc-section-title flex items-center gap-2 mb-4">
                <ShieldCheck size={16} className="text-slate-500" /> Security info
              </h3>
              <dl className="space-y-3">
                <div>
                  <dt className="fc-eyebrow">Active role</dt>
                  <dd className="text-[14px] font-semibold text-[#0F4C81] mt-0.5">Front Desk</dd>
                </div>
                <div>
                  <dt className="fc-eyebrow">Department</dt>
                  <dd className="text-[14px] font-semibold text-slate-900 mt-0.5">Outpatient Services</dd>
                </div>
              </dl>
            </section>

            <section className="fc-card p-6">
              <h3 className="fc-section-title flex items-center gap-2 mb-4">
                <Layout size={16} className="text-slate-500" /> Preferences
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-slate-600">Dark mode</span>
                <div
                  className="w-9 h-5 rounded-full bg-slate-200 cursor-not-allowed"
                  title="Coming soon"
                  aria-disabled="true"
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
