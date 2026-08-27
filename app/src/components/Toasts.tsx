import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Toast } from "@vibe/core";
import "./ui.css";

/**
 * Success toasts, fired sparingly — the prototype's restraint was a decision, kept:
 * multi-record writes and things that complete off-screen get one; an ordinary save
 * whose result is visible right where you did it does not. Errors never come through
 * here — they stay inline and verbatim (`Problem`/`LoadProblem`), because an error
 * that auto-dismisses in five seconds is an error nobody got to read.
 */

type ToastTone = "positive" | "normal" | "warning";

interface ToastsApi {
  toast: (message: string, tone?: ToastTone) => void;
}

const Ctx = createContext<ToastsApi | null>(null);

export function useToasts(): ToastsApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToasts needs ToastsProvider above it.");
  return api;
}

export function ToastsProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ message: string; tone: ToastTone; key: number } | null>(null);

  // One at a time, newest wins — a queue of stale successes is noise, not news.
  const toast = useCallback((message: string, tone: ToastTone = "positive") => {
    setCurrent({ message, tone, key: Date.now() });
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {current && (
        <Toast
          key={current.key}
          open
          type={current.tone}
          autoHideDuration={5000}
          onClose={() => setCurrent(null)}
          className="app-toast"
        >
          {current.message}
        </Toast>
      )}
    </Ctx.Provider>
  );
}
