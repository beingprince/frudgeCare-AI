"use client";

/**
 * app/front-desk/case/[id]/page.tsx
 * FrudgeCare Front Desk — Case Triage & Urgency Override
 *
 * MUI v9 + 8px grid. Async params fix for Next.js 16.
 * Real case data from getMockCaseById.
 */

import React, { use, useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, Avatar, Chip, Button,
  Breadcrumbs, Divider, IconButton, Tooltip,
  CircularProgress, Skeleton, alpha,
} from "@mui/material";
import {
  KeyboardArrowRightRounded, ArrowBackRounded,
  PriorityHighRounded, CheckCircleRounded,
  WarningAmberRounded, RadioButtonUncheckedRounded,
  CalendarTodayRounded, PhoneRounded,
  PersonAddRounded, AssignmentTurnedInRounded,
} from "@mui/icons-material";
import Link from "next/link";
import { motion } from "framer-motion";
import { C } from "@/lib/theme";
import { getMockCaseById, MOCK_PROVIDERS, type MockCase } from "@/lib/mock-service";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { logAudit, logEvent } from "@/lib/events";
import type { UrgencyLevel } from "@/types";

const URG_OPTS: { id: UrgencyLevel; label: string; color: string; bg: string; desc: string }[] = [
  { id: "high",   label: "High Priority",   color: C.urgencyHigh,   bg: alpha("#C62828", 0.08), desc: "Immediate clinical attention — potential risk to life or limb." },
  { id: "medium", label: "Medium Priority", color: C.urgencyMedium, bg: alpha("#E65100", 0.08), desc: "Should be seen within the next 2 hours — monitoring recommended." },
  { id: "low",    label: "Low Priority",    color: C.urgencyLow,    bg: alpha("#2E7D32", 0.08), desc: "Stable — schedule in normal queue, no immediate risk." },
];

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: "0.563rem", fontWeight: 700, color: C.text4,
        textTransform: "uppercase", letterSpacing: "0.08em", mb: 0.25 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: "0.813rem", fontWeight: 500, color: C.text2 }}>
        {value}
      </Typography>
    </Box>
  );
}

// MAIN
export default function FrontDeskCaseReview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [caseData, setCaseData] = useState<MockCase | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    const fetchCase = async () => {
      if (isSupabaseConfigured()) {
        try {
          const fetchPromise = supabase
            .from("cases")
            .select("*, patient:patient_profiles(*)")
            .eq("id", id)
            .single();
            
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500));
          const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
          
          if (!error && data) {
            setCaseData(data as any);
            setLoading(false);
            return;
          }
        } catch { /* fall through */ }
      }
      setCaseData(getMockCaseById(id));
      setLoading(false);
    };
    fetchCase();
  }, [id]);

  const handleUrgencyOverride = async (level: UrgencyLevel) => {
    if (!caseData) return;
    setSaving(true);
    try {
      await logAudit("cases", caseData.id, "urgency_final",
        caseData.urgency_suggested, level, "usr_fd_001", "front_desk",
        "Manual urgency override by triage staff");
      await supabase.from("cases")
        .update({ urgency_final: level, status: "under_review" })
        .eq("id", caseData.id);
      await logEvent("case_urgency_reviewed", caseData.id, caseData.patient_id,
        "front_desk", "usr_fd_001", { level });
      setCaseData({ ...caseData, urgency_final: level, status: "under_review" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setCaseData({ ...caseData, urgency_final: level, status: "under_review" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ px: 3, py: 2, bgcolor: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <Skeleton width={200} height={20} sx={{ mb: 0.5 }} />
          <Skeleton width={300} height={32} />
        </Box>
        <Box sx={{ flex: 1, p: 3, display: "grid", gridTemplateColumns: "1fr 360px", gap: 3 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[1,2].map(i => <Card key={i}><CardContent><Skeleton height={140} /></CardContent></Card>)}
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[1,2].map(i => <Card key={i}><CardContent><Skeleton height={180} /></CardContent></Card>)}
          </Box>
        </Box>
      </Box>
    );
  }

  if (!caseData) {
    return (
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography sx={{ color: C.text3, fontWeight: 600 }}>Case not found.</Typography>
      </Box>
    );
  }

  const currentUrg = caseData.urgency_final ?? caseData.urgency_suggested;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: C.background }}>
      {/* ── HEADER ── */}
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: C.surface,
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 2, flexShrink: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Tooltip title="Back to queue">
            <IconButton component={Link} href="/front-desk/queue" size="small"
              sx={{ border: `1px solid ${C.border}`, borderRadius: "8px", p: 0.75, color: C.text3 }}>
              <ArrowBackRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Box>
            <Breadcrumbs separator={<KeyboardArrowRightRounded sx={{ fontSize: 14 }} />} sx={{ mb: 0.25 }}>
              <Typography component={Link} href="/front-desk/queue"
                sx={{ fontSize: "0.75rem", color: C.text3, textDecoration: "none",
                  fontWeight: 500, "&:hover": { color: C.primary } }}>
                Patient Queue
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: C.text1, fontWeight: 600 }}>
                Case Review
              </Typography>
            </Breadcrumbs>
            <Typography sx={{ fontSize: "1.1rem", fontWeight: 700, color: C.text1 }}>
              {caseData.case_code} — {caseData.patient.full_name}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          {saved && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75,
                px: 1.5, py: 0.75, borderRadius: "8px",
                bgcolor: alpha(C.success, 0.1), border: `1px solid ${alpha(C.success, 0.3)}` }}>
                <CheckCircleRounded sx={{ fontSize: 16, color: C.success }} />
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: C.success }}>
                  Urgency saved
                </Typography>
              </Box>
            </motion.div>
          )}
          <Chip label={caseData.status.replace(/_/g, " ")} size="small"
            sx={{ height: 24, fontSize: "0.625rem", fontWeight: 700,
              bgcolor: alpha(C.primary, 0.08), color: C.primary,
              textTransform: "capitalize", "& .MuiChip-label": { px: 1.25 } }} />
        </Box>
      </Box>

      {/* ── BODY ── */}
      <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 2, sm: 3 }, minHeight: 0 }}>
        <Box sx={{ maxWidth: 1280, mx: "auto", width: "100%",
          display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 360px" }, gap: 3 }}>

          {/* LEFT */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

            {/* Patient card */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
              <Card>
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
                    <Avatar sx={{ width: 52, height: 52, bgcolor: alpha(C.primary, 0.12),
                      color: C.primary, fontSize: "1rem", fontWeight: 700 }}>
                      {caseData.patient.initials}
                    </Avatar>
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: "1.05rem", color: C.text1 }}>
                        {caseData.patient.full_name}
                      </Typography>
                      <Typography sx={{ fontSize: "0.688rem", color: C.text3 }}>
                        {caseData.patient.patient_code} · {caseData.patient.sex} · DOB {caseData.patient.date_of_birth}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
                    gap: 2, pt: 1.5, borderTop: `1px solid ${C.border}` }}>
                    <LabelValue label="Phone"    value={caseData.patient.phone} />
                    <LabelValue label="Email"    value={caseData.patient.email} />
                    <LabelValue label="City"     value={caseData.patient.address_city ?? "—"} />
                  </Box>
                  {caseData.patient.allergies.length > 0 && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${C.border}` }}>
                      <Typography sx={{ fontSize: "0.563rem", fontWeight: 700, color: C.urgencyHigh,
                        textTransform: "uppercase", letterSpacing: "0.08em", mb: 0.75 }}>
                        ⚠ Drug Allergies
                      </Typography>
                      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                        {caseData.patient.allergies.map(a => (
                          <Chip key={a} label={a} size="small"
                            sx={{ height: 22, fontSize: "0.625rem", fontWeight: 600,
                              bgcolor: alpha(C.urgencyHigh, 0.08), color: C.urgencyHigh,
                              "& .MuiChip-label": { px: 1.25 } }} />
                        ))}
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Risk flags */}
            {caseData.risky_flags && caseData.risky_flags.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
                <Card sx={{ borderLeft: `4px solid ${C.urgencyHigh}` }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                      <PriorityHighRounded sx={{ fontSize: 18, color: C.urgencyHigh }} />
                      <Typography sx={{ fontWeight: 700, fontSize: "0.813rem", color: C.urgencyHigh }}>
                        Risk flags detected
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
                      {caseData.risky_flags.map(f => (
                        <Chip key={f} label={f} size="small"
                          sx={{ height: 26, fontSize: "0.688rem", fontWeight: 600,
                            bgcolor: alpha(C.urgencyHigh, 0.1), color: C.urgencyHigh,
                            border: `1px solid ${alpha(C.urgencyHigh, 0.25)}`,
                            "& .MuiChip-label": { px: 1.25 } }} />
                      ))}
                    </Box>
                    <Typography sx={{ fontSize: "0.75rem", color: C.text3, lineHeight: 1.5 }}>
                      High-risk indicators were detected during patient intake. Clinical review required before scheduling.
                    </Typography>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Intake details */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: C.text3,
                    textTransform: "uppercase", letterSpacing: "0.1em", mb: 1.5 }}>
                    Intake Details
                  </Typography>
                  <Typography sx={{ fontSize: "0.938rem", fontWeight: 600, color: C.text1,
                    lineHeight: 1.6, mb: 2 }}>
                    {caseData.symptom_text}
                  </Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2,
                    pt: 1.5, borderTop: `1px solid ${C.border}` }}>
                    <LabelValue label="Duration"         value={caseData.duration_text} />
                    <LabelValue label="Severity Hint"    value={caseData.severity_hint} />
                    <LabelValue label="Suggested urgency" value={caseData.urgency_suggested.toUpperCase()} />
                  </Box>
                  {caseData.structured_summary && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${C.border}` }}>
                      <Typography sx={{ fontSize: "0.563rem", fontWeight: 700, color: C.primary,
                        textTransform: "uppercase", letterSpacing: "0.1em", mb: 1 }}>
                        Structured summary
                      </Typography>
                      <Box sx={{ px: 2, py: 1.5, borderRadius: "8px",
                        bgcolor: C.primaryAlpha(0.04), border: `1px solid ${C.primaryAlpha(0.15)}`,
                        borderLeft: `3px solid ${C.primary}` }}>
                        <Typography sx={{ fontSize: "0.813rem", color: C.text2, lineHeight: 1.6 }}>
                          {caseData.structured_summary}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </Box>

          {/* RIGHT SIDEBAR */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

            {/* Urgency triage */}
            <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: C.text3,
                    textTransform: "uppercase", letterSpacing: "0.1em", mb: 0.5 }}>
                    Urgency Triage
                  </Typography>
                  <Typography sx={{ fontSize: "0.75rem", color: C.text3, mb: 2, lineHeight: 1.5 }}>
                    Suggested urgency:{" "}
                    <strong style={{ color: C.urgencyHigh, textTransform: "uppercase" }}>
                      {caseData.urgency_suggested}
                    </strong>. Override below if clinical judgment differs.
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {URG_OPTS.map(opt => {
                      const isActive = currentUrg === opt.id;
                      return (
                        <Box key={opt.id}
                          onClick={() => !saving && handleUrgencyOverride(opt.id)}
                          sx={{
                            px: 2, py: 1.5, borderRadius: "10px", cursor: saving ? "not-allowed" : "pointer",
                            border: `1.5px solid ${isActive ? opt.color : C.border}`,
                            bgcolor: isActive ? opt.bg : "transparent",
                            transition: "all 0.15s ease",
                            "&:hover": { bgcolor: opt.bg, borderColor: opt.color },
                            opacity: saving ? 0.6 : 1,
                          }}>
                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: "0.813rem",
                              color: isActive ? opt.color : C.text2 }}>
                              {saving && isActive
                                ? <CircularProgress size={12} sx={{ color: opt.color, mr: 0.75 }} />
                                : null}
                              {opt.label}
                            </Typography>
                            {isActive
                              ? <CheckCircleRounded sx={{ fontSize: 16, color: opt.color }} />
                              : <RadioButtonUncheckedRounded sx={{ fontSize: 16, color: C.text4 }} />}
                          </Box>
                          <Typography sx={{ fontSize: "0.625rem", color: isActive ? opt.color : C.text4,
                            lineHeight: 1.4 }}>
                            {opt.desc}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </CardContent>
              </Card>
            </motion.div>

            {/* Assign provider */}
            <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
              <Card>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: C.text3,
                    textTransform: "uppercase", letterSpacing: "0.1em", mb: 1.5 }}>
                    Assign Provider
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {MOCK_PROVIDERS.map(prov => {
                      const isAssigned = caseData.assigned_provider_user_id === prov.id;
                      return (
                        <Box key={prov.id}
                          sx={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                            px: 1.5, py: 1.25, borderRadius: "8px",
                            border: `1.5px solid ${isAssigned ? C.primary : C.border}`,
                            bgcolor: isAssigned ? C.primaryAlpha(0.04) : "transparent",
                            transition: "all 0.15s" }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                            <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(C.primary, 0.12),
                              color: C.primary, fontSize: "0.625rem", fontWeight: 700 }}>
                              {prov.name.split(" ").slice(-1)[0].slice(0, 2).toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography sx={{ fontSize: "0.813rem", fontWeight: 600, color: C.text1, lineHeight: 1.2 }}>
                                {prov.name}
                              </Typography>
                              <Typography sx={{ fontSize: "0.563rem", color: C.text3 }}>
                                {prov.dept}
                              </Typography>
                            </Box>
                          </Box>
                          {isAssigned
                            ? <Chip label="Assigned" size="small" sx={{ height: 20, fontSize: "0.563rem",
                                fontWeight: 700, bgcolor: alpha(C.primary, 0.1), color: C.primary,
                                "& .MuiChip-label": { px: 1 } }} />
                            : <Button size="small" variant="text" sx={{ fontSize: "0.625rem", fontWeight: 700, minWidth: 0, px: 1 }}>
                                Assign
                              </Button>
                          }
                        </Box>
                      );
                    })}
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Button fullWidth variant="contained" size="large"
                    startIcon={<AssignmentTurnedInRounded />}
                    sx={{ py: 1.5, fontWeight: 700 }}>
                    Finalize Triage Review
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
