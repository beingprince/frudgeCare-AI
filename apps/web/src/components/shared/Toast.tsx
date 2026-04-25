"use client";

/**
 * Toast — lightweight notification system.
 *
 * Built on MUI Snackbar + Alert so it inherits the MUI theme automatically.
 * Exposes a hook (`useToast`) and a provider mounted once at the root of
 * the app. Replaces the older pattern of inline "success" banners that
 * every action had to re-implement.
 *
 * Intent
 *  - success → action completed (green)
 *  - info    → data change acknowledged (blue)
 *  - warn    → non-blocking caution (amber)
 *  - error   → action failed (red)
 *
 * Every toast automatically dismisses after 4 s or on the user clicking
 * the close affordance. Long text wraps to max 420 px.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Alert, Snackbar } from "@mui/material";

type ToastIntent = "success" | "info" | "warn" | "error";

interface ToastItem {
  id: number;
  intent: ToastIntent;
  title: string;
  description?: string;
}

interface ToastContextValue {
  push: (t: Omit<ToastItem, "id">) => void;
  success: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warn: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const SEVERITY: Record<ToastIntent, "success" | "info" | "warning" | "error"> = {
  success: "success",
  info: "info",
  warn: "warning",
  error: "error",
};

type ToastView = { current: ToastItem | null; queue: ToastItem[] };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<ToastView>({ current: null, queue: [] });
  const idRef = useRef(0);

  const push = useCallback((t: Omit<ToastItem, "id">) => {
    idRef.current += 1;
    const item: ToastItem = { ...t, id: idRef.current };
    setView(s => {
      if (!s.current) return { current: item, queue: s.queue };
      return { current: s.current, queue: [...s.queue, item] };
    });
  }, []);

  const close = useCallback(() => {
    setView(s => {
      if (s.queue.length === 0) return { current: null, queue: [] };
      return { current: s.queue[0]!, queue: s.queue.slice(1) };
    });
  }, []);

  const current = view.current;

  const api = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ intent: "success", title, description }),
      info:    (title, description) => push({ intent: "info",    title, description }),
      warn:    (title, description) => push({ intent: "warn",    title, description }),
      error:   (title, description) => push({ intent: "error",   title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        open={!!current}
        onClose={(_, reason) => {
          if (reason === "clickaway") return;
          close();
        }}
        autoHideDuration={4000}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {current ? (
          <Alert
            severity={SEVERITY[current.intent]}
            variant="filled"
            onClose={close}
            sx={{
              maxWidth: 420,
              minWidth: 280,
              alignItems: "flex-start",
              borderRadius: "12px",
              boxShadow: "0 12px 32px rgba(15,23,42,0.18)",
              "& .MuiAlert-message": { paddingTop: "4px" },
            }}
          >
            <div className="text-[13.5px] font-semibold leading-5">{current.title}</div>
            {current.description && (
              <div className="text-[12.5px] opacity-90 leading-[17px] mt-0.5">
                {current.description}
              </div>
            )}
          </Alert>
        ) : (
          <div />
        )}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail soft — returning a no-op API keeps pages working if the provider
    // is missing (e.g. storybook / isolated test).
    const noop = () => undefined;
    return { push: noop, success: noop, info: noop, warn: noop, error: noop };
  }
  return ctx;
}
