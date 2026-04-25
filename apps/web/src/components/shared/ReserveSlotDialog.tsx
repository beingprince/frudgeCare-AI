"use client";

/**
 * ReserveSlotDialog — pick an appointment slot for a case.
 *
 * Generates a handful of plausible slots deterministically from today's
 * date so the demo is reproducible across reloads (no Math.random()).
 * Caller is responsible for persistence via onReserve().
 */

import React from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Radio,
  FormControlLabel, RadioGroup,
} from "@mui/material";
import { CalendarClock } from "lucide-react";

interface Slot {
  id: string;
  label: string;
  date: string;
  time: string;
  provider: string;
  urgent?: boolean;
}

function defaultSlots(): Slot[] {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmtDate = (d: Date) =>
    `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`;
  const plus = (h: number) => {
    const d = new Date(today);
    d.setHours(today.getHours() + h, 0, 0, 0);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  return [
    { id: "slot-urgent", label: "Next urgent window", date: fmtDate(today), time: plus(1), provider: "Dr. Emily Carter", urgent: true },
    { id: "slot-today",  label: "Today, afternoon",    date: fmtDate(today), time: plus(3), provider: "Dr. Marcus Lee" },
    { id: "slot-tomor",  label: "Tomorrow, morning",   date: fmtDate(tomorrow), time: "09:30", provider: "Dr. Sarah Chen" },
    { id: "slot-tomor2", label: "Tomorrow, afternoon", date: fmtDate(tomorrow), time: "14:00", provider: "Dr. Emily Carter" },
  ];
}

interface ReserveSlotDialogProps {
  open: boolean;
  caseId: string;
  patientName: string;
  onClose: () => void;
  onReserve: (slot: Slot) => void;
}

export function ReserveSlotDialog({
  open,
  caseId,
  patientName,
  onClose,
  onReserve,
}: ReserveSlotDialogProps) {
  const slots = React.useMemo(defaultSlots, []);
  const [selected, setSelected] = React.useState<string>(slots[0].id);

  const confirm = () => {
    const s = slots.find(x => x.id === selected);
    if (!s) return;
    onReserve(s);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.25, pb: 1.25 }}>
        <CalendarClock size={18} color="#0F4C81" />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A" }}>
            Reserve a slot
          </div>
          <div style={{ fontSize: 12, color: "#64748B" }}>
            Case <span style={{ fontFamily: "ui-monospace, monospace" }}>{caseId}</span> · {patientName}
          </div>
        </div>
      </DialogTitle>
      <DialogContent dividers sx={{ py: 2 }}>
        <RadioGroup value={selected} onChange={(_, v) => setSelected(v)}>
          {slots.map(s => (
            <FormControlLabel
              key={s.id}
              value={s.id}
              control={<Radio size="small" sx={{ color: "#94A3B8", "&.Mui-checked": { color: "#0F4C81" } }} />}
              label={
                <div className="py-1 w-full">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold text-slate-900">{s.label}</span>
                    {s.urgent && (
                      <span className="fc-badge fc-badge-danger">Urgent slot</span>
                    )}
                  </div>
                  <div className="text-[12px] text-slate-500">
                    {s.date} · {s.time} · {s.provider}
                  </div>
                </div>
              }
              sx={{
                alignItems: "flex-start",
                border: "1px solid #E2E8F0",
                borderRadius: "10px",
                margin: 0,
                mb: 1,
                px: 1.5,
                py: 0.5,
                width: "100%",
                "&:hover": { backgroundColor: "#F8FAFC" },
                ...(selected === s.id && {
                  borderColor: "#0F4C81",
                  backgroundColor: "rgba(15,76,129,0.04)",
                }),
              }}
            />
          ))}
        </RadioGroup>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined" sx={{ textTransform: "none", borderRadius: "10px" }}>
          Cancel
        </Button>
        <Button
          onClick={confirm}
          variant="contained"
          sx={{
            textTransform: "none",
            borderRadius: "10px",
            backgroundColor: "#0F4C81",
            "&:hover": { backgroundColor: "#0B3D66" },
          }}
        >
          Reserve
        </Button>
      </DialogActions>
    </Dialog>
  );
}
