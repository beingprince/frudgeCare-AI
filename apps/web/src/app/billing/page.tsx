"use client";

import React, { useEffect, useState } from "react";
import { Box, Typography, Card, Divider } from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import { KPICard } from "@/components/shared/Cards";
import { StatusChip } from "@/components/shared/StatusChip";
import { C } from "@/lib/theme";

type RoleGroup = "admin" | "provider" | "front_desk" | "patient" | "operations" | "nurse";

// Demo Data
const DEMO_TABLE_DATA = [
  { id: "TX-1001", date: "2024-04-18", patient: "John Doe", service: "Office Visit - Level 3", billed: "$150.00", ins: "$120.00", resp: "$30.00", status: "Paid" },
  { id: "TX-1002", date: "2024-04-18", patient: "Jane Smith", service: "X-Ray Chest 2 Views", billed: "$85.00", ins: "$68.00", resp: "$17.00", status: "Pending" },
  { id: "TX-1003", date: "2024-04-17", patient: "Robert Roe", service: "Laceration Repair", billed: "$250.00", ins: "$0.00", resp: "$250.00", status: "Overdue" },
];

const DEMO_ACTIVITY = [
  { id: "ACT-01", date: "Apr 18, 2024 10:45 AM", desc: "Copay collected - John Doe (Visa ending 4242)", amount: "+$30.00" },
  { id: "ACT-02", date: "Apr 18, 2024 09:12 AM", desc: "Insurance claims batched (4 claims)", amount: "Submitted" },
  { id: "ACT-03", date: "Apr 17, 2024 04:30 PM", desc: "Patient payment portal - Robert Roe", amount: "+$100.00" },
];

export default function BillingPage() {
  const [role, setRole] = useState<RoleGroup>("front_desk");

  useEffect(() => {
    const r = localStorage.getItem("fc_demo_role") as RoleGroup;
    if (r) setRole(r);
  }, []);

  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, height: "100%", overflowY: "auto", bgcolor: C.background }}>
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        
        {/* HEADER */}
        <Box sx={{ mb: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: C.text1, mb: 0.5 }}>
              Billing & Payments
            </Typography>
            <Typography variant="body2" sx={{ color: C.text3 }}>
              {role === "admin" && "Organization-wide financial overview."}
              {role === "provider" && "Your service receipts and performance."}
              {role === "front_desk" && "Today's copay collections and balances."}
              {role === "patient" && "Your outstanding balances and payment history."}
            </Typography>
            {/* Demo data explicitly tagged per instructions */}
            <Typography variant="caption" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "#E65100", mt: 1, fontWeight: 600, bgcolor: "#FFF3E0", px: 1, py: 0.25, borderRadius: 1 }}>
              <InfoOutlined sx={{ fontSize: 14 }} /> Demo data
            </Typography>
          </Box>
        </Box>

        {/* METRICS ROW */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" }, gap: 3, mb: 5 }}>
          <KPICard title="Total Revenue (MTD)" value="$42,500" info="Gross collected this month" footer="Trending up" />
          <KPICard title="Outstanding AR" value="$8,200" info="Money owed by patients/insurance" footer="Needs attention" emphasis />
          {(role === "admin" || role === "front_desk") && (
            <KPICard title="Today's Copays" value="$450" info="Collected at front desk today" footer="12 transactions" />
          )}
          {(role === "admin" || role === "provider") && (
            <KPICard title="Claims Pending" value="24" info="Claims awaiting insurance response" footer="Avg 14 days" />
          )}
        </Box>

        {/* FLAT TABLE */}
        <Box sx={{ mb: 5 }}>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.text3, mb: 2 }}>
            Recent Claims & Invoices
          </Typography>
          <Box sx={{ width: "100%", overflowX: "auto", bgcolor: "white", borderRadius: "8px", border: `1px solid ${C.border}` }}>
            <Box sx={{ minWidth: 800 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 2fr 1fr 1fr 1fr 1fr", p: 2, borderBottom: `1px solid ${C.border}`, bgcolor: "#f8fafc" }}>
                <Typography variant="caption" fontWeight={600} color={C.text3}>Date</Typography>
                <Typography variant="caption" fontWeight={600} color={C.text3}>Patient</Typography>
                <Typography variant="caption" fontWeight={600} color={C.text3}>Service</Typography>
                <Typography variant="caption" fontWeight={600} color={C.text3}>Billed</Typography>
                <Typography variant="caption" fontWeight={600} color={C.text3}>Insurance</Typography>
                <Typography variant="caption" fontWeight={600} color={C.text3}>Patient Resp.</Typography>
                <Typography variant="caption" fontWeight={600} color={C.text3}>Status</Typography>
              </Box>
              {DEMO_TABLE_DATA.map((row, i) => (
                <Box key={row.id} sx={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 2fr 1fr 1fr 1fr 1fr", p: 2, borderBottom: i < DEMO_TABLE_DATA.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center", "&:hover": { bgcolor: "#f8fafc" } }}>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{row.date}</Typography>
                  <Typography variant="body2" fontWeight={500}>{row.patient}</Typography>
                  <Typography variant="body2" color={C.text2}>{row.service}</Typography>
                  <Typography variant="body2" color={C.text2}>{row.billed}</Typography>
                  <Typography variant="body2" color={C.text2}>{row.ins}</Typography>
                  <Typography variant="body2" fontWeight={600}>{row.resp}</Typography>
                  <Box>
                    <StatusChip 
                      status={row.status === "Paid" ? "Closed" : row.status === "Pending" ? "Under Review" : "Escalated"} 
                      size="compact" 
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
          <Typography variant="caption" sx={{ color: C.text4, mt: 1, display: "block" }}>* All amounts shown are Demo data.</Typography>
        </Box>

        {/* PAYMENT ACTIVITY LIST */}
        <Box>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.text3, mb: 2 }}>
            Payment Activity
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {DEMO_ACTIVITY.map((act) => (
              <Box key={act.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 2, borderBottom: `1px solid ${C.border}` }}>
                <Box>
                  <Typography variant="body2" fontWeight={500} color={C.text1}>
                    {act.desc}
                  </Typography>
                  <Typography variant="caption" color={C.text3}>
                    {act.date}
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight={600} color={act.amount.includes("+") ? "#2E7D32" : C.text2}>
                  {act.amount}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

      </Box>
    </Box>
  );
}
