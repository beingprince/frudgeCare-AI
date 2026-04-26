"use client";

/**
 * /admin/accounts — Account Administration
 *
 * Lists every staff account grouped by role (Provider / Nurse / Front
 * Desk / Admin) and every patient profile. Lets the admin:
 *
 *   • Create a new staff account in the database (POST → /api/admin/accounts)
 *   • Edit an existing one in-place (PATCH → /api/admin/accounts/:id)
 *   • Deactivate (soft-delete) an account
 *
 * Why we keep the password row but never show the hash
 * ----------------------------------------------------
 * The earlier draft displayed a hardcoded "demo1234" string next to a
 * "copy password" button — that was a privacy/security tell that the
 * page wasn't really hooked into anything. We now treat the password
 * field as write-only: the admin can RESET it (server hashes it with
 * bcrypt) but never reads it back.
 */

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  TextField,
  Checkbox,
  IconButton,
  Button,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  alpha,
} from "@mui/material";
import {
  EditRounded,
  SaveRounded,
  CloseRounded,
  VisibilityRounded,
  VisibilityOffRounded,
  RefreshRounded,
  AddRounded,
} from "@mui/icons-material";
import { C } from "@/lib/theme";
import { useToast } from "@/components/shared/Toast";

interface UserRecord {
  id: string;
  role: string;
  staff_code: string;
  username: string;
  display_name: string;
  email: string;
  phone: string;
  phone_country?: string;
  department: string;
  active: boolean;
  failed_login_attempts?: number;
  locked_until?: string | null;
}

interface PatientRecord {
  id: string;
  full_name: string;
  date_of_birth: string;
  gender?: string;
  email: string;
  phone: string;
}

const ROLE_OPTIONS = [
  { value: "provider", label: "Provider (Doctor)" },
  { value: "nurse", label: "Nurse" },
  { value: "front_desk", label: "Front Desk" },
  { value: "admin", label: "Admin" },
] as const;

const ROLE_LABEL: Record<string, string> = {
  provider: "Provider",
  nurse: "Nurse",
  front_desk: "Front Desk",
  admin: "Admin",
  operations: "Operations",
};

// CREATE ACCOUNT MODAL
function CreateAccountDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (u: UserRecord) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    role: "provider",
    staff_code: "",
    username: "",
    display_name: "",
    email: "",
    phone: "",
    department: "",
    password: "",
  });

  const reset = () => {
    setForm({
      role: "provider",
      staff_code: "",
      username: "",
      display_name: "",
      email: "",
      phone: "",
      department: "",
      password: "",
    });
    setShowPassword(false);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error("Could not create account", data.error ?? "Unknown error");
        return;
      }
      toast.success("Account created", `${form.display_name} added.`);
      onCreated(data.user as UserRecord);
      reset();
      onClose();
    } catch (err) {
      toast.error("Network error", "Please retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 700, color: C.text1 }}>
        Create staff account
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, pt: 1 }}>
          <TextField
            select
            label="Role"
            size="small"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            sx={{ gridColumn: "1 / span 2" }}
          >
            {ROLE_OPTIONS.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Staff code"
            size="small"
            placeholder="e.g. PR-002"
            value={form.staff_code}
            onChange={(e) =>
              setForm({ ...form, staff_code: e.target.value.toUpperCase() })
            }
            sx={{ "& input": { fontFamily: "monospace" } }}
          />
          <TextField
            label="Username"
            size="small"
            placeholder="e.g. emily"
            value={form.username}
            onChange={(e) =>
              setForm({ ...form, username: e.target.value.toLowerCase() })
            }
          />
          <TextField
            label="Display name"
            size="small"
            placeholder="e.g. Dr. Emily Carter"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            sx={{ gridColumn: "1 / span 2" }}
          />
          <TextField
            label="Email"
            size="small"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            sx={{ gridColumn: "1 / span 2" }}
          />
          <TextField
            label="Phone"
            size="small"
            placeholder="+15550000000"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <TextField
            label="Department"
            size="small"
            placeholder="Primary Care"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
          <Box sx={{ gridColumn: "1 / span 2", position: "relative" }}>
            <TextField
              label="Initial password"
              size="small"
              fullWidth
              type={showPassword ? "text" : "password"}
              helperText="Min 8 characters. The user can change it after sign-in."
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <IconButton
              size="small"
              onClick={() => setShowPassword((s) => !s)}
              sx={{ position: "absolute", right: 6, top: 6 }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <VisibilityOffRounded sx={{ fontSize: 18 }} />
              ) : (
                <VisibilityRounded sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={
            saving ||
            !form.role ||
            !form.staff_code ||
            !form.username ||
            !form.display_name ||
            !form.email ||
            form.password.length < 8
          }
          startIcon={
            saving ? <CircularProgress size={14} /> : <AddRounded sx={{ fontSize: 18 }} />
          }
        >
          {saving ? "Creating…" : "Create account"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ROW EDIT COMPONENT
function UserRow({
  user,
  onSave,
  onResetPassword,
}: {
  user: UserRecord;
  onSave: (u: Partial<UserRecord> & { id: string }) => Promise<boolean>;
  onResetPassword: (u: UserRecord) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<UserRecord>(user);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Keep editor in sync if the parent reloads the row.
  useEffect(() => setFormData(user), [user]);

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave({
      id: formData.id,
      username: formData.username,
      display_name: formData.display_name,
      email: formData.email,
      phone: formData.phone,
      department: formData.department,
      active: formData.active,
    });
    setSaving(false);
    if (ok) {
      setIsEditing(false);
      toast.success("Account updated", `${formData.username} saved successfully.`);
    } else {
      toast.error("Update failed", "Could not save account details.");
    }
  };

  const isProvider = user.role === "provider";

  if (!isEditing) {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: isProvider
            ? "1fr 1.5fr 1fr 1.5fr 1fr 0.5fr 0.5fr"
            : "1fr 1.5fr 1fr 1.5fr 1.5fr 0.5fr 0.5fr",
          p: 1.5,
          borderBottom: `1px solid ${C.border}`,
          alignItems: "center",
          "&:hover": { bgcolor: alpha(C.primary, 0.02) },
        }}
      >
        <Typography variant="body2" sx={{ fontFamily: "monospace", color: C.text2 }}>
          {user.staff_code || "--"}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, color: C.text1 }}>
          {user.display_name}
        </Typography>
        <Typography variant="body2" color={C.text2}>
          {user.username}
        </Typography>
        <Typography variant="body2" color={C.text3}>
          {user.email}
        </Typography>
        {!isProvider && (
          <Typography variant="body2" color={C.text3}>
            {user.department || "--"}
          </Typography>
        )}
        {isProvider && (
          <Typography variant="body2" color={C.text3}>
            {user.phone || "--"}
          </Typography>
        )}
        <Box>
          {user.active ? (
            <span className="fc-badge fc-badge-success">Active</span>
          ) : (
            <span className="fc-badge fc-badge-error">Inactive</span>
          )}
        </Box>
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5 }}>
          <Tooltip title="Reset password">
            <IconButton size="small" onClick={() => onResetPassword(user)}>
              <RefreshRounded sx={{ fontSize: 16, color: C.text3 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => setIsEditing(true)}>
              <EditRounded sx={{ fontSize: 16, color: C.text3 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        p: 2,
        borderBottom: `1px solid ${C.border}`,
        bgcolor: alpha(C.primary, 0.04),
        borderRadius: "4px",
        m: 1,
      }}
    >
      <TextField
        size="small"
        label="Display name"
        value={formData.display_name}
        onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
        sx={{ minWidth: 200 }}
      />
      <TextField
        size="small"
        label="Username"
        value={formData.username}
        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
      />
      <TextField
        size="small"
        label="Email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        sx={{ minWidth: 220 }}
      />
      <TextField
        size="small"
        label="Phone"
        value={formData.phone || ""}
        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
      />
      <TextField
        size="small"
        label="Department"
        value={formData.department || ""}
        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Checkbox
          checked={formData.active}
          onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
          size="small"
        />
        <Typography variant="body2" color={C.text2}>
          Active
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 1, ml: "auto", alignItems: "center" }}>
        <IconButton size="small" onClick={() => setIsEditing(false)} disabled={saving}>
          <CloseRounded sx={{ fontSize: 20, color: C.text4 }} />
        </IconButton>
        <Button
          variant="contained"
          size="small"
          onClick={handleSave}
          disabled={saving}
          startIcon={
            saving ? <CircularProgress size={14} /> : <SaveRounded sx={{ fontSize: 16 }} />
          }
        >
          Save
        </Button>
      </Box>
    </Box>
  );
}

function PatientRow({ patient }: { patient: PatientRecord }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1.5fr 1fr 1fr 1.5fr 1.5fr",
        p: 1.5,
        borderBottom: `1px solid ${C.border}`,
        alignItems: "center",
        "&:hover": { bgcolor: alpha(C.primary, 0.02) },
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, color: C.text1 }}>
        {patient.full_name}
      </Typography>
      <Typography variant="body2" color={C.text3}>
        {patient.date_of_birth}
      </Typography>
      <Typography variant="body2" color={C.text3}>
        {patient.gender || "--"}
      </Typography>
      <Typography variant="body2" color={C.text3}>
        {patient.email}
      </Typography>
      <Typography variant="body2" color={C.text3}>
        {patient.phone || "--"}
      </Typography>
    </Box>
  );
}

// PASSWORD RESET DIALOG
function ResetPasswordDialog({
  user,
  onClose,
  onReset,
}: {
  user: UserRecord | null;
  onClose: () => void;
  onReset: (id: string, password: string) => Promise<boolean>;
}) {
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!user) setPwd("");
  }, [user]);

  if (!user) return null;

  const handleSubmit = async () => {
    setSaving(true);
    const ok = await onReset(user.id, pwd);
    setSaving(false);
    if (ok) {
      toast.success("Password reset", `${user.username}'s password has been replaced.`);
      setPwd("");
      onClose();
    } else {
      toast.error("Reset failed", "Could not reset password.");
    }
  };

  return (
    <Dialog open={!!user} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Reset password</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color={C.text3} sx={{ mb: 2 }}>
          Reset the password for{" "}
          <Box component="span" sx={{ fontWeight: 700, color: C.text1 }}>
            {user.display_name}
          </Box>{" "}
          (<code>{user.username}</code>).
        </Typography>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="New password"
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          helperText="Min 8 characters."
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || pwd.length < 8}
          startIcon={saving ? <CircularProgress size={14} /> : null}
        >
          {saving ? "Saving…" : "Reset password"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// DATA REMOVAL (demo) — requests land in cases.ai_patient_profile.deletion_request
function DataDeletionPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<
    { id: string; caseCode: string | null; requestedAt: string; reason?: string; requestedBy?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/data-deletion");
      if (!res.ok) throw new Error("load failed");
      const j = (await res.json()) as { requests: typeof rows };
      setRows(j.requests ?? []);
    } catch {
      toast.error("Could not load requests", "Check Supabase service role in .env.local.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approve = async (id: string) => {
    setActing(id);
    try {
      const res = await fetch("/api/admin/data-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: id, approve: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Approve failed");
      toast.success("Approved", `deletion_approved_at_txt: ${j.deletion_approved_at_txt ?? "saved"}`);
      await load();
    } catch (e) {
      toast.error("Approval failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center", color: C.text3 }}>
        No pending data-removal requests. Patients can start one from their status page (demo).
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ p: 2, borderBottom: `1px solid ${C.border}`, bgcolor: "#f8fafc" }}>
        <Typography variant="body2" sx={{ color: C.text2, maxWidth: 720 }}>
          When you approve, the case is redacted, marked closed, and the approval timestamp is stored in{" "}
          <code>ai_patient_profile</code> as plain text (demo audit trail).
        </Typography>
      </Box>
      {rows.map((r) => (
        <Box
          key={r.id}
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1.2fr 1fr auto" },
            gap: 2,
            p: 2,
            borderBottom: `1px solid ${C.border}`,
            alignItems: "center",
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {r.caseCode ?? r.id}
            </Typography>
            <Typography variant="caption" color={C.text3}>
              Requested: {r.requestedAt} {r.requestedBy ? `· ${r.requestedBy}` : ""}
            </Typography>
            {r.reason && (
              <Typography variant="body2" sx={{ mt: 0.5, color: C.text2 }}>
                {r.reason}
              </Typography>
            )}
          </Box>
          <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace", color: C.text3 }}>
            {r.id}
          </Typography>
          <Button
            size="small"
            variant="contained"
            color="error"
            disabled={acting === r.id}
            onClick={() => approve(r.id)}
          >
            {acting === r.id ? "Working…" : "Approve & redact"}
          </Button>
        </Box>
      ))}
    </Box>
  );
}

// MAIN PAGE
export default function AdminAccounts() {
  const [tab, setTab] = useState(0);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const toast = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/accounts");
      const data = await res.json();
      setUsers((data.users ?? []) as UserRecord[]);
      setPatients((data.patients ?? []) as PatientRecord[]);
    } catch {
      toast.error("Could not load accounts", "Please retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveUser = async (
    updates: Partial<UserRecord> & { id: string },
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/admin/accounts/${updates.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok || !data.success) return false;
      setUsers((prev) =>
        prev.map((u) => (u.id === updates.id ? { ...u, ...updates } as UserRecord : u)),
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleResetPassword = async (id: string, password: string) => {
    try {
      const res = await fetch(`/api/admin/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      return res.ok && data.success;
    } catch {
      return false;
    }
  };

  const providers = users.filter((u) => u.role === "provider");
  const nurses = users.filter((u) => u.role === "nurse");
  const frontDesk = users.filter((u) => u.role === "front_desk");
  const admins = users.filter(
    (u) => u.role === "admin" || u.role === "operations",
  );

  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, height: "100%", overflowY: "auto", bgcolor: C.background }}>
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        <Box
          sx={{
            mb: 4,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: C.text1, mb: 0.5 }}>
              Account Administration
            </Typography>
            <Typography variant="body2" sx={{ color: C.text3 }}>
              Create staff accounts, assign roles, reset passwords, and audit access.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            onClick={() => setCreateOpen(true)}
          >
            Create account
          </Button>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
          <Tabs
            value={tab}
            onChange={(e, v) => setTab(v)}
            textColor="primary"
            indicatorColor="primary"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label={`Providers (${providers.length})`} />
            <Tab label={`Nurses (${nurses.length})`} />
            <Tab label={`Front Desk (${frontDesk.length})`} />
            <Tab label={`Admins (${admins.length})`} />
            <Tab label={`Patients (${patients.length})`} />
            <Tab label="Data removal" />
          </Tabs>
        </Box>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ bgcolor: "white", border: `1px solid ${C.border}`, borderRadius: "8px", overflow: "hidden" }}>
            {tab === 0 && (
              <StaffTable
                rows={providers}
                isProvider
                onSave={handleSaveUser}
                onResetPassword={setResetTarget}
              />
            )}
            {tab === 1 && (
              <StaffTable
                rows={nurses}
                isProvider={false}
                onSave={handleSaveUser}
                onResetPassword={setResetTarget}
              />
            )}
            {tab === 2 && (
              <StaffTable
                rows={frontDesk}
                isProvider={false}
                onSave={handleSaveUser}
                onResetPassword={setResetTarget}
              />
            )}
            {tab === 3 && (
              <StaffTable
                rows={admins}
                isProvider={false}
                onSave={handleSaveUser}
                onResetPassword={setResetTarget}
              />
            )}

            {tab === 4 && (
              <Box>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 1fr 1fr 1.5fr 1.5fr",
                    p: 2,
                    borderBottom: `1px solid ${C.border}`,
                    bgcolor: "#f8fafc",
                  }}
                >
                  {["Name", "DOB", "Gender", "Email", "Phone"].map((h) => (
                    <Typography
                      key={h}
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: C.text3,
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </Typography>
                  ))}
                </Box>
                {patients.length === 0 ? (
                  <Box sx={{ p: 4, textAlign: "center", color: C.text3 }}>
                    No patient profiles yet. They appear here as soon as a patient
                    registers via the intake form.
                  </Box>
                ) : (
                  patients.map((p) => <PatientRow key={p.id} patient={p} />)
                )}
              </Box>
            )}

            {tab === 5 && <DataDeletionPanel />}
          </Box>
        )}
      </Box>

      <CreateAccountDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(u) => setUsers((prev) => [u, ...prev])}
      />
      <ResetPasswordDialog
        user={resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={handleResetPassword}
      />
    </Box>
  );
}

// SHARED STAFF TABLE
function StaffTable({
  rows,
  isProvider,
  onSave,
  onResetPassword,
}: {
  rows: UserRecord[];
  isProvider: boolean;
  onSave: (u: Partial<UserRecord> & { id: string }) => Promise<boolean>;
  onResetPassword: (u: UserRecord) => void;
}) {
  const headers = isProvider
    ? ["Code", "Name", "Username", "Email", "Phone", "Status", "Actions"]
    : ["Code", "Name", "Username", "Email", "Department", "Status", "Actions"];

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center", color: C.text3 }}>
        No accounts in this role. Use "Create account" to add one.
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: isProvider
            ? "1fr 1.5fr 1fr 1.5fr 1fr 0.5fr 0.5fr"
            : "1fr 1.5fr 1fr 1.5fr 1.5fr 0.5fr 0.5fr",
          p: 2,
          borderBottom: `1px solid ${C.border}`,
          bgcolor: "#f8fafc",
        }}
      >
        {headers.map((h, i) => (
          <Typography
            key={h}
            variant="caption"
            align={i === headers.length - 1 ? "right" : "left"}
            sx={{
              fontWeight: 600,
              color: C.text3,
              textTransform: "uppercase",
            }}
          >
            {h}
          </Typography>
        ))}
      </Box>
      {rows.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          onSave={onSave}
          onResetPassword={onResetPassword}
        />
      ))}
    </Box>
  );
}
