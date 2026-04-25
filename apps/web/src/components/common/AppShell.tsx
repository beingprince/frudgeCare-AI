"use client";

/**
 * components/common/AppShell.tsx
 *
 * FrudgeCare MUI Application Shell
 * ==================================
 * Implements the compact icon sidebar + breadcrumb top header pattern
 * from the reference design screenshot.
 *
 * Layout system:
 *  - Sidebar: 68px collapsed (icons only) with collapse toggle → 220px expanded
 *  - Header: role-aware workspace bar (StaffAppHeader); account menu in sidebar only
 *  - Content: flex-1, scrollable
 *  - Public + patient + login routes: skip AppShell (landing, full-screen intakes, auth)
 *
 * Sidebar nav groups:
 *  - Top: Dashboard, Patients, Calendar, Medications, Reports, Payments
 *  - Bottom: Help, Settings
 *
 * Design tokens used: all from C (lib/theme.ts)
 */

import React, { useState, useEffect } from "react";
import {
  Box, Stack, Tooltip, Avatar, Badge, Divider, Typography,
  IconButton, useTheme, useMediaQuery,
  Menu, MenuItem,
} from "@mui/material";
import {
  DashboardRounded, PeopleRounded, CalendarMonthRounded,
  MedicalServicesRounded, BarChartRounded, AccountBalanceWalletRounded,
  HelpOutlineRounded, SettingsRounded,
  ChevronLeftRounded, ChevronRightRounded,
  LogoutRounded, PersonRounded,
  LocalHospitalRounded, AssignmentIndRounded,
  AdminPanelSettingsRounded, HealthAndSafetyRounded,
  KeyboardArrowDownRounded,
  ViewListRounded,
} from "@mui/icons-material";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { C } from "@/lib/theme";
import { alpha } from "@mui/material";
import { UserRole } from "@/types";
import { ROLE_META, ROLE_USERS } from "./appShellMeta";
import { StaffAppHeader } from "./StaffAppHeader";
import { inferStaffRoleFromPathname } from "@/lib/staffRouteRole";

// CONSTANTS

const SIDEBAR_COLLAPSED = 72;
const SIDEBAR_EXPANDED  = 240;
const HEADER_HEIGHT     = 64;

// Routes that skip the AppShell (staff sidebar + workspace header) entirely.
// Public entry / marketing must NOT use `startsWith("/")` — that matches every path.
//
// MVP collapse: /sign-in and /auth/* pages were deleted (demo runs gate-free).
// /console is the new unified AI shell — it carries its own header + tabs and
// must NOT be wrapped in the staff sidebar chrome.
const BYPASS_EXACT = new Set<string>(["/", "/triage", "/console"]);
const BYPASS_PREFIXES = ["/patient/", "/triage/", "/console/"];

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  roles: UserRole[];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  {
    icon: DashboardRounded,
    label: "Dashboard",
    href: "/operations/dashboard",
    roles: ["operations", "admin"],
  },
  {
    icon: PeopleRounded,
    label: "Patient Queue",
    href: "/front-desk/queue",
    roles: ["front_desk", "admin"],
    badge: 12,
  },
  {
    icon: CalendarMonthRounded,
    label: "Appointments",
    href: "/front-desk/appointments",
    roles: ["front_desk", "admin"],
  },
  {
    icon: ViewListRounded,
    label: "Triage list",
    href: "/nurse",
    roles: ["nurse", "admin"],
  },
  {
    icon: HealthAndSafetyRounded,
    label: "Triage table",
    href: "/nurse/queue",
    roles: ["nurse", "admin"],
  },
  {
    icon: AssignmentIndRounded,
    label: "Daily List",
    href: "/provider/daily",
    roles: ["provider", "admin"],
  },
  {
    icon: MedicalServicesRounded,
    label: "Clinical Cases",
    href: "/provider/case/case-001",
    roles: ["provider"],
  },
  {
    icon: BarChartRounded,
    label: "Analytics",
    href: "/operations/dashboard",
    roles: ["operations", "admin"],
  },
  {
    icon: AccountBalanceWalletRounded,
    label: "Billing",
    href: "/billing",
    roles: ["admin", "front_desk", "provider", "patient"],
  },
  {
    icon: AdminPanelSettingsRounded,
    label: "Accounts",
    href: "/admin/accounts",
    roles: ["admin", "operations"],
  },
];

const BOTTOM_NAV: NavItem[] = [
  { icon: HelpOutlineRounded, label: "Help",     href: "/settings", roles: ["patient","front_desk","provider","operations","admin"] },
  { icon: SettingsRounded,    label: "Settings", href: "/settings", roles: ["patient","front_desk","provider","operations","admin"] },
];

// ROLE_META, ROLE_USERS → appShellMeta.ts (shared with StaffAppHeader)

// SIDEBAR NAV ITEM

function SideNavItem({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}) {
  const content = (
    <Box
      component={Link}
      href={item.href}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: collapsed ? 0 : 1.5,
        py: 1.25,
        mx: 1,
        borderRadius: "10px",
        cursor: "pointer",
        textDecoration: "none",
        position: "relative",
        transition: "all 0.18s ease",
        justifyContent: collapsed ? "center" : "flex-start",
        backgroundColor: active ? alpha(C.primary, 0.1) : "transparent",
        color: active ? C.primary : C.text3,
        "&:hover": {
          backgroundColor: active ? alpha(C.primary, 0.12) : alpha(C.primary, 0.06),
          color: active ? C.primary : C.text2,
        },
      }}
    >
      {/* Active stripe */}
      {active && (
        <Box
          sx={{
            position: "absolute",
            left: -8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 3,
            height: 20,
            borderRadius: "0 3px 3px 0",
            backgroundColor: C.primary,
          }}
        />
      )}

      <Badge
        badgeContent={item.badge}
        max={99}
        sx={{
          "& .MuiBadge-badge": {
            fontSize: "0.563rem",
            minWidth: 16, height: 16,
            padding: "0 4px",
            backgroundColor: C.urgencyHigh,
            color: "#fff",
          },
        }}
      >
        <item.icon
          sx={{
            fontSize: 22,
            color: active ? C.primary : "inherit",
            flexShrink: 0,
          }}
        />
      </Badge>

      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={false}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            style={{
              fontSize: "0.813rem",
              fontWeight: active ? 600 : 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              fontFamily: "Inter, sans-serif",
              color: active ? C.primary : C.text2,
            }}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </Box>
  );

  if (collapsed) {
    return <Tooltip title={item.label} placement="right">{content}</Tooltip>;
  }
  return content;
}

// MAIN APP SHELL

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const muiTheme  = useTheme();
  // Avoid server-side loading/client viewport mismatch: server and first paint both use "desktop" branch, then align.
  const isMobile  = useMediaQuery(muiTheme.breakpoints.down("md"), { noSsr: true });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole>("front_desk");
  const [sessionUser, setSessionUser] = useState<{
    name: string;
    role: UserRole;
    email?: string;
  } | null>(null);
  const [demoMenuAnchor, setDemoMenuAnchor] = useState<null | HTMLElement>(null);
  const [userMenuAnchor, setUserMenuAnchor]  = useState<null | HTMLElement>(null);

  // Real session overrides stale `fc_demo_role` in localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.ok) {
          const d = (await res.json()) as { name: string; role: UserRole; email?: string };
          if (cancelled) return;
          setSessionUser({ name: d.name, role: d.role, email: d.email });
          setCurrentRole(d.role);
          return;
        }
      } catch {
        /* no cookie / offline */
      }
      if (cancelled) return;
      const saved = localStorage.getItem("fc_demo_role");
      if (saved) setCurrentRole(saved as UserRole);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close mobile drawer whenever the route changes so it never "sticks" open
  // across navigations. Drawer is already gated on `isMobile` during show on screen,
  // so no viewport-transition effect is needed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-data-in-effect
    setMobileOpen(false);
  }, [pathname]);

  // Body scroll lock + Escape-to-close while mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const handleSetRole = (role: UserRole) => {
    const paths: Record<UserRole, string> = {
      patient:    "/patient/status",
      front_desk: "/front-desk/queue",
      nurse:      "/nurse",
      provider:   "/provider/daily",
      operations: "/operations/dashboard",
      admin:      "/operations/dashboard",
    };
    setCurrentRole(role);
    localStorage.setItem("fc_demo_role", role);
    setDemoMenuAnchor(null);
    router.push(paths[role]);
  };

  const handleLogout = async () => {
    // Demo MVP: no real login flow. Sign-out just drops the session and
    // returns to the landing page (which is the public demo entry).
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSessionUser(null);
    router.push("/");
    setUserMenuAnchor(null);
  };

  // ── Skip check ──────────────────────────────────────────────────────────
  // Patient + login routes skip the staff app-shell chrome entirely. Because
  // `html, body { overflow: hidden }` (globals.css), the bypassed branch must
  // supply its OWN scroll container — otherwise long mobile pages (intake,
  // questionnaire) get clipped and look like scrolling is broken.
  const isBypass =
    (pathname != null && BYPASS_EXACT.has(pathname)) ||
    BYPASS_PREFIXES.some(prefix => pathname?.startsWith(prefix));
  if (isBypass) {
    return (
      <Box sx={{ height: "100vh", width: "100%", overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
        {children}
      </Box>
    );
  }

  const routeRole = inferStaffRoleFromPathname(pathname);
  const effectiveRole: UserRole = sessionUser?.role ?? routeRole ?? currentRole;
  const roleMeta  = ROLE_META[effectiveRole];
  const roleUser  = ROLE_USERS[effectiveRole];
  const displayUser = sessionUser
    ? { name: sessionUser.name, subtitle: ROLE_META[sessionUser.role].label }
    : roleUser;

  // Role-filtered nav, remove duplicates by href so that two items can never both
  // activate on the same route (fixes "Daily List" + "Clinical Cases"
  // visually appearing active at the same time).
  const visibleNav = (() => {
    const seen = new Set<string>();
    const items: NavItem[] = [];
    for (const item of NAV_ITEMS) {
      if (!item.roles.includes(effectiveRole)) continue;
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      items.push(item);
    }
    return items;
  })();

  // Best-match active: the single nav item whose href is the longest prefix
  // of the current path. Makes sure only one item is ever highlighted.
  const activeHref = (() => {
    if (!pathname) return null;
    const candidates = [...visibleNav, ...BOTTOM_NAV].filter(
      item => pathname === item.href || pathname.startsWith(item.href + "/"),
    );
    if (!candidates.length) return null;
    return candidates.reduce((best, cur) =>
      cur.href.length > best.href.length ? cur : best,
    ).href;
  })();

  const sideWidth  = sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  // Show on screen the nav body (brand + items + bottom nav + user card).
  // Used by both the desktop push sidebar and the mobile overlay drawer.
  const renderNavBody = (expanded: boolean) => (
    <>
      <Box
        sx={{
          height: HEADER_HEIGHT,
          display: "flex",
          alignItems: "center",
          px: expanded ? 2.5 : 0,
          justifyContent: expanded ? "flex-start" : "center",
          borderBottom: `1px solid ${C.border}`,
          gap: 1.5,
          flexShrink: 0,
          pr: expanded ? 4 : 0,
        }}
      >
        <Box
          sx={{
            width: 36, height: 36,
            borderRadius: "10px",
            backgroundColor: C.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: `0 4px 12px ${alpha(C.primary, 0.35)}`,
          }}
        >
          <LocalHospitalRounded sx={{ fontSize: 20, color: "#fff" }} />
        </Box>
        {expanded && (
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: "0.938rem", color: C.text1, letterSpacing: "-0.02em" }}>
              Frudge<span style={{ color: C.primary }}>Care</span>
            </Typography>
            <Typography sx={{ fontSize: "0.563rem", color: C.text4, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Clinical Platform
            </Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", py: 1.5 }}>
        <Stack spacing={0.5}>
          {visibleNav.map(item => (
            <SideNavItem
              key={item.href + item.label}
              item={item}
              collapsed={!expanded}
              active={activeHref === item.href}
            />
          ))}
        </Stack>
      </Box>

      <Box sx={{ borderTop: `1px solid ${C.border}`, py: 1.5 }}>
        <Stack spacing={0.5}>
          {BOTTOM_NAV.map(item => (
            <SideNavItem
              key={item.href + item.label}
              item={item}
              collapsed={!expanded}
              active={activeHref === item.href}
            />
          ))}
        </Stack>

        {expanded && (
          <Box
            sx={{
              mx: 1, mt: 1, p: 1.5,
              borderRadius: "10px",
              display: "flex", alignItems: "center", gap: 1.25,
              cursor: "pointer",
              "&:hover": { bgcolor: C.primaryAlpha(0.06) },
              transition: "background-color 0.15s ease",
            }}
            onClick={e => setUserMenuAnchor(e.currentTarget)}
          >
            <Avatar
              sx={{
                width: 32, height: 32,
                bgcolor: roleMeta.color,
                fontSize: "0.75rem",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {displayUser.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: C.text1 }} noWrap>
                {displayUser.name}
              </Typography>
              <Typography sx={{ fontSize: "0.625rem", color: C.text3 }}>
                {displayUser.subtitle}
              </Typography>
            </Box>
            <KeyboardArrowDownRounded sx={{ fontSize: 16, color: C.text4 }} />
          </Box>
        )}
      </Box>
    </>
  );

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden", bgcolor: C.background }}>
      {/* ────────────────────────────────────────────────────────────────────
          DESKTOP SIDEBAR  (push layout, >= md only)
      */}
      {!isMobile && (
        <Box
          component={motion.div}
          initial={false}
          animate={{ width: sideWidth }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          sx={{
            height: "100vh",
            bgcolor: C.surface,
            borderRight: `1px solid ${C.border}`,
            display: "flex",
            flexDirection: "column",
            overflow: "visible",
            flexShrink: 0,
            position: "relative",
            zIndex: 100,
          }}
        >
          {renderNavBody(!sidebarCollapsed)}

          <Tooltip title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} placement="right">
            <IconButton
              onClick={() => setSidebarCollapsed(s => !s)}
              size="small"
              sx={{
                position: "absolute",
                right: -12, top: HEADER_HEIGHT / 2 - 12,
                width: 24, height: 24,
                bgcolor: C.surface,
                border: `1px solid ${C.border}`,
                zIndex: 10,
                boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                "&:hover": { bgcolor: C.primaryAlpha(0.08), borderColor: C.primary },
                transition: "all 0.15s ease",
              }}
            >
              {sidebarCollapsed ? (
                <ChevronRightRounded sx={{ fontSize: 14, color: C.text3 }} />
              ) : (
                <ChevronLeftRounded sx={{ fontSize: 14, color: C.text3 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          MOBILE DRAWER (overlay, < md only)
      */}
      {isMobile && (
        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                key="mobile-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => setMobileOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  backgroundColor: "rgba(15, 23, 42, 0.42)",
                  zIndex: 1200,
                }}
              />
              <motion.div
                key="mobile-drawer"
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                style={{
                  position: "fixed",
                  top: 0, bottom: 0, left: 0,
                  width: 280,
                  zIndex: 1300,
                  backgroundColor: C.surface,
                  borderRight: `1px solid ${C.border}`,
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 24px 48px rgba(15, 23, 42, 0.18)",
                }}
              >
                {renderNavBody(true)}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          MAIN CONTENT AREA
      */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <StaffAppHeader
          currentRole={effectiveRole}
          isMobile={isMobile}
          onOpenMobileMenu={() => setMobileOpen(true)}
          demoMenuAnchor={demoMenuAnchor}
          onDemoMenuOpen={el => setDemoMenuAnchor(el as HTMLElement)}
          onDemoMenuClose={() => setDemoMenuAnchor(null)}
          onSetRole={handleSetRole}
        />

        {/* Account / profile: opened from sidebar user card only (not duplicated in header) */}
        <Menu
          anchorEl={userMenuAnchor}
          open={Boolean(userMenuAnchor)}
          onClose={() => setUserMenuAnchor(null)}
          transformOrigin={{ horizontal: "right", vertical: "top" }}
          anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
          slotProps={{ paper: { sx: { minWidth: 200 } } }}
        >
          <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${C.border}` }}>
            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem", color: C.text1 }}>
              {displayUser.name}
            </Typography>
            <Typography sx={{ fontSize: "0.688rem", color: C.text3 }}>
              {displayUser.subtitle}
            </Typography>
          </Box>
          <MenuItem onClick={() => setUserMenuAnchor(null)}>
            <PersonRounded sx={{ fontSize: 16, mr: 1.5, color: C.text3 }} /> My Profile
          </MenuItem>
          <MenuItem onClick={() => setUserMenuAnchor(null)}>
            <SettingsRounded sx={{ fontSize: 16, mr: 1.5, color: C.text3 }} /> Settings
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleLogout} sx={{ color: C.urgencyHigh }}>
            <LogoutRounded sx={{ fontSize: 16, mr: 1.5 }} /> Sign Out
          </MenuItem>
        </Menu>

        {/* ── PAGE CONTENT ──
            `overflow: auto` here gives every staff page a working scroll
            container by default. Pages that prefer to own their own inner
            scrolling (e.g. split-pane dashboards) can still do so; their
            inner scroll pane will take over and this parent becomes a no-op
            since it won't overflow when its child handles the overflow. */}
        <Box
          sx={{
            flex: 1,
            overflowX: "hidden",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

