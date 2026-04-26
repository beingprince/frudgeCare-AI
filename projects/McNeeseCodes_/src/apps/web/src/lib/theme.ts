/**
 * lib/theme.ts
 *
 * FrudgeCare MUI Design System
 * ----------------------------
 * Mathematical 8px grid · Blue #1565C0 primary · Clean Medical SaaS
 *
 * Design Token Decisions:
 *  - 8px base spacing grid (MUI default) — enforced via theme.spacing()
 *  - Primary: #1565C0 (cool clinical blue — not Bootstrap default blue)
 *  - Surface: #FFFFFF / Background: #F4F6F8 — soft neutral base
 *  - Border-radius TIERS (see RADIUS constant; named per `00-foundations § 11`)
 *  - Typography: Inter (loaded via next/font) mapped to MUI fontFamily
 *  - Shadow scale: xs=1, sm=2, md=4, lg=8, xl=16 px spread
 *
 * Governance: this file is the MUI half of the token contract.
 * See documents/ux design/00-design-system-foundations.md
 *   · § 0  System Rules (mandatory / transitional / archetype / discouraged)
 *   · § 8.2 Semantic Typography Roles        → TYPE_ROLE
 *   · § 10.4 Chart color semantics           → CHART_PALETTE, URGENCY
 *   · § 11  Radius Tiers                     → RADIUS
 * And `21-known-design-debt § D-01` (breakpoints unified with Tailwind).
 */

import { createTheme, alpha } from '@mui/material/styles';

// ── Radius tiers (named; spec § 11) ──────────────────────────────────────────
// Replaces scattered literals (`rounded-[12px]`, `rounded-[16px]`, `[2.5rem]`).
export const RADIUS = {
  chip:    6,   // chips, small pills
  control: 8,   // inputs, buttons, small cards
  nav:     10,  // menu paper, sidebar nav item
  card:    12,  // default card (theme.shape.borderRadius)
  dialog:  16,  // dialog, full form-group card
  feature: 40,  // auth glass-card, persona card, feature panels ([2.5rem])
} as const;

// ── Semantic typography roles (spec § 8.2) ───────────────────────────────────
// Pages reference role names, not raw px. Export so JSX can consume.
export const TYPE_ROLE = {
  micro:        { fontSize: '0.563rem', fontWeight: 600,            letterSpacing: '0.02em' }, // 9
  eyebrow:      { fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em' }, // 10
  meta:         { fontSize: '0.688rem', fontWeight: 400,            letterSpacing: '0.025em' }, // 11
  denseBody:    { fontSize: '0.75rem',  fontWeight: 400, lineHeight: 1.6 }, // 12
  body:         { fontSize: '0.813rem', fontWeight: 400, lineHeight: 1.6 }, // 13
  bodyDefault:  { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.6 }, // 14
  bodyEmph:     { fontSize: '0.938rem', fontWeight: 500, lineHeight: 1.5 }, // 15
  titleCard:    { fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.4 }, // 17
  titlePage:    { fontSize: '1.3125rem', fontWeight: 700, lineHeight: 1.3 }, // 21 (responsive in use)
  kpiNumeral:   { fontSize: '1.75rem',  fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em' }, // 28
  hero:         { fontSize: '2.25rem',  fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em' }, // 36 (landing only)
} as const;

// ── Chart color semantics (spec § 10.4, 20 § 4) ──────────────────────────────
// Reserved urgency channel — do NOT reuse these in decorative chart series.
export const URGENCY = {
  high:   '#C62828',
  medium: '#E65100',
  low:    '#2E7D32',
} as const;

// Ordered decorative palette for neutral/trend series.
export const CHART_PALETTE = [
  '#1565C0', // 0 primary blue
  '#2E7D32', // 1 (skip if urgency-low coexists)
  '#0369A1', // 2 secondary blue
  '#6B7280', // 3 neutral gray (always safe)
  '#9333EA', // 4 accent purple
  '#0F766E', // 5 teal
  '#374151', // 6 deep neutral
] as const;

// ── Color constants (referenced throughout) ──────────────────────────────────
export const C = {
  primary:     '#1565C0',
  primaryDark: '#0D47A1',
  primaryLight:'#1976D2',
  primaryAlpha: (o: number) => alpha('#1565C0', o),

  success: '#2E7D32',
  warning: '#E65100',
  error:   '#C62828',
  info:    '#0277BD',

  // Urgency semantic colours
  urgencyHigh:   '#C62828',
  urgencyMedium: '#E65100',
  urgencyLow:    '#2E7D32',

  // Status badge colours
  badgeRegular:   { bg: '#E3F2FD', text: '#1565C0', border: '#BBDEFB' },
  badgeMember:    { bg: '#E8F5E9', text: '#2E7D32', border: '#C8E6C9' },
  badgeAssurance: { bg: '#FFF8E1', text: '#E65100', border: '#FFECB3' },

  surface:    '#FFFFFF',
  background: '#F4F6F8',
  border:     '#E0E5EC',
  borderHover:'#B0BEC5',

  text1: '#0D1117',  // headings
  text2: '#374151',  // body
  text3: '#6B7280',  // captions / labels
  text4: '#9CA3AF',  // placeholders
};

// ── Typography scale (mathematically proportional) ───────────────────────────
// Using a 1.25 (Major Third) type scale:
// h1:36 / h2:28.8 / h3:23 / h4:18.4 / h5:14.7 / h6:11.8 / body1:14 / body2:12 / caption:11
const FONT = '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif';

export const theme = createTheme({
  // ── Breakpoints (unified with Tailwind defaults — resolves D-01) ─────────
  // Tailwind: sm 640, md 768, lg 1024, xl 1280, 2xl 1536
  // Previously MUI `md` was 900 which conflicted with Tailwind `md` = 768
  // on mixed-layout pages (/front-desk/case/[id], /nurse). See
  // documents/ux design/21-known-design-debt.md § D-01.
  breakpoints: {
    values: {
      xs: 0,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
    },
  },

  // ── Palette ───────────────────────────────────────────────────────────────
  palette: {
    mode: 'light',
    primary: {
      main:        C.primary,
      dark:        C.primaryDark,
      light:       C.primaryLight,
      contrastText:'#FFFFFF',
    },
    secondary: {
      main:        '#0277BD',
      contrastText:'#FFFFFF',
    },
    success: { main: C.success, contrastText: '#FFFFFF' },
    warning: { main: C.warning, contrastText: '#FFFFFF' },
    error:   { main: C.error,   contrastText: '#FFFFFF' },
    info:    { main: C.info,    contrastText: '#FFFFFF' },
    background: {
      default: C.background,
      paper:   C.surface,
    },
    text: {
      primary:   C.text1,
      secondary: C.text3,
      disabled:  C.text4,
    },
    divider: C.border,
  },

  // ── Typography ─────────────────────────────────────────────────────────────
  typography: {
    fontFamily: FONT,
    fontWeightLight:   300,
    fontWeightRegular: 400,
    fontWeightMedium:  500,
    fontWeightBold:    700,

    h1: { fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, color: C.text1 },
    h2: { fontSize: '1.8rem',  fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.2, color: C.text1 },
    h3: { fontSize: '1.44rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.3, color: C.text1 },
    h4: { fontSize: '1.15rem', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.4, color: C.text1 },
    h5: { fontSize: '0.938rem',fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.5, color: C.text1 },
    h6: { fontSize: '0.813rem',fontWeight: 600, letterSpacing: '0.005em', lineHeight: 1.5, color: C.text2 },
    subtitle1: { fontSize: '0.875rem', fontWeight: 500, color: C.text2, letterSpacing: '-0.005em' },
    subtitle2: { fontSize: '0.75rem',  fontWeight: 500, color: C.text3, letterSpacing: '0.01em' },
    body1: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.6, color: C.text2 },
    body2: { fontSize: '0.75rem',  fontWeight: 400, lineHeight: 1.6, color: C.text3 },
    caption: { fontSize: '0.688rem', fontWeight: 400, letterSpacing: '0.025em', color: C.text3 },
    overline: { fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3 },
    button: { fontSize: '0.813rem', fontWeight: 600, letterSpacing: '0.01em', textTransform: 'none' },
  },

  // ── Shape ─────────────────────────────────────────────────────────────────
  shape: { borderRadius: RADIUS.card },

  // ── Spacing (8px base grid) ───────────────────────────────────────────────
  spacing: 8,

  // ── Shadows ───────────────────────────────────────────────────────────────
  shadows: [
    'none',
    '0 1px 2px rgba(0,0,0,0.05)',                                      // 1
    '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',        // 2
    '0 2px 6px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',        // 3
    '0 4px 8px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',        // 4
    '0 6px 12px rgba(0,0,0,0.08), 0 3px 6px rgba(0,0,0,0.04)',       // 5
    '0 8px 16px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)',       // 6
    '0 12px 24px rgba(0,0,0,0.08), 0 6px 12px rgba(0,0,0,0.04)',     // 7
    '0 16px 32px rgba(0,0,0,0.08), 0 8px 16px rgba(0,0,0,0.04)',     // 8
    '0 20px 40px rgba(0,0,0,0.1)',                                     // 9 - 24
    '0 20px 40px rgba(0,0,0,0.1)', '0 20px 40px rgba(0,0,0,0.1)',
    '0 20px 40px rgba(0,0,0,0.1)', '0 20px 40px rgba(0,0,0,0.1)',
    '0 20px 40px rgba(0,0,0,0.1)', '0 20px 40px rgba(0,0,0,0.1)',
    '0 20px 40px rgba(0,0,0,0.1)', '0 20px 40px rgba(0,0,0,0.1)',
    '0 20px 40px rgba(0,0,0,0.1)', '0 20px 40px rgba(0,0,0,0.1)',
    '0 20px 40px rgba(0,0,0,0.1)', '0 20px 40px rgba(0,0,0,0.1)',
    '0 20px 40px rgba(0,0,0,0.1)', '0 24px 48px rgba(0,0,0,0.12)',
    '0 30px 60px rgba(0,0,0,0.14)',
  ],

  // ── Component overrides ───────────────────────────────────────────────────
  components: {
    // MuiCssBaseline handled in ThemeProvider wrapper
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.control,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.813rem',
          letterSpacing: '0.01em',
          padding: '8px 20px',
          transition: 'all 0.18s ease',
          '&:hover': { transform: 'translateY(-1px)' },
          '&:active': { transform: 'translateY(0)' },
        },
        contained: {
          boxShadow: '0 2px 8px rgba(21,101,192,0.28)',
          '&:hover': { boxShadow: '0 4px 16px rgba(21,101,192,0.36)' },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': { borderWidth: '1.5px', backgroundColor: alpha(C.primary, 0.04) },
        },
        sizeSmall:  { padding: '5px 14px', fontSize: '0.75rem' },
        sizeLarge:  { padding: '11px 28px', fontSize: '0.875rem' },
      },
      defaultProps: { disableElevation: true },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.card,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.03)',
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0,0,0,0.09)',
          },
        },
      },
      defaultProps: { elevation: 0 },
    },

    MuiCardContent: {
      styleOverrides: { root: { padding: '20px', '&:last-child': { paddingBottom: '20px' } } },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.chip,
          fontWeight: 600,
          fontSize: '0.688rem',
          letterSpacing: '0.02em',
          height: 24,
        },
        label: { paddingLeft: 10, paddingRight: 10 },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: RADIUS.control,
            fontSize: '0.875rem',
            '& fieldset': { borderColor: C.border },
            '&:hover fieldset': { borderColor: C.borderHover },
            '&.Mui-focused fieldset': { borderColor: C.primary, borderWidth: 2 },
          },
        },
      },
      defaultProps: { size: 'small' },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.control,
          '& fieldset': { borderColor: C.border },
        },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontSize: '0.813rem',
          fontWeight: 500,
          color: C.text3,
          minHeight: 44,
          padding: '10px 20px',
          '&.Mui-selected': {
            fontWeight: 600,
            color: C.primary,
          },
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: { height: 2, borderRadius: 2 },
        root: { minHeight: 44 },
      },
    },

    MuiAvatar: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          fontSize: '0.813rem',
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        elevation1: { boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.03)' },
        elevation2: { boxShadow: '0 2px 6px rgba(0,0,0,0.07)' },
        elevation4: { boxShadow: '0 4px 12px rgba(0,0,0,0.09)' },
      },
    },

    MuiDivider: {
      styleOverrides: { root: { borderColor: C.border } },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: '0.813rem',
          borderBottom: `1px solid ${C.border}`,
          padding: '12px 16px',
        },
        head: {
          fontWeight: 600,
          fontSize: '0.688rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: C.text3,
          backgroundColor: C.background,
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.75rem',
          borderRadius: 6,
          padding: '6px 12px',
          backgroundColor: C.text1,
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4, height: 6 },
        bar: { borderRadius: 4 },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: RADIUS.dialog, boxShadow: '0 24px 48px rgba(0,0,0,0.16)' },
      },
    },

    MuiDialogTitle: {
      styleOverrides: { root: { fontSize: '1rem', fontWeight: 600, padding: '20px 24px 12px' } },
    },

    MuiDialogContent: {
      styleOverrides: { root: { padding: '12px 24px' } },
    },

    MuiDialogActions: {
      styleOverrides: { root: { padding: '12px 24px 20px', gap: 8 } },
    },

    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: RADIUS.card, border: `1px solid ${C.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 200 },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.813rem',
          fontWeight: 500,
          borderRadius: RADIUS.chip,
          margin: '2px 6px',
          padding: '8px 12px',
          '&:hover': { backgroundColor: alpha(C.primary, 0.06) },
          '&.Mui-selected': { backgroundColor: alpha(C.primary, 0.1), fontWeight: 600 },
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10, fontSize: '0.813rem' },
        message: { fontWeight: 500 },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: { fontWeight: 700, fontSize: '0.625rem' },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.control,
          margin: '1px 8px',
          padding: '8px 12px',
          transition: 'background-color 0.15s ease',
          '&.Mui-selected': {
            backgroundColor: alpha(C.primary, 0.1),
            color: C.primary,
            '&:hover': { backgroundColor: alpha(C.primary, 0.14) },
          },
          '&:hover': { backgroundColor: alpha(C.primary, 0.06) },
        },
      },
    },

    MuiSwitch: {
      styleOverrides: {
        root: { padding: 7 },
        track: { borderRadius: 20 / 2 },
        thumb: { boxShadow: 'none' },
      },
    },

    MuiSelect: {
      styleOverrides: { root: { borderRadius: RADIUS.control } },
    },
  },
});

export default theme;
