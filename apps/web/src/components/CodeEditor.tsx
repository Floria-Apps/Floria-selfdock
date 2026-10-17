import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { yaml } from '@codemirror/lang-yaml';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';

export type EditorLanguage = 'yaml' | 'env';
export interface EditorProblem { line?: number; col?: number; level: 'error' | 'warning' | 'info'; message: string }

const MONO = "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace";

/** Syntax highlighting for .env files: NAME=value, # comments and ${VAR} references. */
const envLanguage = StreamLanguage.define<{ value: boolean }>({
  startState: () => ({ value: false }),
  token(stream, state) {
    if (stream.sol()) state.value = false;
    if (!state.value) {
      if (stream.match(/^\s*#.*/)) return 'comment';
      if (stream.match(/^\s*(export\s+)?[A-Za-z_][A-Za-z0-9_.-]*/)) return 'propertyName';
      if (stream.eat('=')) { state.value = true; return 'operator'; }
      stream.next();
      return null;
    }
    if (stream.match(/^\$\{[^}]*\}/) || stream.match(/^\$[A-Za-z_][A-Za-z0-9_]*/)) return 'variableName';
    if (stream.match(/^\s+#.*/)) return 'comment';
    if (stream.match(/^[^$\s#]+|^\s+/)) return 'string';
    stream.next();
    return 'string';
  },
});

/** Colours come from CSS variables, so the editor follows the dashboard's dynamic colour and light/dark theme. */
const highlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment], color: 'var(--on-surface-variant)', fontStyle: 'italic' },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: 'var(--primary)' },
  { tag: [t.string, t.attributeValue], color: 'var(--tertiary)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--warning)' },
  { tag: [t.keyword, t.meta], color: 'var(--secondary)' },
  { tag: [t.separator, t.operator, t.brace, t.squareBracket], color: 'var(--outline)' },
  { tag: [t.variableName, t.special(t.variableName)], color: 'var(--success)' },
  { tag: t.labelName, color: 'var(--tertiary)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--on-surface)', backgroundColor: 'var(--sc-lowest)', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: MONO, lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--primary)', padding: '8px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)' },
  '.cm-gutters': { backgroundColor: 'var(--sc-low)', color: 'var(--on-surface-variant)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--primary) 6%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in srgb, var(--primary) 28%, transparent)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--tertiary) 22%, transparent)' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--primary) 22%, transparent)', outline: 'none' },
  '.cm-tooltip': { backgroundColor: 'var(--sc-high)', color: 'var(--on-surface)', border: '1px solid var(--outline-variant)', borderRadius: '8px' },
  '.cm-diagnostic': { padding: '6px 10px', fontFamily: 'inherit' },
  '.cm-panels': { backgroundColor: 'var(--sc-high)', color: 'var(--on-surface)' },
  // small dot instead of the default coloured square for hints
  '.cm-lint-marker-info': { content: 'none', width: '8px', height: '8px', margin: '5px 4px', borderRadius: '50%', backgroundColor: 'var(--outline)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' },
});

export function CodeEditor({ value, language, onChange, onSave, problems, ariaLabel, dark, jump }: {
  value: string;
  language: EditorLanguage;
  onChange: (v: string) => void;
  onSave: () => void;
  problems: EditorProblem[];
  ariaLabel: string;
  dark: boolean;
  /** Move the cursor to this position (the `nonce` makes the same position work twice). */
  jump?: { line: number; col: number; nonce: number } | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onSave });
  cb.current = { onChange, onSave };

  useEffect(() => {
    // The editor lives in its own Shadow DOM. <m3e-theme> rewrites document.adoptedStyleSheets, which would
    // silently remove the stylesheet CodeMirror registers there. CSS variables (our colours) still pass through.
    const shadow = host.current!.shadowRoot ?? host.current!.attachShadow({ mode: 'open' });
    shadow.replaceChildren();
    const mount = document.createElement('div');
    mount.style.height = '100%';
    shadow.appendChild(mount);
    const v = new EditorView({
      parent: mount,
      root: shadow,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), history(), drawSelection(), indentOnInput(), bracketMatching(),
          highlightSelectionMatches(), lintGutter(),
          language === 'yaml' ? yaml() : envLanguage,
          syntaxHighlighting(highlight), theme, EditorView.darkTheme.of(dark),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel, spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
          keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { cb.current.onSave(); return true; } },
            ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of(u => { if (u.docChanged) cb.current.onChange(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
    // The editor is created once. Text, problems and cursor moves are pushed in by the effects below.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Text changed from outside (loading, reloading, restoring a version)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  // Problems found by the checker, shown under the code and in the gutter
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const diagnostics: Diagnostic[] = problems.filter(p => p.line).map(p => {
      const line = doc.line(Math.min(Math.max(1, p.line!), doc.lines));
      const from = Math.min(line.to, line.from + Math.max(0, (p.col ?? 1) - 1));
      return { from, to: Math.max(from, line.to), severity: p.level, message: p.message };
    });
    v.dispatch(setDiagnostics(v.state, diagnostics));
  }, [problems]);

  useEffect(() => {
    const v = view.current;
    if (!v || !jump) return;
    const line = v.state.doc.line(Math.min(Math.max(1, jump.line), v.state.doc.lines));
    const pos = Math.min(line.to, line.from + Math.max(0, jump.col - 1));
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    v.focus();
  }, [jump?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="h-full" />;
}
