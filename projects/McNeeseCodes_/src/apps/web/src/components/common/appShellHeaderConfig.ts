import type { UserRole } from "@/types";

/**
 * Role-aware top header for the staff AppShell.
 * Only links to real app routes; missing features use TODOs in StaffAppHeader (search) or are omitted.
 */

export type QuickLink = {
  label: string;
  href: string;
  /** Omitted links must not 404: prefer fewer links to fake routes. */
  disabled?: boolean;
};

export type SearchConfig =
  | {
      show: true;
      placeholder: string;
      /** Accessibility label for the field (and mobile search popover). */
      ariaLabel: string;
    }
  | { show: false };

export type HeaderRoleConfig = {
  workspaceLabel: string;
  search: SearchConfig;
  quickLinks: QuickLink[];
  showNotifications: boolean;
  /**
   * Demo / placeholder until a real notification feed exists.
   * `null` = icon only (no numeric badge).
   */
  notificationDemoCount: number | null;
};

const OPS_ADMIN_LINKS: QuickLink[] = [
  { label: "Users", href: "/admin/accounts" },
  { label: "Reports", href: "/operations/dashboard" },
  { label: "Settings", href: "/settings" },
  { label: "Audit", href: "/operations/audit" },
];

const HEADER_BY_ROLE: Record<UserRole, HeaderRoleConfig> = {
  patient: {
    workspaceLabel: "Patient portal",
    search: { show: false },
    quickLinks: [
      { label: "My care status", href: "/patient/status" },
      { label: "History", href: "/patient/history" },
      { label: "Help", href: "/settings" },
    ],
    showNotifications: true,
    notificationDemoCount: null,
  },
  front_desk: {
    workspaceLabel: "Front desk workspace",
    search: {
      show: true,
      placeholder: "Search patients, cases, appointments…",
      ariaLabel: "Search patients, cases, and appointments",
    },
    quickLinks: [
      { label: "Walk-in status", href: "/patient/status" },
      { label: "New intake", href: "/patient/intake" },
      { label: "Appointments", href: "/front-desk/appointments" },
      { label: "Check-in queue", href: "/front-desk/queue" },
    ],
    showNotifications: true,
    notificationDemoCount: 3,
  },
  nurse: {
    workspaceLabel: "Nurse triage workspace",
    search: {
      show: true,
      placeholder: "Search triage queue, patients…",
      ariaLabel: "Search nurse triage queue and patients",
    },
    quickLinks: [
      { label: "Triage queue", href: "/nurse" },
      { label: "Daily list (providers)", href: "/provider/daily" },
    ],
    showNotifications: true,
    notificationDemoCount: 2,
  },
  provider: {
    workspaceLabel: "Provider review",
    search: {
      show: true,
      placeholder: "Search reviews, patients, cases…",
      ariaLabel: "Search provider queue, patients, and cases",
    },
    quickLinks: [
      { label: "Daily list", href: "/provider/daily" },
      { label: "Sample case", href: "/provider/case/case-001" },
    ],
    showNotifications: true,
    notificationDemoCount: 2,
  },
  operations: {
    workspaceLabel: "Operations console",
    search: {
      show: true,
      placeholder: "Search users, cases, audit logs…",
      ariaLabel: "Search across users, cases, and audit",
    },
    quickLinks: OPS_ADMIN_LINKS,
    showNotifications: true,
    notificationDemoCount: 1,
  },
  admin: {
    workspaceLabel: "Admin / operations",
    search: {
      show: true,
      placeholder: "Search users, cases, audit logs…",
      ariaLabel: "Search across users, cases, and audit",
    },
    quickLinks: OPS_ADMIN_LINKS,
    showNotifications: true,
    notificationDemoCount: 1,
  },
};

export function getHeaderConfig(role: UserRole): HeaderRoleConfig {
  return HEADER_BY_ROLE[role];
}
