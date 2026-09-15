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
//
// INTEGRATION EDIT (see features/reports/README.md). Both pickers narrow as you type
// once the list is long enough to need it. Amber, 4 September: *"with any of the
// dropdowns (eg which job) in the record properties it should be able to start typing
// like the suburb bar in the address and it pulls up the record"*.
//
// A native <select> of every job at Lofty is a scroll, not a choice, and it gets worse
// with every job. The threshold is deliberate: below it a search box is one more thing
// between you and four options.

import React, { useMemo, useRef, useState } from 'react';
import RichTextEditor from './RichTextEditor.jsx';

const inputCls = 'w-full border border-neutral-200 rounded-lg px-2.5 py-1.5 text-sm text-[#00393f] focus:outline-none focus:border-[#00393f]';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1';

/**
 * Pick or drop an image file, or paste a URL — whichever the person has.
 *
 * WHY BOTH, AND WHY THE URL BOX STAYS
 *
 *   The block took a URL and nothing else, which meant hosting the picture somewhere
 *   first. Uploading is the fix. But a URL is still a legitimate answer — a logo already
 *   on the website, an image somebody was given a link to — and removing the box to make
 *   the upload look tidier would take away the one path that needs no round trip.
 *
 * The upload itself belongs to the host. This component knows a file goes in and a URL
 * comes back, and nothing about buckets, permissions or who may upload — the same
 * boundary `tokens`, `snippets` and `expandSection` sit on. No `ctx.uploadImage`, no
 * upload control: the URL box alone, which is exactly what this was before.
 */
function ImageField({ field, value, set, ctx }) {
  const upload = typeof ctx?.uploadImage === 'function' ? ctx.uploadImage : null;
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState(null);
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef(null);

  const take = async (file) => {
    if (!file || !upload) return;
    // Checked here as well as by the bucket, because the bucket's refusal arrives as a
    // storage error after the whole file has gone up a site connection. This one is
    // instant and says the same thing.
    if (!file.type?.startsWith('image/')) {
      setProblem(`${file.name} is not an image.`);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      set(await upload(file));
    } catch (e) {
      // Verbatim. "Too large" and "wrong type" are different problems with different
      // fixes, and a single "upload failed" would hide which one this is.
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={field.label} hint={field.hint}>
      {upload && (
        <div
          /* The drop target is the whole box, and it is also a button: dragging a file
             is not available to somebody using a keyboard, and an upload only reachable
             by drag would be an upload some people do not have. */
          role="button"
          tabIndex={0}
          data-image-drop
          onClick={() => inputRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer?.files?.[0]); }}
          className={`w-full mb-2 rounded-lg border border-dashed px-3 py-4 text-center text-xs cursor-pointer ${
            over ? 'border-[#00393f] bg-[#00393f]/5' : 'border-neutral-300 text-neutral-500 hover:border-neutral-400'
          }`}
        >
          {busy ? 'Uploading…' : 'Drop an image here, or click to choose one'}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
      )}

      {problem && <p className="text-[11px] text-red-600 mb-2" role="alert">{problem}</p>}

      <input
        value={value ?? ''}
        onChange={e => set(e.target.value)}
        placeholder={field.placeholder || 'https://…'}
        aria-label={field.label}
        className={inputCls}
      />

      {/* The picture itself, once there is one. A URL in a box is not something anybody
          can check; a thumbnail is. A broken link hides the img rather than leaving the
          browser's torn-page icon, which reads as a bug in the builder. */}
      {value && (
        <img
          src={value}
          alt=""
          className="mt-2 max-h-32 rounded border border-neutral-200"
          onError={e => { e.currentTarget.style.display = 'none'; }}
          onLoad={e => { e.currentTarget.style.display = ''; }}
        />
      )}
    </Field>
  );
}

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
  // INTEGRATION EDIT — the same search the single picker gained, for the same reason: a
  // checkbox list of every job is a scroll. Ticked items stay visible while a filter is
  // active (the reorder strip above, or the pinned rows below), so narrowing the list
  // never hides what you have already chosen.
  const [query, setQuery] = useState('');
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
      {options.length >= SEARCH_FROM && (
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${String(field.label || 'options').toLowerCase()}…`}
          className={`${inputCls} mb-1.5`}
          aria-label={`Search ${field.label}`}
        />
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
        {options.length > 0 && matching(options, query).length === 0 && (
          <p className="text-[11px] text-neutral-400 italic">Nothing matches “{query}”.</p>
        )}
        {/* Anything already ticked stays listed even when the filter excludes it, so
            narrowing the list can never quietly hide a choice you have made. */}
        {options.filter(o => matching(options, query).includes(o) || selected.includes(o.value)).map(o => (
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

function TableEditor({ options, onChange, tokens = [] }) {
  const headers = options.headers?.length ? options.headers : ['Column 1'];
  const rows = options.rows?.length ? options.rows : [['']];

  // WHICH BOX THE FIELD GOES INTO. A cell is an <input>, so there is no caret to insert
  // at once focus has moved to the dropdown — the last input touched is remembered on
  // focus instead, and the token is spliced in at the selection it had when it was left.
  // Without this the menu would need a cell picked from a second list, which is a worse
  // version of the click somebody already made.
  const lastCell = useRef(null);

  const insertToken = (key) => {
    const at = lastCell.current;
    if (!at || !key) return;
    const el = at.el;
    const current = String(at.get() ?? '');
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const token = `{{${key}}}`;
    at.set(current.slice(0, start) + token + current.slice(end));
    // Put the caret after what was just inserted, so a second field lands after the
    // first rather than on top of it.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const to = start + token.length;
      el.setSelectionRange(to, to);
    });
  };

  const setHeader = (ci, v) => onChange({ headers: headers.map((h, i) => (i === ci ? v : h)) });
  const setCell = (ri, ci, v) => onChange({ rows: rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)) });
  const addCol = () => onChange({ headers: [...headers, `Column ${headers.length + 1}`], rows: rows.map(r => [...r, '']) });
  const removeCol = (ci) => onChange({ headers: headers.filter((_, i) => i !== ci), rows: rows.map(r => r.filter((_, i) => i !== ci)) });
  const addRow = () => onChange({ rows: [...rows, headers.map(() => '')] });
  const removeRow = (ri) => onChange({ rows: rows.filter((_, i) => i !== ri) });

  return (
    <div className="space-y-3">
      {/* Amber, 10 September: *"how do i add a single property … in a table"*. The same
          field list the rich-text toolbar offers, because a table full of hand-typed
          addresses goes stale the moment one of them changes on the record. Hidden when
          there is nothing to insert — a library entry has no record to read. */}
      {tokens.length > 0 && (
        <label className="block">
          <span className="text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide block">Insert a field</span>
          <select
            className={inputCls}
            value=""
            aria-label="Insert a field into the last cell you were editing"
            onChange={e => { insertToken(e.target.value); e.target.value = ''; }}
          >
            <option value="">Choose a field…</option>
            {[...new Set(tokens.map(t => t.group))].map(group => (
              <optgroup key={group} label={group}>
                {tokens.filter(t => t.group === group).map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="text-[10px] text-neutral-400 mt-1 block">
            Goes into the last cell or header you were typing in. It fills with the
            record's value when the document renders.
          </span>
        </label>
      )}
      <div>
        <p className="text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">Column headers</p>
        {headers.map((h, ci) => (
          <div key={ci} className="flex gap-1 mb-1">
            <input
              value={h}
              onChange={e => setHeader(ci, e.target.value)}
              onFocus={e => { lastCell.current = { el: e.target, get: () => headers[ci], set: v => setHeader(ci, v) }; }}
              className={`${inputCls} flex-1`}
              placeholder={`Column ${ci + 1}`}
            />
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
                <input
                  value={row[ci] ?? ''}
                  onChange={e => setCell(ri, ci, e.target.value)}
                  onFocus={e => { lastCell.current = { el: e.target, get: () => rows[ri]?.[ci] ?? '', set: v => setCell(ri, ci, v) }; }}
                  className={`${inputCls} flex-1`}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        ))}
        <button onClick={addRow} className="text-xs text-[#00393f] underline underline-offset-2">+ Add row</button>
      </div>
    </div>
  );
}

/**
 * How many options before a list is worth searching.
 *
 * Eight fits in the panel without scrolling, so below this a search box costs a click
 * and saves nothing. Above it you are scrolling a list of job numbers.
 */
const SEARCH_FROM = 8;

const matching = (options, q) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return options;
  return options.filter(o => String(o.label ?? '').toLowerCase().includes(needle));
};

/**
 * A single-choice picker you can type into.
 *
 * Not a native <select>, because a native select cannot be filtered — its own type-ahead
 * matches only the START of an option, so "Corner" never finds "1042-001 — 28 Corner
 * Street". This matches on any part of the label, which is what somebody typing a street
 * name expects.
 */
function SearchSelect({ field, value, options, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const chosen = options.find(o => o.value === value) || null;
  const shown = matching(options, query);

  // A blur that is really a click on an option must not close the list before the click
  // lands. Cancelled on focus, so tabbing back in does not lose the list.
  const closeSoon = () => { closeTimer.current = setTimeout(() => setOpen(false), 120); };
  const keepOpen = () => { clearTimeout(closeTimer.current); setOpen(true); };

  const pick = (v) => { onChange(v); setQuery(''); setOpen(false); };

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <input
          value={open ? query : (chosen?.label ?? '')}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={keepOpen}
          onBlur={closeSoon}
          placeholder={chosen ? chosen.label : (field.emptyLabel || 'Type to search…')}
          className={inputCls}
          role="combobox"
          aria-expanded={open}
          aria-label={field.label}
        />
        {chosen && field.allowEmpty !== false && (
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => pick(null)}
            className="px-1.5 py-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 text-sm leading-none shrink-0"
            aria-label={`Clear ${field.label}`}
          >×</button>
        )}
      </div>
      {open && (
        <ul
          className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-neutral-200 rounded-lg shadow-lg py-1"
          onMouseDown={keepOpen}
        >
          {shown.length === 0 ? (
            <li className="px-2.5 py-1.5 text-[11px] text-neutral-400 italic">Nothing matches “{query}”.</li>
          ) : shown.map(o => (
            <li key={o.value}>
              <button
                onClick={() => pick(o.value)}
                className={`w-full text-left px-2.5 py-1.5 text-sm hover:bg-[#f5f6f8] ${o.value === value ? 'font-semibold text-[#00393f]' : 'text-neutral-700'}`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
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
      // Long lists get the searchable picker; short ones keep the native select, which
      // is lighter, works on a phone's own picker UI, and needs no filtering.
      if (choices.length >= SEARCH_FROM || field.searchable) {
        return (
          <Field label={field.label} hint={field.hint}>
            <SearchSelect field={field} value={value ?? null} options={choices} onChange={set} />
            {choices.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1 leading-snug">
                {field.emptyHint || 'Nothing available to pick yet.'}
              </p>
            )}
          </Field>
        );
      }
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
    case 'image':
      return <ImageField field={field} value={value} set={set} ctx={ctx} />;
    case 'richtext':
      return (
        <Field label={field.label} hint={field.hint || 'Tip: you can also edit this text directly in the document.'}>
          {/* INTEGRATION EDIT — the host's fields, for the "Insert field" menu. Absent
              on a host that supplies none, which hides the control. */}
          <RichTextEditor
            value={value || ''}
            onChange={set}
            tokens={ctx?.textTokens || []}
            snippets={ctx?.textSnippets || []}
            onSaveSnippet={ctx?.saveTextSnippet}
          />
        </Field>
      );
    case 'table':
      return <TableEditor options={options} onChange={onSet} tokens={ctx?.textTokens || []} />;
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
