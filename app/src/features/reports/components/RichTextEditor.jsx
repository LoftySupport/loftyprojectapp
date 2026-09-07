import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p','br','b','strong','i','em','u','s','strike','h1','h2','h3','ul','ol','li','blockquote','a','code','pre','input','span','div'];
// `style` is allowed but heavily filtered — see the hook below. Without it,
// alignment, colour and font size were all stripped on save, which is why
// those controls appeared to do nothing.
const ALLOWED_ATTR = ['href','target','rel','type','checked','data-checklist','style'];

// The only CSS anyone needs to write a formatted note, and nothing that can
// position, load or reveal anything: no url(), no background images, no
// positioning. Anything not on this list is dropped rather than trusted.
const ALLOWED_STYLE_PROPS = new Set([
  'text-align', 'color', 'background-color',
  'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration',
]);

// <input> is allowed only as a checklist checkbox — strip anything else.
DOMPurify.addHook('uponSanitizeElement', (node) => {
  if (node.tagName === 'INPUT' && node.getAttribute('type') !== 'checkbox') {
    node.parentNode?.removeChild(node);
  }
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!node.getAttribute || !node.hasAttribute('style')) return;
  const kept = [];
  for (const decl of node.getAttribute('style').split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    // Belt and braces on top of the property whitelist: nothing that fetches,
    // and nothing that could carry a nested expression.
    if (/url\s*\(|expression|javascript:|@import/i.test(val)) continue;
    kept.push(`${prop}: ${val}`);
  }
  if (kept.length) node.setAttribute('style', kept.join('; '));
  else node.removeAttribute('style');
});

export function sanitizeHtml(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

// execCommand's fontSize only speaks the seven legacy steps, so these are
// named for what they are rather than given a px value the browser would
// ignore. styleWithCSS turns them into a real `font-size` on a span.
const RTE_SIZES = [
  { value: '2', label: 'Small' },
  { value: '3', label: 'Normal' },
  { value: '5', label: 'Large' },
  { value: '7', label: 'Huge' },
];

const RTE_ALIGNMENTS = [
  { cmd: 'justifyLeft', glyph: '\u2261', title: 'Align left' },
  { cmd: 'justifyCenter', glyph: '\u2632', title: 'Centre' },
  { cmd: 'justifyRight', glyph: '\u2263', title: 'Align right' },
  { cmd: 'justifyFull', glyph: '\u2637', title: 'Justify' },
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  minHeight = 240,
  maxHeight = 480,
  className = '',
  saveDebounceMs = 600,
  /**
   * What "Insert field" offers: `[{ value, label, group }]`, supplied by the host.
   *
   * Empty or absent hides the control entirely. This component knows a token is
   * `{{value}}` and nothing else about it — which fields exist, and what they mean, is
   * the app's business.
   */
  tokens = [],
  /**
   * What "Insert snippet" offers: `[{ value, label, html, group }]`, supplied by the host.
   *
   * Same rule as `tokens`: empty or absent hides the control. This component knows a
   * snippet is a piece of html to drop in at the caret and nothing else — where they are
   * kept, who may see one and whether a manager has signed it off are the app's business.
   */
  snippets = [],
  /**
   * Called with the html the author wants to keep, if the host offers snippet-saving.
   *
   * Absent hides the button. The host does the naming and the storing; all this decides
   * is WHICH html — the selection when there is one, the whole block when there is not.
   */
  onSaveSnippet = null,
}) {
  const editorRef = useRef(null);
  const lastSavedRef = useRef(value || '');
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== (value || '')) {
      editorRef.current.innerHTML = value || '';
      lastSavedRef.current = value || '';
    }
  }, [value]);

  const flush = () => {
    if (!editorRef.current) return;
    const html = sanitizeHtml(editorRef.current.innerHTML);
    if (html === lastSavedRef.current) return;
    lastSavedRef.current = html;
    onChange(html);
  };

  const scheduleSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flush, saveDebounceMs);
  };

  // Flush on unmount.
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    flush();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    // styleWithCSS makes execCommand emit `<span style="color: …">` rather
    // than the legacy `<font color>`, which is the form the sanitiser keeps
    // and the form that survives a round-trip through the saved blob.
    try { document.execCommand('styleWithCSS', false, true); } catch { /* not supported — the legacy form still works for bold/italic */ }
    document.execCommand(cmd, false, val);
    scheduleSave();
  };
  const formatBlock = (tag) => exec('formatBlock', tag);
  const insertLink = () => {
    const url = prompt('Link URL');
    if (!url) return;
    exec('createLink', url);
  };
  const insertChecklist = () => {
    exec('insertHTML', '<ul data-checklist="true"><li><input type="checkbox">&nbsp;</li></ul>');
  };
  // Checkbox state lives in the `checked` ATTRIBUTE (the DOM property alone
  // doesn't serialise through innerHTML), so toggle the attribute on click.
  const handleEditorClick = (e) => {
    const t = e.target;
    if (t?.tagName === 'INPUT' && t.type === 'checkbox') {
      if (t.hasAttribute('checked')) t.removeAttribute('checked');
      else t.setAttribute('checked', '');
      scheduleSave();
    }
  };

  /**
   * Put `{{key}}` where the caret is.
   *
   * `insertText` rather than `insertHTML`: the token is literal characters, and letting
   * the browser insert markup here is how a `<span>` ends up wrapped round half of it
   * after the next edit.
   *
   * The editor is focused first, and this one is DEFENSIVE RATHER THAN PROVEN. A real
   * click on a <select> moves focus to it, and `execCommand` acts on the document's
   * selection — so without this the insert should land nowhere. `check:builder-dnd`
   * does not demonstrate that: Playwright's `selectOption` dispatches the change without
   * the focus move a mouse makes, so the check passes with this line commented out.
   *
   * Kept because the reasoning holds for a real pointer and the call costs nothing.
   * Written down as unproven so nobody later reads a confident comment and trusts it.
   */
  const insertToken = (key) => {
    if (!key) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('insertText', false, `{{${key}}}`);
    scheduleSave();
  };

  /**
   * Drop a snippet's wording in at the caret.
   *
   * `insertHTML` and not `insertText`, because the whole point of a snippet is that it
   * keeps its formatting — a sign-off with a bolded name arrives bolded. It goes through
   * the same sanitiser as everything else on the way in: a snippet is html that came from
   * the app's own store, which is exactly the sort of provenance that feels trustworthy
   * right up until somebody writes a row by hand.
   *
   * A COPY, NOT A REFERENCE. That is the difference between a snippet and a library
   * section, and it is a decision rather than an implementation detail — see 0098. Once
   * this lands the text is the document's own, and editing the snippet afterwards leaves
   * every letter already written exactly as it was sent.
   */
  const insertSnippet = (id) => {
    if (!id) return;
    const found = snippets.find(sn => sn.value === id);
    if (!found?.html) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('insertHTML', false, sanitizeHtml(found.html));
    scheduleSave();
  };

  /**
   * WHAT GETS SAVED: the selection, or the whole block when there is none.
   *
   * Selecting a paragraph and keeping that is the common case; but somebody who has just
   * written a two-line sign-off and wants to keep it should not have to select it first,
   * and a button that silently did nothing on an empty selection would look broken.
   *
   * `onMouseDown` with `preventDefault` on the button is NOT what makes the first case
   * work, and the comment here said it was until the mutation was run. A DOM Selection is
   * document-wide and survives focus moving to a button, so removing the handler leaves
   * "saving one keeps the selection" green — the selection is still readable from here.
   *
   * What it does earn is the line after it in `check:builder-dnd`: without it the click
   * focuses the button, and the next thing the author types goes nowhere. Somebody who
   * keeps a sign-off and carries on writing should not have to click back into the text
   * first. Watched both ways.
   */
  const saveSnippet = () => {
    const el = editorRef.current;
    if (!el || !onSaveSnippet) return;
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    let html = '';
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      // Only a selection that is actually inside THIS editor. Two blocks open at once
      // and a selection left in the other one would otherwise be saved from here.
      if (el.contains(range.commonAncestorContainer)) {
        const holder = document.createElement('div');
        holder.appendChild(range.cloneContents());
        html = holder.innerHTML;
      }
    }
    if (!html) html = el.innerHTML;
    const clean = sanitizeHtml(html);
    if (!clean.trim()) return;
    onSaveSnippet(clean);
  };

  const tbBtn = 'px-2 py-1 text-xs rounded text-neutral-700 hover:bg-neutral-100 border border-transparent hover:border-neutral-200';

  return (
    <div className={className}>
      <div className="flex items-center gap-0.5 flex-wrap mb-2 border border-neutral-200 rounded-md p-1 bg-neutral-50">
        <button type="button" onClick={() => exec('bold')} className={tbBtn} title="Bold"><b>B</b></button>
        <button type="button" onClick={() => exec('italic')} className={tbBtn} title="Italic"><i>I</i></button>
        <button type="button" onClick={() => exec('underline')} className={tbBtn} title="Underline"><u>U</u></button>
        <button type="button" onClick={() => exec('strikeThrough')} className={tbBtn} title="Strikethrough"><s>S</s></button>
        <div className="h-4 w-px bg-neutral-200 mx-1" />
        <button type="button" onClick={() => formatBlock('H1')} className={tbBtn}>H1</button>
        <button type="button" onClick={() => formatBlock('H2')} className={tbBtn}>H2</button>
        <button type="button" onClick={() => formatBlock('H3')} className={tbBtn}>H3</button>
        <button type="button" onClick={() => formatBlock('P')} className={tbBtn}>¶</button>
        <div className="h-4 w-px bg-neutral-200 mx-1" />
        <button type="button" onClick={() => exec('insertUnorderedList')} className={tbBtn}>• List</button>
        <button type="button" onClick={() => exec('insertOrderedList')} className={tbBtn}>1. List</button>
        <button type="button" onClick={insertChecklist} className={tbBtn} title="Checklist">☑ Todo</button>
        <button type="button" onClick={() => formatBlock('BLOCKQUOTE')} className={tbBtn}>❝</button>

        {/* Only when the host offers fields. A menu with nothing in it is a control that
            promises something the screen cannot do. */}
        {tokens.length > 0 && (
          <select
            className={`${tbBtn} max-w-[150px]`}
            value=""
            aria-label="Insert a field"
            title="Insert a field — it fills in with this document's record"
            onChange={e => { insertToken(e.target.value); e.target.value = ''; }}
          >
            <option value="">Insert field…</option>
            {[...new Set(tokens.map(t => t.group || 'Fields'))].map(group => (
              <optgroup key={group} label={group}>
                {tokens.filter(t => (t.group || 'Fields') === group).map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        {/* Same rule as the field menu: only when the host has snippets to offer. */}
        {snippets.length > 0 && (
          <select
            className={`${tbBtn} max-w-[150px]`}
            value=""
            aria-label="Insert a snippet"
            title="Insert saved wording — a copy, yours to edit"
            onChange={e => { insertSnippet(e.target.value); e.target.value = ''; }}
          >
            <option value="">Insert snippet…</option>
            {[...new Set(snippets.map(sn => sn.group || 'Snippets'))].map(group => (
              <optgroup key={group} label={group}>
                {snippets.filter(sn => (sn.group || 'Snippets') === group).map(sn => (
                  <option key={sn.value} value={sn.value}>{sn.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        {onSaveSnippet && (
          <button
            type="button"
            className={tbBtn}
            title="Save the selected wording as a snippet you can reuse"
            aria-label="Save as snippet"
            data-save-snippet
            onMouseDown={e => e.preventDefault()}
            onClick={saveSnippet}
          >
            Save snippet
          </button>
        )}
        <div className="h-4 w-px bg-neutral-200 mx-1" />
        {/* Alignment, size and colour were missing entirely — and even if they
            had been here they would have done nothing, because the sanitiser
            stripped every `style` attribute on save. */}
        {RTE_ALIGNMENTS.map(a => (
          <button key={a.cmd} type="button" onClick={() => exec(a.cmd)} className={tbBtn} title={a.title} aria-label={a.title}>{a.glyph}</button>
        ))}
        <div className="h-4 w-px bg-neutral-200 mx-1" />
        <select
          onChange={(e) => { if (e.target.value) { exec('fontSize', e.target.value); e.target.selectedIndex = 0; } }}
          className="text-xs border border-neutral-200 rounded px-1 py-1 bg-white text-[#00393f]"
          title="Text size"
          aria-label="Text size"
          defaultValue=""
        >
          <option value="" disabled>Size</option>
          {RTE_SIZES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
        </select>
        <label className={tbBtn + ' inline-flex items-center gap-1 cursor-pointer'} title="Text colour">
          <span className="w-3 h-3 rounded-sm border border-neutral-300" style={{ background: 'currentColor' }} />
          A
          <input
            type="color"
            onChange={(e) => exec('foreColor', e.target.value)}
            className="w-0 h-0 opacity-0 absolute"
            aria-label="Text colour"
          />
        </label>
        <label className={tbBtn + ' inline-flex items-center gap-1 cursor-pointer'} title="Highlight">
          <span className="w-3 h-3 rounded-sm border border-neutral-300 bg-[#fef08a]" />
          <input
            type="color"
            defaultValue="#fef08a"
            onChange={(e) => exec('hiliteColor', e.target.value)}
            className="w-0 h-0 opacity-0 absolute"
            aria-label="Highlight colour"
          />
        </label>
        <div className="h-4 w-px bg-neutral-200 mx-1" />
        <button type="button" onClick={insertLink} className={tbBtn}>Link</button>
        <button type="button" onClick={() => exec('removeFormat')} className={tbBtn}>Clear</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={scheduleSave}
        onClick={handleEditorClick}
        onBlur={flush}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        className="notes-editor border border-slate-200 rounded-md p-3 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#00393f] focus:border-[#00393f] overflow-y-auto"
        style={{ minHeight, maxHeight }}
        data-placeholder={placeholder}
      />
    </div>
  );
}
