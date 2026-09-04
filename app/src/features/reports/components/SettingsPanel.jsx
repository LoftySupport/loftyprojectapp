// SettingsPanel.jsx — the right-side settings panel for the selected block.
//
// Schema-driven on purpose. In the application this was extracted from, the
// panel was a switch statement with one branch per block type, which meant
// adding a block meant editing the builder. Here a block declares its fields
// (registry.js, `settings: [...]`) and this file renders them, so an adapter
// can add a block type without touching any UI code.
//
// Field types: text · textarea · number · checkbox · select · multiselect ·
// richtext · table · custom.

import React, { useMemo } from 'react';
import RichTextEditor from './RichTextEditor.jsx';

const inputCls = 'w-full border border-neutral-200 rounded-lg px-2.5 py-1.5 text-sm text-[#00393f] focus:outline-none focus:border-[#00393f]';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1';

function Field({ label, hint, children }) {
  return (
    <div className="mb-4">
      {label && <label className={labelCls}>{label}</label>}
      {children}
      {hint && <p className="text-[10px] text-neutral-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

/** A field's `options` may be a list or a function of the report context. */
const resolveOptions = (field, ctx) => {
  const raw = typeof field.options === 'function' ? field.options(ctx) : field.options;
  return (raw || []).map(o => (typeof o === 'string' ? { value: o, label: o } : o));
};

// ─── Multi-select, optionally reorderable ────────────────────────────
// Reorderable matters for things like headline stats: the order the author
// chose is information, not incidental.

function MultiSelect({ field, value = [], options, onChange }) {
  const selected = Array.isArray(value) ? value : [];
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= selected.length) return;
    const next = [...selected];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const labelFor = (v) => options.find(o => o.value === v)?.label || v;

  return (
    <>
      {field.reorderable && (
        selected.length ? (
          <div className="space-y-1 mb-3">
            {selected.map((v, i) => (
              <div key={v} className="flex items-center gap-1.5 bg-[#f5f6f8] border border-neutral-200 rounded-lg px-2 py-1">
                <span className="text-xs text-[#00393f] flex-1 truncate">{labelFor(v)}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 rounded hover:bg-neutral-200 disabled:opacity-30 text-[10px] leading-none font-bold" aria-label={`Move ${labelFor(v)} up`}>▲</button>
                <button onClick={() => move(i, 1)} disabled={i === selected.length - 1} className="p-0.5 rounded hover:bg-neutral-200 disabled:opacity-30 text-[10px] leading-none font-bold" aria-label={`Move ${labelFor(v)} down`}>▼</button>
                <button onClick={() => onChange(selected.filter(x => x !== v))} className="p-0.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 text-xs leading-none" aria-label={`Remove ${labelFor(v)}`}>×</button>
              </div>
            ))}
          </div>
        ) : <p className="text-[11px] text-neutral-400 italic px-1 mb-3">Tick items below to add them here, then reorder.</p>
      )}
      <div className="space-y-1 border border-neutral-100 rounded-lg p-2 max-h-56 overflow-y-auto">
        {options.length > 4 && (
          <div className="flex items-center gap-2 pb-1 mb-1 border-b border-neutral-100">
            <button onClick={() => onChange(options.map(o => o.value))} className="text-[10px] font-medium text-[#005058] hover:underline">Select all</button>
            <span className="text-neutral-300">·</span>
            <button onClick={() => onChange([])} className="text-[10px] font-medium text-neutral-500 hover:underline">
              {field.emptyMeansAll ? 'Clear (show all)' : 'Clear'}
            </button>
          </div>
        )}
        {options.length === 0 && <p className="text-[11px] text-neutral-400 italic">Nothing to choose from yet.</p>}
        {options.map(o => (
          <label key={o.value} className="flex items-center gap-2 text-xs text-[#00393f] cursor-pointer select-none py-0.5">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="accent-[#00393f]" />
            {o.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.color }} />}
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </>
  );
}

// ─── Free table editor ───────────────────────────────────────────────

function TableEditor({ options, onChange }) {
  const headers = options.headers?.length ? options.headers : ['Column 1'];
  const rows = options.rows?.length ? options.rows : [['']];

  const setHeader = (ci, v) => onChange({ headers: headers.map((h, i) => (i === ci ? v : h)) });
  const setCell = (ri, ci, v) => onChange({ rows: rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)) });
  const addCol = () => onChange({ headers: [...headers, `Column ${headers.length + 1}`], rows: rows.map(r => [...r, '']) });
  const removeCol = (ci) => onChange({ headers: headers.filter((_, i) => i !== ci), rows: rows.map(r => r.filter((_, i) => i !== ci)) });
  const addRow = () => onChange({ rows: [...rows, headers.map(() => '')] });
  const removeRow = (ri) => onChange({ rows: rows.filter((_, i) => i !== ri) });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">Column headers</p>
        {headers.map((h, ci) => (
          <div key={ci} className="flex gap-1 mb-1">
            <input value={h} onChange={e => setHeader(ci, e.target.value)} className={`${inputCls} flex-1`} placeholder={`Column ${ci + 1}`} />
            {headers.length > 1 && (
              <button onClick={() => removeCol(ci)} className="px-2 py-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 text-sm" aria-label={`Remove column ${ci + 1}`}>×</button>
            )}
          </div>
        ))}
        <button onClick={addCol} className="text-xs text-[#00393f] underline underline-offset-2 mt-1">+ Add column</button>
      </div>
      <div>
        <p className="text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">Rows</p>
        {rows.map((row, ri) => (
          <div key={ri} className="mb-2 border border-neutral-100 rounded-lg p-2 bg-neutral-50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-neutral-400 font-medium">Row {ri + 1}</span>
              {rows.length > 1 && <button onClick={() => removeRow(ri)} className="text-[10px] text-neutral-400 hover:text-red-500">Remove</button>}
            </div>
            {headers.map((h, ci) => (
              <div key={ci} className="flex gap-1.5 items-center mb-1">
                <span className="text-[10px] text-neutral-400 w-16 shrink-0 truncate">{h}</span>
                <input value={row[ci] ?? ''} onChange={e => setCell(ri, ci, e.target.value)} className={`${inputCls} flex-1`} placeholder="—" />
              </div>
            ))}
          </div>
        ))}
        <button onClick={addRow} className="text-xs text-[#00393f] underline underline-offset-2">+ Add row</button>
      </div>
    </div>
  );
}

// ─── One field ───────────────────────────────────────────────────────

function SettingsField({ field, options, ctx, onSet }) {
  const value = options[field.key];
  const set = (v) => onSet({ [field.key]: v });
  const choices = useMemo(
    () => (field.type === 'select' || field.type === 'multiselect' ? resolveOptions(field, ctx) : []),
    [field, ctx],
  );

  switch (field.type) {
    case 'text':
      return (
        <Field label={field.label} hint={field.hint}>
          <input value={value ?? ''} onChange={e => set(e.target.value)} placeholder={field.placeholder || ''} className={inputCls} />
        </Field>
      );
    case 'textarea':
      return (
        <Field label={field.label} hint={field.hint}>
          <textarea value={value ?? ''} onChange={e => set(e.target.value)} rows={field.rows || 4} placeholder={field.placeholder || ''} className={inputCls} />
        </Field>
      );
    case 'number':
      return (
        <Field label={field.label} hint={field.hint}>
          <input type="number" value={value ?? ''} onChange={e => set(e.target.value === '' ? null : Number(e.target.value))} className={inputCls} />
        </Field>
      );
    case 'checkbox':
      return (
        <label className="flex items-start gap-2 text-sm text-[#00393f] cursor-pointer select-none mb-4">
          <input type="checkbox" checked={!!value} onChange={e => set(e.target.checked)} className="accent-[#00393f] mt-0.5" />
          <span>
            {field.label}
            {field.hint && <span className="block text-[10px] text-neutral-400 leading-snug">{field.hint}</span>}
          </span>
        </label>
      );
    case 'select':
      return (
        <Field label={field.label} hint={field.hint}>
          <select value={value ?? ''} onChange={e => set(e.target.value || null)} className={inputCls}>
            {field.allowEmpty !== false && !choices.some(o => o.value === '') && (
              <option value="">{field.emptyLabel || 'Choose…'}</option>
            )}
            {choices.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {choices.length === 0 && (
            <p className="text-[11px] text-amber-600 mt-1 leading-snug">
              {field.emptyHint || 'Nothing available to pick yet.'}
            </p>
          )}
        </Field>
      );
    case 'multiselect':
      return (
        <Field label={field.label} hint={field.hint}>
          <MultiSelect field={field} value={value} options={choices} onChange={set} />
        </Field>
      );
    case 'richtext':
      return (
        <Field label={field.label} hint={field.hint || 'Tip: you can also edit this text directly in the document.'}>
          <RichTextEditor value={value || ''} onChange={set} />
        </Field>
      );
    case 'table':
      return <TableEditor options={options} onChange={onSet} />;
    case 'custom':
      // Escape hatch: an adapter supplies its own control when a field is
      // genuinely unlike the others. Keep these rare.
      return field.render ? field.render({ value, options, ctx, set, onSet, Field, inputCls }) : null;
    default:
      return null;
  }
}

// ─── The panel ───────────────────────────────────────────────────────

export default function SettingsPanel({ widget, definition, ctx, onUpdate, onClose }) {
  const meta = definition || { label: widget.kind, settings: [] };
  const options = widget.options || {};
  const set = (patch) => onUpdate(widget.id, patch);

  const fields = (meta.settings || []).filter(f => (f.visible ? f.visible(options, ctx) : true));

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 w-[320px] max-w-[85vw] bg-white border-l border-neutral-200 shadow-xl md:shadow-none md:static md:z-auto md:w-80 md:shrink-0 overflow-y-auto"
      role="region"
      aria-label={`${meta.label} settings`}
    >
      <div className="sticky top-0 bg-white border-b border-neutral-100 px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-bold text-[#00393f]">{meta.label}</p>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100" aria-label="Close block settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="p-4">
        {fields.length === 0 && !meta.compactable && <p className="text-xs text-neutral-500">No settings for this block.</p>}
        {fields.map(f => (
          <SettingsField key={f.key} field={f} options={options} ctx={ctx} onSet={set} />
        ))}
        {/* "Fit to page" is offered by the engine, not by each block, so every
            wide block gets it consistently. */}
        {meta.compactable && (
          <label className="flex items-center gap-2 text-sm text-[#00393f] cursor-pointer select-none mb-4">
            <input type="checkbox" checked={!!options.compact} onChange={e => set({ compact: e.target.checked })} className="accent-[#00393f]" />
            Fit to page (smaller text, narrower columns)
          </label>
        )}
      </div>
    </aside>
  );
}
