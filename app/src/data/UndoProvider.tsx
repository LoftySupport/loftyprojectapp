import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode
} from "react";
import { useToasts } from "../components/Toasts";

/**
 * Undo and redo, for the edits that happen in place.
 *
 * Amber, 7 September: *"add the undo and redo bar to the top navigation"*. Most writes in
 * this app save on change — pick a team, the job moves; pick a person, the job is theirs
 * — and a save-on-change control has no Cancel. This is the Cancel, after the fact.
 *
 * HOW IT WORKS, AND WHAT IT DELIBERATELY IS NOT
 *
 *   A screen that makes an in-place write hands this provider a `label`, an `undo` and
 *   a `redo` — three things it already knows at the moment it saves: what it is about to
 *   write, and what was there before. Undo is then the same write with the values
 *   swapped, through the same repository method, under the same RLS. Nothing here talks
 *   to the database on its own, and nothing is reverted that the person could not have
 *   changed by hand. A refusal (somebody else took the permission away in between) is a
 *   toast saying so, and the step stays in the stack for a retry.
 *
 *   It is NOT a transaction log, and it is not offered for the acts that already
 *   confirm: moving a job's lifecycle stage is forwards-only by rule and cannot be
 *   undone; deactivating a person asks first and is undone by the same switch. Only a
 *   screen that registers a step gets one, so the bar's disabled state is honest —
 *   "nothing to undo" means nothing undoable happened, not that the app forgot.
 *
 *   The stack is per session and per tab. A page reload clears it, which is right: the
 *   inverse of an edit is only known to the code that made it.
 *
 * Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y) drive it from the keyboard — except while a
 * text field has focus, where the browser's own undo of typing is the one people expect.
 */

export interface UndoStep {
  /** What the bar says it will undo — "Assigned 1042-01 to Deanna". Past tense, short. */
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface UndoApi {
  record: (step: UndoStep) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  /** The label of the step Undo would take back, for the tooltip. */
  undoLabel: string | null;
  redoLabel: string | null;
  busy: boolean;
}

const Ctx = createContext<UndoApi | null>(null);

/** Fifty is more than anybody walks back through; the cap is so a long day is not a leak. */
const DEPTH = 50;

export function useUndo(): UndoApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useUndo needs UndoProvider above it.");
  return api;
}

/** Whether a key press belongs to a text control — where the browser's own undo wins. */
function inTextControl(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const { toast } = useToasts();
  const [past, setPast] = useState<UndoStep[]>([]);
  const [future, setFuture] = useState<UndoStep[]>([]);
  const [busy, setBusy] = useState(false);
  // Read through refs inside the async handlers so a click during a write sees the
  // stack as it is, not as it was when the handler was created.
  const pastRef = useRef(past); pastRef.current = past;
  const futureRef = useRef(future); futureRef.current = future;
  const busyRef = useRef(busy); busyRef.current = busy;

  const record = useCallback((step: UndoStep) => {
    setPast(p => [...p.slice(-(DEPTH - 1)), step]);
    // A new edit ends the redo branch, as every editor does — redoing a step from
    // before the edit would reapply a value on top of a record that has moved on.
    setFuture([]);
  }, []);

  const undo = useCallback(async () => {
    const step = pastRef.current[pastRef.current.length - 1];
    if (!step || busyRef.current) return;
    setBusy(true);
    try {
      await step.undo();
      setPast(p => p.slice(0, -1));
      setFuture(f => [...f, step]);
      toast(`Undone: ${step.label}`, "normal");
    } catch (e) {
      toast(`Could not undo — ${e instanceof Error ? e.message : String(e)}`, "warning");
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const redo = useCallback(async () => {
    const step = futureRef.current[futureRef.current.length - 1];
    if (!step || busyRef.current) return;
    setBusy(true);
    try {
      await step.redo();
      setFuture(f => f.slice(0, -1));
      setPast(p => [...p, step]);
      toast(`Redone: ${step.label}`, "normal");
    } catch (e) {
      toast(`Could not redo — ${e instanceof Error ? e.message : String(e)}`, "warning");
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (inTextControl(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); void undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); void redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const api = useMemo<UndoApi>(() => ({
    record, undo, redo, busy,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past[past.length - 1]?.label ?? null,
    redoLabel: future[future.length - 1]?.label ?? null
  }), [record, undo, redo, busy, past, future]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
