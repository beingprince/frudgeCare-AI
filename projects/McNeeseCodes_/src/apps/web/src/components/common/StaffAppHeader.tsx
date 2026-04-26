"use client";

/**
 * Role-aware top bar for staff AppShell. Workspace label, search, and quick
 * links from getHeaderConfig(role). Profile / account live in the sidebar only.
 */

import React, { useState } from "react";
import Link from "next/link";
import {
  Box, Typography, Menu, MenuItem, IconButton, InputBase, Paper, Tooltip, Badge, Popover, useMediaQuery, useTheme,
} from "@mui/material";
import {
  SearchRounded, MenuRounded, KeyboardArrowDownRounded, NotificationsNoneRounded, ListAltRounded,
} from "@mui/icons-material";
import { alpha } from "@mui/material/styles";
import { C } from "@/lib/theme";
import type { UserRole } from "@/types";
import { getHeaderConfig, type SearchConfig } from "./appShellHeaderConfig";
import { ROLE_META, ROLE_USERS } from "./appShellMeta";

// The header search field is wired through to the role aware nav config but
// the actual search backend is intentionally not part of this prototype. The
// field is read only and shows the message below in a tooltip.
const SEARCH_SOURCE_NOTE = "Search integration pending. The field will query your organisation, scoped by role, once a search backend is connected.";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const ROLE_DEMO_LABEL: Record<UserRole, string> = {
  patient: "Patient",
  front_desk: "Front desk",
  nurse: "Nurse",
  provider: "Provider",
  operations: "Operations",
  admin: "Admin",
};

type StaffAppHeaderProps = {
  currentRole: UserRole;
  isMobile: boolean;
  onOpenMobileMenu: () => void;
  demoMenuAnchor: null | HTMLElement;
  onDemoMenuOpen: (el: HTMLElement) => void;
  onDemoMenuClose: () => void;
  onSetRole: (role: UserRole) => void;
};

function SearchFieldDesktop({ search }: { search: Extract<SearchConfig, { show: true }> }) {
  return (
    <Tooltip title={SEARCH_SOURCE_NOTE} placement="bottom" enterDelay={400}>
      <Paper
        elevation={0}
        component="div"
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.6,
          border: `1px solid ${C.border}`,
          borderRadius: "8px",
          flex: 1,
          minWidth: 0,
          maxWidth: { md: 300, lg: 380 },
          bgcolor: C.background,
          "&:focus-within": { borderColor: C.primary, boxShadow: `0 0 0 2px ${alpha(C.primary, 0.1)}` },
          transition: "all 0.18s ease",
        }}
      >
        <SearchRounded sx={{ fontSize: 18, color: C.text4, flexShrink: 0 }} />
        <InputBase
          placeholder={search.placeholder}
          readOnly
          inputProps={{ "aria-label": search.ariaLabel, tabIndex: -1 }}
          onMouseDown={e => e.preventDefault()}
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: "0.813rem",
            color: C.text1,
            cursor: "default",
            "& input::placeholder": { color: C.text4, opacity: 1 },
          }}
        />
        <Typography
          sx={{
            display: { xs: "none", lg: "block" },
            fontSize: "0.625rem",
            color: C.text4,
            fontWeight: 600,
            bgcolor: C.border,
            px: 0.75,
            py: 0.25,
            borderRadius: "4px",
            letterSpacing: "0.05em",
          }}
          aria-hidden
        >
          ⌘K
        </Typography>
      </Paper>
    </Tooltip>
  );
}

function SearchMobileButton({ search }: { search: Extract<SearchConfig, { show: true }> }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  return (
    <>
      <IconButton
        size="small"
        aria-label={search.ariaLabel}
        onClick={e => {
          setAnchor(e.currentTarget);
          setOpen(true);
        }}
        sx={{ display: { xs: "inline-flex", md: "none" }, color: C.text2, border: `1px solid ${C.border}`, borderRadius: "8px" }}
      >
        <SearchRounded sx={{ fontSize: 20 }} />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 1.5, minWidth: 280 } } }}
      >
        <Typography sx={{ fontSize: "0.7rem", color: C.text3, mb: 1, px: 0.5 }}>{SEARCH_SOURCE_NOTE}</Typography>
        <InputBase
          fullWidth
          readOnly
          placeholder={search.placeholder}
          inputProps={{ "aria-label": search.ariaLabel }}
          sx={{
            fontSize: "0.875rem",
            bgcolor: C.background,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            border: `1px solid ${C.border}`,
          }}
        />
      </Popover>
    </>
  );
}

function QuickLinkButton({ href, label, disabled }: { href: string; label: string; disabled?: boolean }) {
  return (
    <Typography
      component={Link}
      href={disabled ? "#" : href}
      onClick={disabled ? e => e.preventDefault() : undefined}
      sx={{
        fontSize: { xs: "0.7rem", sm: "0.75rem" },
        fontWeight: 600,
        color: disabled ? C.text4 : C.primary,
        textDecoration: "none",
        whiteSpace: "nowrap",
        px: { xs: 0.5, sm: 0.75 },
        py: 0.35,
        borderRadius: "6px",
        "&:hover": { bgcolor: disabled ? "transparent" : C.primaryAlpha(0.08) },
        pointerEvents: disabled ? "none" : "auto",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {label}
    </Typography>
  );
}

export function StaffAppHeader({
  currentRole,
  isMobile,
  onOpenMobileMenu,
  demoMenuAnchor,
  onDemoMenuOpen,
  onDemoMenuClose,
  onSetRole,
}: StaffAppHeaderProps) {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));
  const [shortcutsAnchor, setShortcutsAnchor] = useState<null | HTMLElement>(null);

  const cfg = getHeaderConfig(currentRole);
  const search = cfg.search;
  const quickLinks = cfg.quickLinks;
  const showShortcutsMenu = !isMdUp && quickLinks.length > 0;
  const showShortcutsRow = isMdUp && quickLinks.length > 0;

  return (
    <Box
      sx={{
        minHeight: 56,
        bgcolor: C.surface,
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        px: { xs: 1.25, sm: 2, md: 2.5 },
        gap: { xs: 0.75, sm: 1.5 },
        flexShrink: 0,
        zIndex: 50,
        boxShadow: "0 1px 0 rgba(15, 23, 42, 0.04)",
      }}
    >
      {isMobile && (
        <IconButton
          size="small"
          aria-label="Open navigation menu"
          onClick={onOpenMobileMenu}
          sx={{
            color: C.text2,
            border: `1px solid ${C.border}`,
            borderRadius: "8px",
            width: 36,
            height: 36,
            flexShrink: 0,
            "&:hover": { bgcolor: C.primaryAlpha(0.05), borderColor: C.primary },
          }}
        >
          <MenuRounded sx={{ fontSize: 20 }} />
        </IconButton>
      )}

      <Typography
        component="h1"
        noWrap
        sx={{
          fontSize: { xs: "0.78rem", sm: "0.8rem" },
          fontWeight: 800,
          color: C.text1,
          letterSpacing: { xs: "0.06em", sm: "0.1em" },
          textTransform: "uppercase",
          flex: { xs: "0 1 auto", md: "0 0 auto" },
          minWidth: 0,
          maxWidth: { xs: "min(40vw, 8rem)", sm: 200, md: 280 },
        }}
        title={cfg.workspaceLabel}
      >
        {cfg.workspaceLabel}
      </Typography>

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: { xs: "flex-start", md: "center" },
          gap: { xs: 0.5, md: 1.5 },
          px: { md: 1 },
        }}
      >
        {search.show && <SearchFieldDesktop search={search} />}
        {search.show && isMobile && <SearchMobileButton search={search} />}

        {showShortcutsRow && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.25,
              minWidth: 0,
              flex: { md: "0 1 auto" },
              overflow: "auto",
              py: 0.25,
              maxWidth: { md: 520 },
              "& a": { flexShrink: 0 },
            }}
          >
            {quickLinks.map(q => (
              <QuickLinkButton key={q.label + q.href} href={q.href} label={q.label} disabled={q.disabled} />
            ))}
          </Box>
        )}
      </Box>

      {showShortcutsMenu && (
        <>
          <IconButton
            size="small"
            aria-label="Open shortcuts to pages"
            onClick={e => setShortcutsAnchor(e.currentTarget)}
            sx={{ color: C.primary, border: `1px solid ${alpha(C.primary, 0.25)}`, borderRadius: "8px" }}
          >
            <ListAltRounded sx={{ fontSize: 20 }} />
          </IconButton>
          <Menu anchorEl={shortcutsAnchor} open={Boolean(shortcutsAnchor)} onClose={() => setShortcutsAnchor(null)}>
            {quickLinks.map(q => (
              <MenuItem
                key={q.label + q.href}
                component={q.disabled || !q.href ? "div" : Link}
                href={q.disabled ? undefined : q.href}
                onClick={() => setShortcutsAnchor(null)}
                disabled={q.disabled}
              >
                {q.label}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}

      {DEMO_MODE && (
        <>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: { xs: 0.35, sm: 0.75 },
              px: { xs: 0.6, sm: 1.25 },
              py: { xs: 0.4, sm: 0.65 },
              border: `1px solid ${alpha("#F59E0B", 0.45)}`,
              borderRadius: "8px",
              bgcolor: alpha("#F59E0B", 0.07),
              cursor: "pointer",
              flexShrink: 0,
              maxWidth: { xs: 110, sm: "none" },
              "&:hover": { bgcolor: alpha("#F59E0B", 0.12) },
            }}
            onClick={e => onDemoMenuOpen(e.currentTarget as HTMLElement)}
          >
            <Box
              component="span"
              sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "#D97706", flexShrink: 0, display: { xs: "none", sm: "block" } }}
              aria-hidden
            />
            <Typography
              component="div"
              sx={{ fontSize: { xs: "0.6rem", sm: "0.75rem" }, fontWeight: 700, color: "#92400E", lineHeight: 1.2 }}
            >
              <Box component="span" sx={{ opacity: 0.9 }}>Dev · </Box>
              {ROLE_DEMO_LABEL[currentRole]}
            </Typography>
            <KeyboardArrowDownRounded sx={{ fontSize: 14, color: "#92400E", display: { xs: "none", sm: "block" } }} />
          </Box>

          <Menu
            anchorEl={demoMenuAnchor}
            open={Boolean(demoMenuAnchor)}
            onClose={onDemoMenuClose}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            slotProps={{ paper: { sx: { minWidth: 220 } } }}
          >
            <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${C.border}` }}>
              <Typography sx={{ fontSize: "0.65rem", fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Demo (development)
              </Typography>
              <Typography sx={{ fontSize: "0.7rem", color: C.text2, mt: 0.25 }}>Switches role and your home page. Not production auth.</Typography>
            </Box>
            {(Object.keys(ROLE_META) as UserRole[]).map(role => {
              const m = ROLE_META[role];
              const u = ROLE_USERS[role];
              return (
                <MenuItem key={role} onClick={() => onSetRole(role)} selected={currentRole === role} sx={{ gap: 1.25 }}>
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: "8px",
                      bgcolor: alpha(m.color, 0.12),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <m.icon sx={{ fontSize: 16, color: m.color }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: "0.813rem", fontWeight: 600, lineHeight: 1.2 }}>{u.name}</Typography>
                    <Typography sx={{ fontSize: "0.625rem", color: C.text3 }}>{u.subtitle}</Typography>
                  </Box>
                </MenuItem>
              );
            })}
          </Menu>
        </>
      )}

      {cfg.showNotifications && (
        <Tooltip title={DEMO_MODE ? "Notifications (demo count)" : "Notifications"}>
          <span>
            <IconButton
              size="small"
              aria-label="Notifications"
              sx={{
                border: `1px solid ${C.border}`,
                borderRadius: "8px",
                p: 0.9,
                color: C.text3,
                flexShrink: 0,
                "&:hover": { bgcolor: C.primaryAlpha(0.05), borderColor: C.primary },
              }}
            >
              {DEMO_MODE && cfg.notificationDemoCount != null ? (
                <Badge
                  badgeContent={cfg.notificationDemoCount}
                  color="error"
                  sx={{ "& .MuiBadge-badge": { fontSize: "0.6rem", minWidth: 16, height: 16, padding: "0 4px" } }}
                >
                  <NotificationsNoneRounded sx={{ fontSize: 20 }} />
                </Badge>
              ) : (
                <Badge
                  variant="dot"
                  overlap="circular"
                  anchorOrigin={{ vertical: "top", horizontal: "right" }}
                  sx={{ "& .MuiBadge-badge": { bgcolor: C.primary, opacity: 0.45 } }}
                >
                  <NotificationsNoneRounded sx={{ fontSize: 20 }} />
                </Badge>
              )}
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Box>
  );
}
