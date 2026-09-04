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
