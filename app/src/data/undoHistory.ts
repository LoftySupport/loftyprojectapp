/**
 * The undo stack — plain state, no React.
 *
 * A module rather than a context so that BOTH ends can reach it without being related in
 * the tree: the repository seam (`undoableRepository.ts`, created by `DataProvider` at the
 * top of the app) records steps into it, and the header's bar (`UndoProvider`, inside the
 * shell several providers down) reads and drives it. It is the one piece of app state that
 * has to be shared between a data layer and a piece of chrome, and a context would have
 * had to be hoisted above `DataProvider` to serve both — which is the wrong way round for
 * something that only exists because writes happen.
 *
 * The stack is per tab and dies with a reload, which is right: the inverse of a write is
 * only known to the code that made it, and a stale inverse applied to a record somebody
 * else has since changed would be worse than no undo at all.
 */

export interface UndoStep {
  /** What the bar says it will take back — "Job 1042-01: assignee". Short, no verb. */
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export interface UndoState {
  past: readonly UndoStep[];
  future: readonly UndoStep[];
  busy: boolean;
}

/** Fifty is more than anybody walks back through; the cap is so a long day is not a leak. */
const DEPTH = 50;

let state: UndoState = { past: [], future: [], busy: false };
const listeners = new Set<() => void>();

function set(next: UndoState) {
  state = next;
  listeners.forEach(l => l());
}

export const undoHistory = {
  getState: (): UndoState => state,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  /** A new step. It also ends the redo branch, as every editor does — redoing a step from
   *  before this edit would reapply a value on top of a record that has moved on. */
  record(step: UndoStep) {
    set({ ...state, past: [...state.past.slice(-(DEPTH - 1)), step], future: [] });
  },

  /** Take the last step back. Resolves to the step undone, or null when there was none.
   *  Throws what the inverse write threw — the caller decides how to say it. */
  async undo(): Promise<UndoStep | null> {
    const step = state.past[state.past.length - 1];
    if (!step || state.busy) return null;
    set({ ...state, busy: true });
    try {
      await step.undo();
      set({ past: state.past.slice(0, -1), future: [...state.future, step], busy: false });
      return step;
    } catch (e) {
      set({ ...state, busy: false });
      throw e;
    }
  },

  async redo(): Promise<UndoStep | null> {
    const step = state.future[state.future.length - 1];
    if (!step || state.busy) return null;
    set({ ...state, busy: true });
    try {
      await step.redo();
      set({ past: [...state.past, step], future: state.future.slice(0, -1), busy: false });
      return step;
    } catch (e) {
      set({ ...state, busy: false });
      throw e;
    }
  },

  /** Tests and the stub harness only. */
  clear() { set({ past: [], future: [], busy: false }); }
};
