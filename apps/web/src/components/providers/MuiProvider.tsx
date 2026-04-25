'use client';

/**
 * components/providers/MuiProvider.tsx
 *
 * Wraps the app in the MUI ThemeProvider with CssBaseline, using the
 * AppRouterCacheProvider from @mui/material-nextjs so Emotion's server-side loading
 * stylesheet injection matches what the client load. Without the
 * cache provider, CssBaseline's global `<style>` tag is emitted on the
 * server but not re-created on the client → page loading mismatch.
 */

import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { theme } from '@/lib/theme';
import { ToastProvider } from '@/components/shared/Toast';

export function MuiProvider({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
