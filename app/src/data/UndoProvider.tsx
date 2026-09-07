import {
  createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode
} from "react";
import { useToasts } from "../components/Toasts";
import { useDataRefresh } from "./DataProvider";
import { undoHistory, type UndoStep } from "./undoHistory";

/**
 * Undo and redo, for the edits that happen in place — the React side.
 *
 * Amber, 7 September: *"add the undo and redo bar to the top navigation"*. Most writes in
 * this app save on change — pick a team, the job moves; pick a person, the job is theirs —
 * and a save-on-change control has no Cancel. This is the Cancel, after the fact.
 *
 * WHERE THE STEPS COME FROM. Not from the screens. The first version asked each screen to
 * register its own step, and six did; the other forty-odd writes recorded nothing, and
 * Amber's first edit was one of those (*"it didn't let me undo it"*). Steps are now
 * recorded by the repository itself — `undoableRepository.ts` wraps every patch-shaped
 * write, reads the record first, and records the inverse — into a plain store,
 * `undoHistory.ts`. This provider is the binding: it reads that store for the bar, drives
 * it from the keyboard, says what happened in a toast, and tells `DataProvider` to
 * re-read, so every screen on the page shows the record as it now is.
 *
 * It is NOT offered for the acts that already confirm: a lifecycle move is forwards-only
 * by rule; deleting asks first. Only a write the wrapper knows the inverse of gets a step,
 * so the bar's disabled state is honest — "nothing to undo" means nothing undoable
 * happened, not that the app forgot.
 *
 * Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y) drive it — except while somebody is typing in a
 * field with text in it, where the browser's own undo of typing is the one they expect. A
 * dropdown's empty search box does not count: after picking a team the focus is still in
 * it, and "Ctrl+Z does nothing after a pick" was the first thing tried.
 */

interface UndoApi {
  /** For a write the seam cannot see — none today. Kept so a screen can, if it must. */
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

export function useUndo(): UndoApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useUndo needs UndoProvider above it.");
  return api;
}

/** Whether a key press belongs to somebody typing — where the browser's own undo wins. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const input = el as HTMLInputElement;
    const textual = !["checkbox", "radio", "button", "submit", "range", "file"].includes(input.type);
    return textual && input.value !== "";
  }
  return false;
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const { toast } = useToasts();
  const refresh = useDataRefresh();
  const state = useSyncExternalStore(undoHistory.subscribe, undoHistory.getState, undoHistory.getState);

  const undo = useCallback(async () => {
    try {
      const step = await undoHistory.undo();
      if (!step) return;
      refresh();
      toast(`Undone: ${step.label}`, "normal");
    } catch (e) {
      toast(`Could not undo — ${e instanceof Error ? e.message : String(e)}`, "warning");
    }
  }, [toast, refresh]);

  const redo = useCallback(async () => {
    try {
      const step = await undoHistory.redo();
      if (!step) return;
      refresh();
      toast(`Redone: ${step.label}`, "normal");
    } catch (e) {
      toast(`Could not redo — ${e instanceof Error ? e.message : String(e)}`, "warning");
    }
  }, [toast, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (typing(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); void undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); void redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const api = useMemo<UndoApi>(() => ({
    record: undoHistory.record,
    undo, redo,
    busy: state.busy,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undoLabel: state.past[state.past.length - 1]?.label ?? null,
    redoLabel: state.future[state.future.length - 1]?.label ?? null
  }), [undo, redo, state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
