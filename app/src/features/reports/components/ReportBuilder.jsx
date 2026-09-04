// ReportBuilder.jsx — the drag-and-drop report builder.
//
// Full-screen surface: a palette of blocks on the left, the live document in
// the centre, a settings panel for the selected block on the right. Text blocks
// hold their content; data blocks hold a reference resolved against live
// context on every render, so a reopened report always shows current numbers.
//
// "Preview & Export" compiles the block list into a report model and hands it
// to ReportOverlay, so print, PDF, Word, Markdown, HTML and the share page all
// come from one pipeline.
//
// Everything app-specific arrives through props:
//   engine  the bound registry + engine (core/widgetEngine.js)
//   store   persistence and sharing (see docs/CONTRACTS.md)
//   ctx     whatever the registered blocks read from

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReportOverlay, { ReportBlocks } from './ReportDocument.jsx';
import { BUILT_IN_THEMES, DEFAULT_THEME_KEY, resolveTheme } from '../core/theme.js';
import SettingsPanel from './SettingsPanel.jsx';
import RichTextEditor from './RichTextEditor.jsx';
import { IconEye, IconGripVertical, IconPlus, IconTrash } from './icons.jsx';

const PALETTE_PREFIX = 'palette:';

// ─── Palette ─────────────────────────────────────────────────────────

function PaletteCard({ kind, meta, onAdd }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PALETTE_PREFIX}${kind}`,
    data: { paletteKind: kind },
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onAdd(kind)}
      className={`w-full text-left border border-neutral-200 rounded-lg px-2.5 py-2 bg-white hover:border-[#00393f] transition-colors cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
      title={`${meta.hint} — drag into the report, or click to add at the end`}
    >
      <span className="block text-xs font-semibold text-[#00393f]">{meta.label}</span>
      <span className="block text-[10px] text-neutral-400 leading-snug mt-0.5">{meta.hint}</span>
    </button>
  );
}

function Palette({ registry, onAdd }) {
  return (
    <div className="p-3 space-y-4">
      {registry.groups.map(group => (
        <div key={group}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">{group}</p>
          <div className="space-y-1.5">
            {registry.kindsInGroup(group).map(k => (
              <PaletteCard key={k} kind={k} meta={registry.get(k)} onAdd={onAdd} />
            ))}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-neutral-400 leading-relaxed">
        Section headings split the document — everything after a heading (until the next one) becomes that section.
      </p>
    </div>
  );
}

// ─── Widget preview (memoised — text edits shouldn't re-resolve tables) ──

const WidgetPreview = React.memo(function WidgetPreview({ widget, engine, ctx, theme, onRepick }) {
  const blocks = useMemo(() => engine.resolve(widget, ctx), [engine, widget, ctx]);
  return <ReportBlocks blocks={blocks} theme={theme} onRepick={onRepick} />;
});

// ─── Sortable widget row ─────────────────────────────────────────────

function SortableWidget({ widget, engine, ctx, theme, selected, onSelect, onUpdate, onRemove, onMove, isFirst, isLast }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const meta = engine.registry.get(widget.kind) || { label: widget.kind };
  const isHeading = widget.kind === 'heading';
  const isText = widget.kind === 'text';
  // Stale-reference callouts in the preview are clickable: select this block
  // so the settings panel opens for a re-pick. Stable per widget id — the
  // memoised WidgetPreview must not re-render on unrelated state changes.
  const repick = useCallback(() => onSelect(widget.id), [onSelect, widget.id]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(e) => { e.stopPropagation(); onSelect(widget.id); }}
      className={`group relative rounded-lg -mx-3 px-3 py-1.5 border-2 transition-colors cursor-pointer ${
        isDragging ? 'opacity-40' : ''
      } ${selected ? 'border-[#00393f] bg-[#f5f6f8]/60' : 'border-transparent hover:border-[#898A8D]/40'}`}
    >
      {/* Control cluster — always visible on touch, hover-reveal on desktop */}
      <div className={`absolute -top-3 right-2 z-10 flex items-center gap-0.5 bg-[#00393f] text-white rounded-lg px-1 py-0.5 shadow ${selected ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}>
        <span className="text-[9px] font-semibold uppercase tracking-wide px-1 text-white/60 select-none">{meta.label}</span>
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded hover:bg-white/15 cursor-grab active:cursor-grabbing touch-none"
          title="Drag to reorder"
          aria-label={`Reorder ${meta.label} block`}
          onClick={e => e.stopPropagation()}
        >
          <IconGripVertical />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMove(widget.id, -1); }}
          disabled={isFirst}
          className="p-1 rounded hover:bg-white/15 disabled:opacity-30 text-[10px] leading-none font-bold"
          title="Move up" aria-label="Move block up"
        >▲</button>
        <button
          onClick={(e) => { e.stopPropagation(); onMove(widget.id, 1); }}
          disabled={isLast}
          className="p-1 rounded hover:bg-white/15 disabled:opacity-30 text-[10px] leading-none font-bold"
          title="Move down" aria-label="Move block down"
        >▼</button>
        <button
          onClick={(e) => { e.stopPropagation(); if (window.confirm('Remove this block from the report?')) onRemove(widget.id); }}
          className="p-1 rounded hover:bg-white/15 text-[#ffb59f]"
          title="Remove block" aria-label="Remove block"
        >
          <IconTrash />
        </button>
      </div>

      {isHeading ? (
        selected ? (
          <input
            value={widget.options?.text || ''}
            onChange={e => onUpdate(widget.id, { text: e.target.value })}
            onClick={e => e.stopPropagation()}
            placeholder="Section title"
            className="w-full text-lg font-bold text-[#00393f] bg-transparent border-b border-[#898A8D]/40 pb-1 focus:outline-none focus:border-[#00393f]"
            autoFocus
          />
        ) : (
          <h2 className="text-lg font-bold text-[#00393f] pb-1 border-b border-[#898A8D]/30">{widget.options?.text || 'Section'}</h2>
        )
      ) : isText && selected ? (
        <div onClick={e => e.stopPropagation()}>
          <RichTextEditor
            value={widget.options?.html || ''}
            onChange={html => onUpdate(widget.id, { html })}
            placeholder="Write here — summaries, context, recommendations…"
            minHeight={96}
            maxHeight={420}
            saveDebounceMs={300}
          />
        </div>
      ) : (
        <WidgetPreview widget={widget} engine={engine} ctx={ctx} theme={theme} onRepick={repick} />
      )}
    </div>
  );
}

// ─── Settings panel (right slide-out) ────────────────────────────────

const inputCls = 'w-full border border-neutral-200 rounded-lg px-2.5 py-1.5 text-sm bg-white text-[#00393f] focus:outline-none focus:ring-2 focus:ring-[#00393f]/20';
const labelCls = 'block text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-1';

// ─── Share panel ─────────────────────────────────────────────────────
// Used in ReportBuilder (right panel) and ReportsCenter (inline per-card).

export function ReportSharePanel({ report: initialReport, store, onUpdate, onClose, shareUrlBase = '' }) {
  const [rep, setRep] = useState(initialReport);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | creating | revoking | copied | error
  const [errorMsg, setErrorMsg] = useState('');
  const [showPwInput, setShowPwInput] = useState(false);

  // The public route belongs to the host app, so its base is a prop. Default
  // matches the route this package's reference share page registers.
  const base = shareUrlBase || `${window.location.origin}/reports/shared`;
  const previewUrl = rep.shareToken ? `${base}/${rep.shareToken}` : null;

  const handleCreate = async () => {
    setStatus('creating');
    setErrorMsg('');
    try {
      const updated = await store.createShareLink(rep.id, showPwInput ? password : undefined);
      setRep(updated);
      setPassword('');
      setShowPwInput(false);
      onUpdate?.(updated);
      setStatus('idle');
    } catch (e) {
      setErrorMsg(e.message || 'Failed to create share link');
      setStatus('error');
    }
  };

  const handleRevoke = async () => {
    if (!confirm('Revoke this share link? Anyone with the link will lose access.')) return;
    setStatus('revoking');
    try {
      const updated = await store.deleteShareLink(rep.id);
      setRep(updated);
      onUpdate?.(updated);
      setStatus('idle');
    } catch (e) {
      setErrorMsg(e.message || 'Failed to revoke');
      setStatus('error');
    }
  };

  const handleCopy = async () => {
    if (!previewUrl) return;
    try {
      await navigator.clipboard.writeText(previewUrl);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setErrorMsg('Copy failed. Please copy the link manually.');
    }
  };

  return (
    <aside
      className="w-72 shrink-0 bg-white border-l border-neutral-200 overflow-y-auto flex flex-col"
      aria-label="Report share settings"
      role="region"
    >
      <div className="sticky top-0 bg-white border-b border-neutral-100 px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-bold text-[#00393f]">Share report</p>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100" aria-label="Close share panel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
      <div className="p-4 space-y-4 flex-1">
        {rep.shareToken ? (
          <>
            {/* INTEGRATION EDIT (see features/reports/README.md). The module said only
                "anyone with this link can view the compiled report", which leaves out the
                two things somebody sending one to a client needs to know: it stops
                working, and it does not update. Both are Lofty's design rather than the
                module's — the expiry is a database constraint and the snapshot is 0095 —
                but the place a person needs to be told is here. */}
            <p className="text-xs text-[#898A8D]">
              Anyone with this link can view the document. It shows the numbers as they
              were when you made the link and does not update — re-share to send newer
              ones.
              {rep.shareExpiresAt && (
                <> The link stops working on{' '}
                  <strong className="text-[#00393f]">
                    {new Date(rep.shareExpiresAt).toLocaleDateString(undefined, {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </strong>.
                </>
              )}
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={previewUrl}
                className="flex-1 min-w-0 text-[10px] border border-neutral-200 rounded px-2 py-1.5 bg-neutral-50 text-[#00393f] truncate"
                onFocus={e => e.target.select()}
              />
              <button
                onClick={handleCopy}
                disabled={status === 'creating' || status === 'revoking'}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-[#00393f] text-white font-semibold hover:bg-[#005058] transition-colors shrink-0"
              >
                {status === 'copied' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {rep.hasPassword && (
              <p className="text-[10px] text-[#898A8D]">Password protected — viewers must enter a password to open this report.</p>
            )}
            <button
              onClick={handleRevoke}
              disabled={status === 'revoking'}
              className="text-xs text-red-600 hover:underline"
            >
              {status === 'revoking' ? 'Revoking…' : 'Revoke link'}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-[#898A8D]">Create a shareable link so clients or teammates can view this report without logging in.</p>
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#00393f]">
              <input
                type="checkbox"
                checked={showPwInput}
                onChange={e => setShowPwInput(e.target.checked)}
                className="rounded"
              />
              Password protect
            </label>
            {showPwInput && (
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Set a password"
                className="w-full border border-[#898A8D] rounded px-3 py-1.5 text-sm text-[#00393f] focus:outline-none focus:border-[#00393f]"
              />
            )}
            <button
              onClick={handleCreate}
              disabled={status === 'creating' || (showPwInput && !password)}
              className="w-full text-xs px-3 py-2 rounded-lg bg-[#00393f] text-white font-bold hover:bg-[#005058] transition-colors disabled:opacity-50"
            >
              {status === 'creating' ? 'Creating link…' : 'Create share link'}
            </button>
          </>
        )}
        {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
      </div>
    </aside>
  );
}

// ─── Builder ─────────────────────────────────────────────────────────

/**
 * @param {object}   report        { id, title, layout: { widgets, page } }
 * @param {object}   engine        from createReportEngine(registry)
 * @param {object}   store         ReportStore (docs/CONTRACTS.md)
 * @param {object}   ctx           the data your registered blocks resolve against
 * @param {function} onClose
 * @param {function} [onSaved]     called with the saved row after each autosave
 * @param {string}   [branding]    footer text on exported documents
 * @param {object}   [themes]      the themes this app offers, keyed. Defaults
 *                                 to the built-ins; pass your own set to add a
 *                                 theme built from your brand file.
 * @param {string}   [shareUrlBase] public base URL for share links
 * @param {boolean}  [canSaveTemplate] show "Save as template" (needs store.saveTemplate)
 */
export default function ReportBuilder({
  report, engine, store, ctx, onClose, onSaved,
  branding = '', shareUrlBase = '', canSaveTemplate = true,
  themes = BUILT_IN_THEMES,
}) {
  const [title, setTitle] = useState(report.title || 'Untitled report');
  const [widgets, setWidgets] = useState(() => (report.layout?.widgets || []));
  // Page setup (paper size + orientation) is a report-level setting, saved
  // alongside the widget layout so it's remembered next time this report opens.
  const [page, setPage] = useState(() => ({ pageSize: 'a4', orientation: 'portrait', ...(report.layout?.page || {}) }));
  // The theme is a report-level choice, saved with the layout so a report
  // reopens looking as its author left it, and a share link matches.
  const [themeKey, setThemeKey] = useState(() => {
    const saved = report.layout?.theme;
    return saved && (themes[saved] || BUILT_IN_THEMES[saved]) ? saved : DEFAULT_THEME_KEY;
  });
  const activeTheme = useMemo(() => resolveTheme(themeKey, themes), [themeKey, themes]);

  /**
   * How wide the page on screen is, in px, from the paper it is set to.
   *
   * INTEGRATION EDIT. The canvas was `max-w-3xl` — a fixed 768px whatever the page setup
   * said — so choosing Landscape changed the export and left the thing you were looking
   * at portrait. Amber: *"when set to landscape the page doesn't display landscape"*.
   *
   * The scale is pinned to A4 portrait = 768px, which is exactly what `max-w-3xl` gave,
   * so the default view is unchanged to the pixel and only the other combinations move.
   */
  const pageWidth = useMemo(() => {
    const MM = { a4: [210, 297], letter: [216, 279] };
    const [shortSide, longSide] = MM[page.pageSize] || MM.a4;
    const acrossMm = page.orientation === 'landscape' ? longSide : shortSide;
    return Math.round(acrossMm * (768 / 210));
  }, [page.pageSize, page.orientation]);
  const [selectedId, setSelectedId] = useState(null);
  const [preview, setPreview] = useState(null); // compiled report model
  const [saveState, setSaveState] = useState('saved'); // saved | dirty | saving | error
  const [activeDrag, setActiveDrag] = useState(null); // { kind } palette | { widget }
  const [showMobilePalette, setShowMobilePalette] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateSaveStatus, setTemplateSaveStatus] = useState('idle'); // idle | saving | saved | error
  // Mirror report's share state so the panel can update the caller on save
  const [reportRow, setReportRow] = useState(report);
  const templateBtnRef = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const { setNodeRef: setDocRef, isOver: isOverDoc } = useDroppable({ id: 'report-doc' });

  // ── Autosave (debounced; flushed on close/unmount) ──
  const stateRef = useRef({ title, widgets, page, themeKey });
  stateRef.current = { title, widgets, page, themeKey };
  const savedRef = useRef(JSON.stringify({ title, widgets, page, themeKey }));
  const timerRef = useRef(null);

  const saveNow = useCallback(async () => {
    const snapshot = JSON.stringify(stateRef.current);
    if (snapshot === savedRef.current) return;
    setSaveState('saving');
    try {
      const { title: t, widgets: w, page: p, themeKey: th } = stateRef.current;
      const row = await store.save(report.id, { title: t, layout: { widgets: w, page: p, theme: th } });
      savedRef.current = snapshot;
      setSaveState('saved');
      onSaved?.(row);
    } catch (e) {
      console.error('Report autosave failed:', e);
      setSaveState('error');
    }
  }, [report.id, onSaved]);

  useEffect(() => {
    if (JSON.stringify({ title, widgets, page }) === savedRef.current) return;
    setSaveState('dirty');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(saveNow, 900);
    return () => clearTimeout(timerRef.current);
  }, [title, widgets, page, saveNow]);

  // Flush a pending save if the component unmounts mid-debounce.
  useEffect(() => () => { clearTimeout(timerRef.current); saveNow(); }, [saveNow]);

  const close = useCallback(() => { saveNow(); onClose(); }, [saveNow, onClose]);

  // ── Widget ops ──
  const addWidget = useCallback((kind, index = null) => {
    const w = engine.createWidget(kind, ctx);
    if (!w) return;
    setWidgets(prev => {
      const next = [...prev];
      next.splice(index == null ? next.length : index, 0, w);
      return next;
    });
    setSelectedId(w.id);
    setShowMobilePalette(false);
  }, [ctx]);

  const updateWidget = useCallback((id, optionsPatch) => {
    setWidgets(prev => prev.map(w => (w.id === id ? { ...w, options: { ...(w.options || {}), ...optionsPatch } } : w)));
  }, []);

  const removeWidget = useCallback((id) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
    setSelectedId(cur => (cur === id ? null : cur));
  }, []);

  const moveWidget = useCallback((id, dir) => {
    setWidgets(prev => {
      const i = prev.findIndex(w => w.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      return arrayMove(prev, i, j);
    });
  }, []);

  // ── DnD ──
  const onDragStart = (e) => {
    const id = String(e.active.id);
    if (id.startsWith(PALETTE_PREFIX)) setActiveDrag({ kind: id.slice(PALETTE_PREFIX.length) });
    else setActiveDrag({ widget: widgets.find(w => w.id === id) || null });
  };

  const onDragEnd = (e) => {
    setActiveDrag(null);
    const { active, over } = e;
    const activeId = String(active.id);
    if (activeId.startsWith(PALETTE_PREFIX)) {
      if (!over) return; // dropped outside the document
      const kind = activeId.slice(PALETTE_PREFIX.length);
      const overIndex = widgets.findIndex(w => w.id === over.id);
      addWidget(kind, overIndex >= 0 ? overIndex : null);
      return;
    }
    if (over && activeId !== over.id) {
      setWidgets(prev => {
        const from = prev.findIndex(w => w.id === activeId);
        const to = prev.findIndex(w => w.id === over.id);
        if (from < 0 || to < 0) return prev;
        return arrayMove(prev, from, to);
      });
    }
  };

  // ── Keyboard ──
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape' || preview) return;
      // Don't yank focus away from a text field mid-edit.
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
        document.activeElement.blur();
        return;
      }
      if (selectedId) setSelectedId(null);
      else close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [preview, selectedId, close]);

  // A store may implement only persistence. The optional capabilities are
  // feature-detected rather than assumed, so a minimal store still works.
  const canShare = typeof store?.createShareLink === 'function' && typeof store?.deleteShareLink === 'function';

  const selected = widgets.find(w => w.id === selectedId) || null;

  const openPreview = () => {
    saveNow();
    setPreview(engine.compile({ title }, widgets, ctx));
  };

  const handleTemplateSave = useCallback(async () => {
    if (!templateName.trim()) return;
    setTemplateSaveStatus('saving');
    try {
      await store.saveTemplate({
        name: templateName.trim(),
        type: 'report',
        data: { widgets: engine.remapIds(widgets) },
      });
      setTemplateSaveStatus('saved');
      setTimeout(() => {
        setTemplateSaveStatus('idle');
        setShowTemplateSave(false);
      }, 1500);
    } catch (e) {
      console.error('Template save failed:', e);
      setTemplateSaveStatus('error');
    }
  }, [templateName, widgets, engine, store]);

  const saveLabel = { saved: 'Saved', dirty: 'Unsaved changes…', saving: 'Saving…', error: 'Save failed — retrying on next change' }[saveState];

  return createPortal(
    // print:hidden — when the preview overlay prints, only the overlay's
    // document should be on paper, and this builder is portalled outside #root
    // so the overlay's own print isolation doesn't cover it.
    <div className="nokey fixed inset-0 z-[120] bg-[#f5f6f8] flex flex-col print:hidden" role="dialog" aria-modal="true" aria-label={`Report builder — ${title}`}>
      {/* Header */}
      <div className="bg-[#00393f] text-white px-4 py-2 flex items-center gap-2 flex-wrap">
        <button onClick={close} className="p-1.5 rounded-lg hover:bg-white/15 transition-colors shrink-0" title="Back to reports (autosaves)" aria-label="Close report builder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="flex-1 min-w-[140px] bg-transparent text-sm font-semibold text-white border-b border-transparent hover:border-white/30 focus:border-[#f47e63] focus:outline-none px-1 py-0.5"
          aria-label="Report title"
        />
        <span className={`text-[10px] shrink-0 ${saveState === 'error' ? 'text-[#ffb59f] font-semibold' : 'text-white/50'}`}>{saveLabel}</span>
        <button
          onClick={() => setShowMobilePalette(v => !v)}
          className="md:hidden text-xs px-2.5 py-1.5 rounded-lg bg-white/15 border border-white/20 font-semibold flex items-center gap-1"
          aria-expanded={showMobilePalette}
        >
          <IconPlus /> Add block
        </button>
        {/* INTEGRATION EDIT (see features/reports/README.md). The theme lived only in
            Preview & Export, so you chose how the document looked after you had finished
            writing it, and the page you wrote on was never the page you sent. Amber, 4
            September: *"you should be able to choose the theme from the builder page
            (works on preview and export), not just on the preview and export"*.

            It is the same `themeKey` the overlay already reads and writes back through
            onThemeChange, so the two controls are one setting and cannot disagree. */}
        <label className="flex items-center gap-1 text-xs shrink-0">
          <span className="text-white/50 hidden lg:inline">Theme</span>
          <select
            value={themeKey}
            onChange={e => setThemeKey(e.target.value)}
            className="text-xs bg-white/15 border border-white/20 rounded-lg px-2 py-1.5 text-white focus:outline-none [&>option]:text-[#00393f]"
            title="How this document looks, on screen and in every export"
          >
            {Object.entries(themes).map(([key, t]) => (
              <option key={key} value={key}>{t?.label || key}</option>
            ))}
          </select>
        </label>
        {/* Page setup — paper size + orientation, saved with the report */}
        <label className="flex items-center gap-1 text-xs shrink-0">
          <span className="text-white/50 hidden lg:inline">Page</span>
          <select
            value={page.pageSize}
            onChange={e => setPage(p => ({ ...p, pageSize: e.target.value }))}
            className="text-xs bg-white/15 border border-white/20 rounded-lg px-2 py-1.5 text-white focus:outline-none [&>option]:text-[#00393f]"
            title="Paper size — on screen here, and in print, PDF and Word"
          >
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
          <select
            value={page.orientation}
            onChange={e => setPage(p => ({ ...p, orientation: e.target.value }))}
            className="text-xs bg-white/15 border border-white/20 rounded-lg px-2 py-1.5 text-white focus:outline-none [&>option]:text-[#00393f]"
            title="Page orientation — on screen here, and in print, PDF and Word"
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        {/* Share. Optional: hidden unless the store implements share links. */}
        {canShare && (
        <button
          onClick={() => { setShowSharePanel(v => !v); setSelectedId(null); }}
          className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors shrink-0 flex items-center gap-1.5 ${showSharePanel ? 'bg-[#f47e63] text-[#00393f] font-bold' : 'bg-white/15 border border-white/20 text-white font-semibold hover:bg-white/25'}`}
          title="Share this report"
          aria-pressed={showSharePanel}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
        )}
        {/* Save as template. Optional, same reasoning as Share. */}
        {canSaveTemplate && typeof store.saveTemplate === 'function' && (
        <div className="relative shrink-0" ref={templateBtnRef}>
          <button
            onClick={() => {
              setShowTemplateSave(v => !v);
              if (!templateName) setTemplateName(title || 'Untitled report');
            }}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 border border-white/20 text-white font-semibold hover:bg-white/25 transition-colors flex items-center gap-1.5"
            title="Save layout as a reusable template"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save as template
          </button>
          {showTemplateSave && (
            <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-white border border-neutral-200 rounded-xl shadow-2xl p-4">
              <p className="text-xs font-bold text-[#00393f] mb-2">Save as report template</p>
              <p className="text-[10px] text-[#898A8D] mb-3 leading-relaxed">Saves this layout as a reusable template. Project/pipeline references will be re-picked when used in another hub.</p>
              <input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Template name"
                className="w-full border border-neutral-200 rounded-lg px-2.5 py-1.5 text-sm text-[#00393f] focus:outline-none focus:ring-2 focus:ring-[#00393f]/20 mb-3"
                onKeyDown={e => e.key === 'Escape' && setShowTemplateSave(false)}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTemplateSave}
                  disabled={!templateName.trim() || templateSaveStatus === 'saving'}
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-[#00393f] text-white font-bold hover:bg-[#005058] transition-colors disabled:opacity-50"
                >
                  {templateSaveStatus === 'saving' ? 'Saving…' : templateSaveStatus === 'saved' ? 'Saved!' : 'Save template'}
                </button>
                <button
                  onClick={() => setShowTemplateSave(false)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:border-neutral-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {templateSaveStatus === 'error' && <p className="text-xs text-red-600 mt-2">Save failed. Try again.</p>}
            </div>
          )}
        </div>
        )}
        <button
          onClick={openPreview}
          className="text-xs px-3 py-1.5 rounded-lg bg-[#f47e63] text-[#00393f] font-bold hover:bg-[#e06a4d] transition-colors flex items-center gap-1.5 shrink-0"
        >
          <IconEye /> Preview & Export
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveDrag(null)}>
        <div className="flex-1 flex overflow-hidden relative">
          {/* Palette — column on md+, slide-down sheet on mobile */}
          <aside className="hidden md:block w-64 shrink-0 bg-white border-r border-neutral-200 overflow-y-auto">
            <Palette registry={engine.registry} onAdd={(k) => addWidget(k)} />
          </aside>
          {showMobilePalette && (
            <div className="md:hidden absolute inset-x-0 top-0 z-40 bg-white border-b border-neutral-200 shadow-xl max-h-[70%] overflow-y-auto">
              <Palette registry={engine.registry} onAdd={(k) => addWidget(k)} />
            </div>
          )}

          {/* Document */}
          <main className="flex-1 overflow-y-auto overscroll-contain" onClick={() => setSelectedId(null)}>
            <div
              ref={setDocRef}
              style={{ maxWidth: pageWidth }}
              className={`bg-white w-full mx-auto my-6 px-8 py-10 rounded-xl border shadow-sm min-h-[70%] transition-all ${isOverDoc && activeDrag?.kind ? 'border-[#00393f] border-dashed' : 'border-neutral-200'}`}
            >
              <h1 className="text-2xl font-bold text-[#00393f] leading-tight border-b-2 border-[#00393f] pb-4 mb-6">{title || 'Untitled report'}</h1>
              {widgets.length === 0 ? (
                <div className="border-2 border-dashed border-neutral-300 rounded-xl py-16 text-center px-6">
                  <p className="text-sm font-semibold text-[#00393f]">Drag blocks in from the palette</p>
                  <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                    …or click one to add it at the end. Mix headings, text and live data — job and project tables, stage boards, team workload and process health all read the app when the template is used, not when it was written.
                  </p>
                </div>
              ) : (
                <SortableContext items={widgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {widgets.map((w, i) => (
                      <SortableWidget
                        key={w.id}
                        widget={w}
                        engine={engine}
                        ctx={ctx}
                        theme={activeTheme}
                        selected={selectedId === w.id}
                        onSelect={setSelectedId}
                        onUpdate={updateWidget}
                        onRemove={removeWidget}
                        onMove={moveWidget}
                        isFirst={i === 0}
                        isLast={i === widgets.length - 1}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          </main>

          {/* Right panel — share panel or block settings */}
          {showSharePanel ? (
            <ReportSharePanel
              report={reportRow}
              store={store}
              shareUrlBase={shareUrlBase}
              onUpdate={updated => { setReportRow(updated); onSaved?.(updated); }}
              onClose={() => setShowSharePanel(false)}
            />
          ) : selected ? (
            <SettingsPanel widget={selected} definition={engine.registry.get(selected.kind)} ctx={ctx} onUpdate={updateWidget} onClose={() => setSelectedId(null)} />
          ) : null}
        </div>

        <DragOverlay>
          {activeDrag?.kind && (
            <div className="border-2 border-[#00393f] rounded-lg px-3 py-2 bg-white shadow-xl text-xs font-semibold text-[#00393f]">
              {engine.registry.get(activeDrag.kind)?.label}
            </div>
          )}
          {activeDrag?.widget && (
            <div className="border-2 border-[#00393f] rounded-lg px-3 py-2 bg-white shadow-xl text-xs font-semibold text-[#00393f] opacity-90">
              {engine.registry.get(activeDrag.widget.kind)?.label || 'Block'}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {preview && (
        <ReportOverlay
          report={preview}
          onClose={() => setPreview(null)}
          initialPageSize={page.pageSize}
          initialOrientation={page.orientation}
          onPageChange={setPage}
          branding={branding}
          themes={themes}
          initialTheme={themeKey}
          onThemeChange={setThemeKey}
        />
      )}
    </div>,
    document.body
  );
}
