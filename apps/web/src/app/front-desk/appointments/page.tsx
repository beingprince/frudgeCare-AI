"use client";

/**
 * app/front-desk/appointments/page.tsx
 * FrudgeCare Front Desk — Appointment Board
 *
 * Horizontal scrolling layout with fixed time axis.
 */

import React, { useState } from "react";
import {
  Box, Card, CardContent, Typography, Avatar, Chip,
  Breadcrumbs, IconButton, Button, alpha, Drawer,
  TextField, FormControl, InputLabel, Select, MenuItem,
  FormControlLabel, Switch, Stack, Divider
} from "@mui/material";
import {
  KeyboardArrowRightRounded, ChevronLeftRounded, ChevronRightRounded,
  AddRounded, PriorityHighRounded, CloseRounded
} from "@mui/icons-material";
import Link from "next/link";
import { motion } from "framer-motion";
import { C } from "@/lib/theme";
import { MOCK_APPOINTMENTS, MOCK_PROVIDERS, type MockAppointment } from "@/lib/mock-service";
import { useToast } from "@/components/shared/Toast";

// CONSTANTS

const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
];

const PROV_COLORS: Record<string, string> = {
  usr_pr_001: C.primary,
  usr_pr_002: "#2E7D32",
  usr_pr_003: "#6A1B9A",
};

// APPOINTMENT CELL
function ApptCell({
  appt,
  provId,
  time,
  onBookClick
}: {
  appt: MockAppointment | undefined;
  provId: string;
  time: string;
  onBookClick: (provId: string, time: string) => void;
}) {
  const color = PROV_COLORS[provId] ?? C.primary;

  if (!appt) {
    return (
      <Box
        onClick={() => onBookClick(provId, time)}
        sx={{
          height: 64,
          borderRadius: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          opacity: 0,
          transition: "opacity 0.16s ease-in-out",
          "&:hover": { opacity: 1, bgcolor: alpha(color, 0.05) },
        }}
      >
        <Box sx={{
          width: 32, height: 32, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          bgcolor: alpha(color, 0.1)
        }}>
          <AddRounded sx={{ fontSize: 20, color }} />
        </Box>
      </Box>
    );
  }

  const urg = appt.case.urgency_final ?? appt.case.urgency_suggested;
  const urgColor = urg === "high" ? C.urgencyHigh : urg === "medium" ? C.urgencyMedium : C.urgencyLow;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      style={{ height: '100%' }}
    >
      <Box
        component={Link}
        href={`/front-desk/case/${appt.case_id}`}
        sx={{
          display: "block",
          textDecoration: "none",
          borderRadius: "0",
          p: 1.25,
          bgcolor: alpha(color, 0.08),
          borderLeft: `4px solid ${color}`,
          cursor: "pointer",
          transition: "all 0.15s",
          minHeight: 64,
          height: "100%",
          "&:hover": {
            bgcolor: alpha(color, 0.14),
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 0.5 }}>
          <Typography noWrap sx={{ fontSize: "0.688rem", fontWeight: 700, color }}>
            {appt.patient.full_name}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            {appt.urgent_slot && (
              <PriorityHighRounded sx={{ fontSize: 12, color: C.urgencyHigh }} />
            )}
            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: urgColor }} />
          </Box>
        </Box>
        <Typography noWrap sx={{ fontSize: "0.563rem", color, opacity: 0.75, fontWeight: 500 }}>
          {appt.start_time}–{appt.end_time} · {appt.location_label}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.563rem",
            color: C.text3,
            mt: 0.25,
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {appt.case.symptom_text}
        </Typography>
      </Box>
    </motion.div>
  );
}

// MAIN
export default function AppointmentBoard() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(today);
  const toast = useToast();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bookingCtx, setBookingCtx] = useState<{ provId?: string; time?: string }>({});

  const dateLabel = viewDate.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const isToday = viewDate.toDateString() === today.toDateString();

  const shiftDay = (n: number) => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + n);
    setViewDate(d);
  };

  const dayAppts = isToday ? MOCK_APPOINTMENTS : [];

  const findAppt = (provId: string, slot: string) =>
    dayAppts.find(a => a.provider_user_id === provId && a.start_time === slot);

  const totalToday = dayAppts.length;
  const urgentToday = dayAppts.filter(a => a.urgent_slot).length;

  const handleBookClick = (provId?: string, time?: string) => {
    setBookingCtx({ provId, time });
    setDrawerOpen(true);
  };

  const handleSaveBooking = (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerOpen(false);
    toast.success("Appointment Scheduled", "The slot has been successfully reserved.");
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: C.background, overflow: "hidden" }}>
      {/* ── HEADER ── */}
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2, flexShrink: 0 }}>
        <Box>
          <Breadcrumbs separator={<KeyboardArrowRightRounded sx={{ fontSize: 14 }} />} sx={{ mb: 0.5 }}>
            <Typography component={Link} href="/front-desk/queue" sx={{ fontSize: "0.75rem", color: C.text3, textDecoration: "none", fontWeight: 500, "&:hover": { color: C.primary } }}>
              Front Desk
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", color: C.text1, fontWeight: 600 }}>
              Appointment Board
            </Typography>
          </Breadcrumbs>
          <Typography sx={{ fontSize: { xs: "1.1rem", sm: "1.3rem" }, fontWeight: 700, color: C.text1 }}>
            Appointment Board
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          {urgentToday > 0 && (
            <Chip icon={<PriorityHighRounded sx={{ fontSize: "0.875rem !important" }} />} label={`${urgentToday} urgent`} sx={{ bgcolor: alpha(C.urgencyHigh, 0.1), color: C.urgencyHigh, fontWeight: 700, fontSize: "0.688rem", "& .MuiChip-icon": { color: C.urgencyHigh } }} />
          )}

          {/* Date navigator */}
          <Box sx={{ display: "flex", alignItems: "center", overflow: "hidden", border: `1px solid ${C.border}`, borderRadius: "8px", bgcolor: C.surface }}>
            <IconButton size="small" onClick={() => shiftDay(-1)} sx={{ borderRadius: 0, borderRight: `1px solid ${C.border}`, p: 1, color: C.text3 }}>
              <ChevronLeftRounded sx={{ fontSize: 18 }} />
            </IconButton>
            <Typography sx={{ px: 2, fontSize: "0.75rem", fontWeight: 600, color: C.text1, whiteSpace: "nowrap" }}>
              {isToday ? "Today — " : ""}{viewDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </Typography>
            <IconButton size="small" onClick={() => shiftDay(1)} sx={{ borderRadius: 0, borderLeft: `1px solid ${C.border}`, p: 1, color: C.text3 }}>
              <ChevronRightRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          <Button 
            variant="contained" 
            startIcon={<AddRounded />} 
            size="small" 
            sx={{ whiteSpace: "nowrap" }}
            onClick={() => handleBookClick()}
          >
            New Booking
          </Button>
        </Box>
      </Box>

      {/* ── BODY ── */}
      <Box sx={{ flex: 1, p: { xs: 2, sm: 3 }, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 3, flex: 1, minHeight: 0 }}>

          {/* Summary strip */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
            {[
              { label: "Appointments", value: totalToday, color: C.primary },
              { label: "Urgent Slots", value: urgentToday, color: C.urgencyHigh },
              { label: "Providers", value: MOCK_PROVIDERS.length, color: "#2E7D32" },
            ].map(s => (
              <Card key={s.label} sx={{ position: "relative", overflow: "visible", "&::before": { content: '""', position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: "0 3px 3px 0", backgroundColor: s.color } }}>
                <CardContent sx={{ pl: 2.5, py: "12px !important" }}>
                  <Typography sx={{ fontSize: "0.563rem", fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {s.label}
                  </Typography>
                  <Typography sx={{ fontSize: "1.75rem", fontWeight: 800, color: C.text1, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
                    {s.value}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>

          {/* Calendar grid horizontally scrolling */}
          <Card sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", borderRadius: "8px", border: `1px solid ${C.border}`, boxShadow: "none" }}>
            <Box sx={{ overflow: "auto", flex: 1, display: "flex" }}>
              <Box sx={{ display: "inline-flex", flexDirection: "column", minHeight: "max-content", minWidth: "100%" }}>
                {/* Headers */}
                <Box sx={{ display: "flex", borderBottom: `1px solid ${C.border}`, bgcolor: alpha(C.primary, 0.03), position: "sticky", top: 0, zIndex: 30 }}>
                  <Box sx={{ width: 64, minWidth: 64, position: "sticky", left: 0, zIndex: 40, bgcolor: alpha(C.surface, 0.95), backdropFilter: "blur(4px)", borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }} />
                  {MOCK_PROVIDERS.map(prov => {
                    const color = PROV_COLORS[prov.id] ?? C.primary;
                    const provAppts = dayAppts.filter(a => a.provider_user_id === prov.id);
                    return (
                      <Box key={prov.id} sx={{ width: 220, minWidth: 220, p: 1.75, borderRight: `1px solid ${C.border}`, "&:last-child": { borderRight: "none" } }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Avatar sx={{ width: 28, height: 28, bgcolor: alpha(color, 0.12), color, fontSize: "0.563rem", fontWeight: 700 }}>
                            {prov.name.split(" ").slice(-1)[0].slice(0, 2).toUpperCase()}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography noWrap sx={{ fontSize: "0.688rem", fontWeight: 700, color }}>
                              {prov.name}
                            </Typography>
                            <Typography sx={{ fontSize: "0.563rem", color: C.text4 }}>
                              {prov.dept} · {provAppts.length} appts
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>

                {/* Time rows */}
                <Box sx={{ display: "flex", flexDirection: "column" }}>
                  {TIME_SLOTS.map((slot, si) => {
                    const hasAnyAppt = MOCK_PROVIDERS.some(p => findAppt(p.id, slot));
                    return (
                      <Box key={slot} sx={{ display: "flex", minHeight: 72, borderBottom: `1px solid ${si === TIME_SLOTS.length - 1 ? "transparent" : C.border}`, bgcolor: hasAnyAppt ? "transparent" : alpha(C.background, 0.5), "&:hover": { bgcolor: alpha(C.primary, 0.02) }, transition: "background-color 0.1s" }}>
                        <Box sx={{ width: 64, minWidth: 64, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", pt: 1.25, px: 1, borderRight: `1px solid ${C.border}`, position: "sticky", left: 0, zIndex: 20, bgcolor: alpha(C.surface, 0.95) }}>
                          <Typography sx={{ fontSize: "0.688rem", fontWeight: 600, color: C.text3, fontFamily: "monospace", lineHeight: 1 }}>
                            {slot}
                          </Typography>
                        </Box>
                        {MOCK_PROVIDERS.map(prov => {
                          const appt = findAppt(prov.id, slot);
                          return (
                            <Box key={prov.id} sx={{ width: 220, minWidth: 220, p: 0.5, borderRight: `1px solid ${C.border}`, "&:last-child": { borderRight: "none" } }}>
                              <ApptCell appt={appt} provId={prov.id} time={slot} onBookClick={handleBookClick} />
                            </Box>
                          );
                        })}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          </Card>
        </Box>
      </Box>

      {/* ── NEW BOOKING DRAWER ── */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 360, p: 0 } }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ p: 3, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 700 }}>New Booking</Typography>
            <IconButton onClick={() => setDrawerOpen(false)} size="small"><CloseRounded /></IconButton>
          </Box>
          
          <Box component="form" onSubmit={handleSaveBooking} sx={{ p: 3, flex: 1, overflowY: 'auto' }}>
            <Stack spacing={2.5}>
              <TextField 
                label="Patient ID" 
                size="small" 
                fullWidth 
                required 
                placeholder="search by patient profile id"
              />
              <TextField 
                label="Case ID" 
                size="small" 
                fullWidth 
                required 
                placeholder="lookup active case id"
              />

              <FormControl size="small" fullWidth>
                <InputLabel>Provider</InputLabel>
                <Select label="Provider" defaultValue={bookingCtx.provId ?? ""} required>
                  {MOCK_PROVIDERS.map(p => (
                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField 
                label="Date" 
                type="date" 
                size="small" 
                fullWidth 
                defaultValue={viewDate.toISOString().split("T")[0]} 
                required 
                InputLabelProps={{ shrink: true }}
              />

              <Box sx={{ display: "flex", gap: 1.5 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Start Time</InputLabel>
                  <Select label="Start Time" defaultValue={bookingCtx.time ?? ""} required>
                    {TIME_SLOTS.map(t => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                
                <FormControl size="small" fullWidth>
                  <InputLabel>End Time</InputLabel>
                  <Select label="End Time" defaultValue="" required>
                    {TIME_SLOTS.map(t => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <FormControl size="small" fullWidth>
                <InputLabel>Location</InputLabel>
                <Select label="Location" defaultValue="Exam Room" required>
                  <MenuItem value="Exam Room">Exam Room</MenuItem>
                  <MenuItem value="Telehealth">Telehealth</MenuItem>
                  <MenuItem value="Procedure Room">Procedure Room</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Status</InputLabel>
                <Select label="Status" defaultValue="pending" required>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="confirmed">Confirmed</MenuItem>
                </Select>
              </FormControl>

              <Divider />

              <FormControlLabel 
                control={<Switch size="small" color="error" />} 
                label={<Typography sx={{ fontSize: '0.85rem' }}>Mark as Urgent Slot</Typography>} 
              />
            </Stack>
          </Box>

          <Box sx={{ p: 2, borderTop: `1px solid ${C.border}`, bgcolor: C.surface }}>
            <Button type="submit" variant="contained" fullWidth onClick={handleSaveBooking}>
              Reserve Slot
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
