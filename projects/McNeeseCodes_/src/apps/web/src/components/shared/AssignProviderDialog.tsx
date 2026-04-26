"use client";

/**
 * AssignProviderDialog — select a provider for a case.
 *
 * Keeps the selection in local data, calls onAssign({ providerId, providerName })
 * when confirmed. Does not talk to the server — the caller is responsible
 * for persisting the choice (mock store update + optional case.transition
 * call). This keeps the dialog reusable across front-desk and provider roles.
 *
 * Provider list comes from MOCK_PROVIDERS in lib/mock-service so the same
 * roster is shown everywhere.
 */

import React from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Radio, FormControlLabel,
  RadioGroup,
} from "@mui/material";
import { Stethoscope } from "lucide-react";
import { MOCK_PROVIDERS } from "@/lib/mock-service";

interface AssignProviderDialogProps {
  open: boolean;
  caseId: string;
  patientName: string;
  currentProviderId?: string;
  onClose: () => void;
  onAssign: (choice: { providerId: string; providerName: string }) => void;
}

export function AssignProviderDialog({
  open,
  caseId,
  patientName,
  currentProviderId,
  onClose,
  onAssign,
}: AssignProviderDialogProps) {
  const [selected, setSelected] = React.useState<string>(currentProviderId ?? MOCK_PROVIDERS[0].id);

  React.useEffect(() => {
    if (open) setSelected(currentProviderId ?? MOCK_PROVIDERS[0].id);
  }, [open, currentProviderId]);

  const handleConfirm = () => {
    const chosen = MOCK_PROVIDERS.find(p => p.id === selected);
    if (!chosen) return;
    onAssign({ providerId: chosen.id, providerName: chosen.name });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.25, pb: 1.25 }}>
        <Stethoscope size={18} color="#0F4C81" />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A" }}>
            Assign provider
          </div>
          <div style={{ fontSize: 12, color: "#64748B" }}>
            Case <span style={{ fontFamily: "ui-monospace, monospace" }}>{caseId}</span> · {patientName}
          </div>
        </div>
      </DialogTitle>
      <DialogContent dividers sx={{ py: 2 }}>
        <RadioGroup value={selected} onChange={(_, v) => setSelected(v)}>
          {MOCK_PROVIDERS.map(p => (
            <FormControlLabel
              key={p.id}
              value={p.id}
              control={<Radio size="small" sx={{ color: "#94A3B8", "&.Mui-checked": { color: "#0F4C81" } }} />}
              label={
                <div className="py-1">
                  <div className="text-[13.5px] font-semibold text-slate-900">{p.name}</div>
                  <div className="text-[12px] text-slate-500">{p.dept} · {p.location}</div>
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
                "&:hover": { backgroundColor: "#F8FAFC" },
                ...(selected === p.id && {
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
          onClick={handleConfirm}
          variant="contained"
          sx={{
            textTransform: "none",
            borderRadius: "10px",
            backgroundColor: "#0F4C81",
            "&:hover": { backgroundColor: "#0B3D66" },
          }}
        >
          Assign
        </Button>
      </DialogActions>
    </Dialog>
  );
}
