import { useState, useEffect, useCallback, useRef } from 'react';
import { emojify } from 'node-emoji';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import SuperscriptBase from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlock from '@tiptap/extension-code-block';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import UniqueID from '@tiptap/extension-unique-id';
import Toolbar from './components/Toolbar';
import FindBar, { FindBarHandle } from './components/FindBar';
import SearchHighlight from './extensions/SearchHighlight';
import './App.css';

// Extend Superscript so @tiptap/markdown serializes it as <sup>text</sup>
const Superscript = SuperscriptBase.extend({
  renderMarkdown(node: { content?: unknown[] }, { renderChildren }: { renderChildren: (c: unknown[]) => string }) {
    return `<sup>${renderChildren(node.content ?? [])}</sup>`;
  },
});

// ── Footnote helpers ─────────────────────────────────────────────────────────
// Converts GFM footnote syntax ([^id] / [^id]: text) to <sup>N</sup> HTML,
// which Tiptap parses via the Superscript extension's parseHTML rule.
function preprocessFootnotes(md: string, defsOut: Map<string, string>): string {
  defsOut.clear();
  // Normaliza formas corrompidas de round-trips anteriores:
  // <sup>[N](#fn-N)</sup> → [^N]   (gerado quando <a> era embutido no <sup>)
  const input = md.replace(/<sup>\[(\d+)\]\([^)]*\)<\/sup>/g, '[^$1]');
  const idToNum: Record<string, number> = {};
  let counter = 0;
  const defRe = /^\[\^([^\]]+)\]:\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = defRe.exec(input)) !== null) {
    const id = m[1].trim();
    if (!(id in idToNum)) idToNum[id] = ++counter;
    defsOut.set(String(idToNum[id]), m[2].trim());
  }
  // Remove definition lines FIRST, before replacing inline refs
  let out = input.replace(/^\[\^[^\]]+\]:\s*.+\n?/gm, '').trimEnd();
  // Now replace remaining inline refs with plain <sup>N</sup>
  // (NOT <sup><a>N</a></sup> — Tiptap serializes <a> back to [N](href),
  //  breaking the round-trip. Plain <sup>N</sup> survives correctly.)
  out = out.replace(/\[\^([^\]]+)\]/g, (_, id) => {
    const tid = id.trim();
    if (!(tid in idToNum)) idToNum[tid] = ++counter;
    const n = idToNum[tid];
    return `<sup>${n}</sup>`;
  });
  // Append footnote definitions at bottom (no link — plain sup so the DOM effect can detect them)
  if (defsOut.size > 0) {
    out += '\n\n---\n\n';
    defsOut.forEach((text, num) => { out += `<sup>${num}</sup> ${text}\n\n`; });
  }
  return out;
}

// Converts <sup>N</sup> refs back to [^N] and restores definition block.
function postprocessFootnotes(md: string, defs: Map<string, string>): string {
  if (defs.size === 0) return md;
  // Normalize corrupted form from previous round-trips: <sup>[N](href)</sup> → <sup>N</sup>
  let out = md.replace(/<sup>\[(\d+)\]\([^)]*\)<\/sup>/g, '<sup>$1</sup>');
  // Convert inline refs back
  out = out.replace(/<sup>(\d+)<\/sup>/g, '[^$1]');
  // Remove the footnote definitions block we appended (after the last ---)
  // Pattern: \n\n---\n\n followed by [^N] lines
  out = out.replace(/\n{1,2}---\n{1,2}(\[\^\d+\][^\n]*\n*)+$/gm, '');
  out = out.trimEnd() + '\n\n';
  defs.forEach((text, num) => { out += `[^${num}]: ${text}\n`; });
  return out.trimEnd();
}

// Converte shortcodes :emoji_name: em caracteres Unicode reais
// Preserva shortcodes que não existem (ex: :custom:) sem modificar
const preprocessEmojis = (md: string): string => emojify(md, { fallback: (code) => `:${code}:` });

// Gera slug a partir de texto (preserva acentos do português)
const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w\s\u00C0-\u024F-]/g, '').replace(/\s+/g, '-').replace(/^-+|-+$/g, '');

const initialMarkdownContent = '# Welcome to Paperditor\n\nStart typing...';

// ── Sincronização de cursor/scroll entre modo Visual e Source ──────────────────
// Mapeia posições do ProseMirror para offsets no texto markdown correlacionando
// o conteúdo de cada nó de texto do documento com a string markdown, via busca de
// substring sequencial (sempre avançando o cursor de busca, nunca retrocedendo,
// já que os runs de texto aparecem na mesma ordem em ambas as representações).
// Um run de texto nunca tem sintaxe markdown misturada NELE MESMO — só ao redor/
// entre runs (prefixo "# " de heading, marcadores de lista "- ", `código`,
// **negrito** etc.) — então a busca acha a posição exata de cada run; só o
// intervalo ENTRE dois runs (a sintaxe que os separa) precisa de interpolação
// linear. Isso é muito mais preciso que aproximar um bloco inteiro por uma única
// fração (abordagem anterior), que confundia itens diferentes de uma lista entre
// si e não corrigia marcações inline (código/negrito/link) dentro de um parágrafo.
interface PositionBreakpoint { pmPos: number; textOffset: number }

function buildPositionMap(doc: PMNode, text: string): PositionBreakpoint[] {
  const breakpoints: PositionBreakpoint[] = [{ pmPos: 0, textOffset: 0 }];
  let searchCursor = 0;
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const found = text.indexOf(node.text, searchCursor);
      if (found !== -1) {
        breakpoints.push({ pmPos: pos, textOffset: found });
        breakpoints.push({ pmPos: pos + node.text.length, textOffset: found + node.text.length });
        searchCursor = found + node.text.length;
      }
    }
    return true;
  });
  breakpoints.push({ pmPos: doc.content.size, textOffset: text.length });
  return breakpoints;
}

function interpolateBreakpoints(
  breakpoints: PositionBreakpoint[],
  value: number,
  key: keyof PositionBreakpoint,
  want: keyof PositionBreakpoint
): number {
  let lo = breakpoints[0];
  let hi = breakpoints[breakpoints.length - 1];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    if (breakpoints[i][key] <= value && breakpoints[i + 1][key] >= value) {
      lo = breakpoints[i];
      hi = breakpoints[i + 1];
      break;
    }
  }
  if (hi[key] === lo[key]) return lo[want];
  const t = (value - lo[key]) / (hi[key] - lo[key]);
  return Math.round(lo[want] + t * (hi[want] - lo[want]));
}

function pmPosToTextOffset(breakpoints: PositionBreakpoint[], pmPos: number): number {
  return interpolateBreakpoints(breakpoints, pmPos, 'pmPos', 'textOffset');
}

function textOffsetToPmPos(breakpoints: PositionBreakpoint[], textOffset: number): number {
  return interpolateBreakpoints(breakpoints, textOffset, 'textOffset', 'pmPos');
}

// Aplica no editor a seleção correspondente ao intervalo [start,end) do texto mapeado.
function applySelectionFromTextOffsets(editor: Editor, breakpoints: PositionBreakpoint[], start: number, end: number) {
  const { doc } = editor.state;
  if (doc.content.size === 0) return;
  const clamp = (p: number) => Math.min(Math.max(p, 0), doc.content.size);
  const resolvedFrom = TextSelection.near(doc.resolve(clamp(textOffsetToPmPos(breakpoints, start)))).from;
  const resolvedTo = TextSelection.near(doc.resolve(clamp(textOffsetToPmPos(breakpoints, end)))).from;
  const from = Math.min(resolvedFrom, resolvedTo);
  const to = Math.max(resolvedFrom, resolvedTo);
  editor.commands.setTextSelection({ from, to });
}

function App() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark';
  });
  const [filePath, setFilePath] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState(initialMarkdownContent);
  const [isMarkdownMode, setIsMarkdownMode] = useState(() => {
    return localStorage.getItem('editorMode') === 'markdown';
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isCtrlHeld, setIsCtrlHeld] = useState(false);
  const [showFindBar, setShowFindBar] = useState(false);
  const findBarRef = useRef<FindBarHandle>(null);
  const showFindBarRef = useRef(false); // ref para evitar stale closure no keydown handler
  const suppressDirty = useRef(true); // começa true para ignorar o onUpdate inicial do Tiptap
  const footnoteDefsRef = useRef<Map<string, string>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sourceWrapRef = useRef<HTMLDivElement>(null);
  const pendingSourceSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const pendingVisualFocusRef = useRef(false);

  const editor = useEditor({
    extensions: [
      UniqueID.configure({
        types: ['heading', 'paragraph'],
      }),
      StarterKit.configure({
        codeBlock: false,
        horizontalRule: false,
      }),
      Markdown,
      Highlight,
      Superscript,
      Subscript,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'editor-link',
          target: '_self',
          rel: null,
        },
      }),
      Image,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      TextAlign.configure({
        types: ['heading', 'paragraph', 'tableCell', 'tableHeader'],
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CodeBlock,
      HorizontalRule,
      Placeholder.configure({
        placeholder: 'Start typing your markdown here...',
      }),
      SearchHighlight,
    ],
    content: initialMarkdownContent,
    contentType: 'markdown',
    onUpdate: () => {
      if (!suppressDirty.current) setIsDirty(true);
    },
    onCreate: () => {
      // Libera o suppressor após a montagem inicial para não bloquear edições do usuário
      suppressDirty.current = false;
    },
  });

  // Título da janela com indicador de alterações
  useEffect(() => {
    const fileName = filePath ? filePath.split(/[\\/]/).pop() ?? 'Untitled' : 'Untitled';
    document.title = `${isDirty ? '• ' : ''}${fileName} — Paperditor`;
  }, [isDirty, filePath]);

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Aplica o atributo data-theme no <html> para o CSS reagir ao tema
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const getMarkdownFromEditor = useCallback(() => {
    if (!editor) return '';
    return editor.getMarkdown();
  }, [editor]);

  // Conteúdo a persistir em disco: em modo Source já está pronto; em modo Visual
  // precisa reconverter as notas de rodapé de <sup>N</sup> de volta para [^N]/[^N]: texto
  // (mesma conversão que handleToggleMode faz ao ir para Source) — sem isso, salvar
  // direto do modo Visual grava HTML de <sup> em vez da sintaxe markdown de rodapé.
  const getContentToSave = useCallback(() => {
    if (isMarkdownMode) return markdownContent;
    const rawMd = getMarkdownFromEditor();
    return postprocessFootnotes(rawMd, footnoteDefsRef.current);
  }, [isMarkdownMode, markdownContent, getMarkdownFromEditor]);

  const generatePrintHtml = useCallback(() => {
    if (!editor) return '';
    const htmlBody = editor.getHTML();
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; line-height: 1.7; font-size: 16px; color: #24292e; }
    h1 { font-size: 2em; font-weight: 700; margin: 0.67em 0 0.5em; padding-bottom: 0.3em; border-bottom: 1px solid #e1e4e8; }
    h2 { font-size: 1.5em; font-weight: 600; margin: 0.83em 0 0.5em; padding-bottom: 0.2em; border-bottom: 1px solid #e1e4e8; }
    h3 { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; }
    p { margin: 1em 0; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Consolas, monospace; font-size: 0.9em; }
    pre { background: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 1em 0; }
    pre code { background: transparent; padding: 0; }
    blockquote { border-left: 4px solid #0366d6; padding-left: 1em; color: #6a737d; margin: 1em 0; }
    ul, ol { padding-left: 2em; margin: 1em 0; }
    li { margin: 0.25em 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    td, th { border: 1px solid #e1e4e8; padding: 8px 12px; }
    th { background: #f6f8fa; font-weight: 600; }
    hr { border: none; border-top: 1px solid #e1e4e8; margin: 1.5em 0; }
    a { color: #0366d6; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    s { text-decoration: line-through; }
    mark { background: #fff3cd; }
  </style>
</head><body>${htmlBody}</body>
</html>`;
  }, [editor]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI) return false;
    const content = getContentToSave();
    const result = await window.electronAPI.ipcRenderer.invoke('dialog:saveFile', {
      content,
      path: filePath,
    }) as string | null;
    if (result) {
      setFilePath(result);
      setMarkdownContent(content);
      setIsDirty(false);
      return true;
    }
    return false;
  }, [filePath, getContentToSave]);

  const handleSaveAs = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI) return false;
    const content = getContentToSave();
    const result = await window.electronAPI.ipcRenderer.invoke('dialog:saveFile', {
      content,
      path: null,
    }) as string | null;
    if (result) {
      setFilePath(result);
      setMarkdownContent(content);
      setIsDirty(false);
      return true;
    }
    return false;
  }, [getContentToSave]);

  const checkUnsaved = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    if (!window.electronAPI) return true;
    const result = await window.electronAPI.ipcRenderer.invoke('dialog:showUnsavedDialog') as 'save' | 'discard' | 'cancel';
    if (result === 'save') return await handleSave();
    return result === 'discard';
  }, [isDirty, handleSave]);

  const handleNew = useCallback(async () => {
    const canProceed = await checkUnsaved();
    if (!canProceed) return;
    // Limpa notas de rodapé do arquivo anterior: sem isso, postprocessFootnotes
    // (chamado ao alternar para o modo Source) reanexa as definições antigas
    // no fim do documento novo, mesmo que ele não tenha nenhuma nota.
    footnoteDefsRef.current.clear();
    suppressDirty.current = true;
    if (editor) editor.commands.setContent(initialMarkdownContent, { contentType: 'markdown' });
    suppressDirty.current = false;
    setMarkdownContent(initialMarkdownContent);
    setFilePath(null);
    setIsDirty(false);
    window.electronAPI?.ipcRenderer.invoke('file:new');
  }, [checkUnsaved, editor]);

  const handleOpen = useCallback(async () => {
    const canProceed = await checkUnsaved();
    if (!canProceed) return;
    if (!window.electronAPI || !editor) return;
    const result = await window.electronAPI.ipcRenderer.invoke('dialog:openFile') as {
      content: string;
      path: string;
    } | null;
    if (result) {
      openFileContent(result.content, result.path);
    }
  }, [checkUnsaved, editor]);

  const openFileContent = useCallback((content: string, path: string) => {
    if (!editor) return;
    suppressDirty.current = true;
    const withEmoji = preprocessEmojis(content);
    const processed = preprocessFootnotes(withEmoji, footnoteDefsRef.current);
    editor.commands.setContent(processed, { contentType: 'markdown' });
    suppressDirty.current = false;
    setMarkdownContent(content);
    setFilePath(path);
    setIsDirty(false);
  }, [editor]);

  useEffect(() => {
    if (!window.electronAPI || !editor) return;

    const unsubs = [
      window.electronAPI.ipcRenderer.on('file:opened', (...args: unknown[]) => {
        const data = args[0] as { content: string; path: string } | undefined;
        if (data) {
          openFileContent(data.content, data.path);
        }
      }),
    ];
    return () => unsubs.forEach(fn => fn?.());
  }, [editor, openFileContent]);

  const handleExportPdf = useCallback(async () => {
    if (!window.electronAPI || !editor) return;
    if (isMarkdownMode) {
      suppressDirty.current = true;
      editor.commands.setContent(preprocessFootnotes(markdownContent, footnoteDefsRef.current), { contentType: 'markdown' });
      suppressDirty.current = false;
    }
    const htmlContent = generatePrintHtml();
    await window.electronAPI.ipcRenderer.invoke('dialog:exportPdf', { htmlContent });
  }, [editor, isMarkdownMode, markdownContent, generatePrintHtml]);

  const handlePrint = useCallback(async () => {
    if (!window.electronAPI || !editor) return;
    if (isMarkdownMode) {
      suppressDirty.current = true;
      editor.commands.setContent(preprocessFootnotes(markdownContent, footnoteDefsRef.current), { contentType: 'markdown' });
      suppressDirty.current = false;
    }
    const htmlContent = generatePrintHtml();
    await window.electronAPI.ipcRenderer.invoke('dialog:print', { htmlContent });
  }, [editor, isMarkdownMode, markdownContent, generatePrintHtml]);

  const handleToggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const handleToggleMode = useCallback(() => {
    if (!isMarkdownMode) {
      // Visual → Source: converte conteúdo do Tiptap para markdown, e calcula em que
      // offsets do texto markdown resultante a seleção (ou só o cursor) deve cair.
      const rawMd = getMarkdownFromEditor();
      const md = postprocessFootnotes(rawMd, footnoteDefsRef.current);
      if (editor) {
        const { from, to } = editor.state.selection;
        const breakpoints = buildPositionMap(editor.state.doc, md);
        const start = pmPosToTextOffset(breakpoints, from);
        const end = pmPosToTextOffset(breakpoints, to);
        pendingSourceSelectionRef.current = { start: Math.min(start, end), end: Math.max(start, end) };
      }
      setMarkdownContent(md);
      setIsMarkdownMode(true);
      localStorage.setItem('editorMode', 'markdown');
    } else {
      // Source → Visual: carrega o markdown no editor Tiptap e já aplica a seleção
      // equivalente (a posição em si não depende do DOM estar montado — só focar e
      // rolar até ela precisam esperar o remount do EditorContent, feito no efeito abaixo).
      const textarea = textareaRef.current;
      const selStart = textarea ? textarea.selectionStart : 0;
      const selEnd = textarea ? textarea.selectionEnd : 0;
      if (editor) {
        suppressDirty.current = true;
        const withEmoji = preprocessEmojis(markdownContent);
        const processed = preprocessFootnotes(withEmoji, footnoteDefsRef.current);
        editor.commands.setContent(processed, { contentType: 'markdown' });
        suppressDirty.current = false;

        const breakpoints = buildPositionMap(editor.state.doc, markdownContent);
        applySelectionFromTextOffsets(editor, breakpoints, selStart, selEnd);
        pendingVisualFocusRef.current = true;
      }
      setIsMarkdownMode(false);
      localStorage.setItem('editorMode', 'visual');
    }
  }, [isMarkdownMode, getMarkdownFromEditor, editor, markdownContent]);

  // Restaura seleção + rolagem do textarea ao entrar em modo Source vindo do modo Visual.
  useEffect(() => {
    if (!isMarkdownMode) return;
    const pending = pendingSourceSelectionRef.current;
    pendingSourceSelectionRef.current = null;
    if (!pending) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(pending.start, pending.end);
    // Textareas não rolam sozinhas até uma posição definida via setSelectionRange
    // (só rolam ao digitar/usar setas) — por isso calculamos o scrollTop manualmente.
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    const lineNumber = textarea.value.slice(0, pending.start).split('\n').length - 1;
    textarea.scrollTop = Math.max(0, lineNumber * lineHeight - textarea.clientHeight / 2);
  }, [isMarkdownMode]);

  // Foca e rola até a seleção do editor Tiptap (já aplicada em handleToggleMode) assim
  // que o EditorContent remonta ao entrar em modo Visual vindo do modo Source.
  useEffect(() => {
    if (isMarkdownMode || !editor) return;
    if (!pendingVisualFocusRef.current) return;
    pendingVisualFocusRef.current = false;
    editor.chain().focus().scrollIntoView().run();
  }, [isMarkdownMode, editor]);

  const handleMarkdownChange = useCallback((value: string) => {
    setMarkdownContent(value);
    setIsDirty(true);
  }, []);

  // Mantém ref sincronizada com o estado para uso em event handlers (evita stale closure)
  showFindBarRef.current = showFindBar;

  // ── Rastreia tecla Ctrl para cursor de mãozinha em links internos ────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      console.log('[App] onKeyDown:', e.key, 'ctrlKey:', e.ctrlKey, 'metaKey:', e.metaKey);
      if (e.key === 'Control' || e.metaKey) setIsCtrlHeld(true);
      // Ctrl+F / Cmd+F — abre a barra de busca
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        console.log('[App] Ctrl+F detectado, showFindBarRef.current:', showFindBarRef.current);
        if (showFindBarRef.current) {
          console.log('[App] FindBar já aberta, focando input');
          findBarRef.current?.focusInput();
        } else {
          console.log('[App] Abrindo FindBar (Ctrl+F)');
          setShowFindBar(true);
        }
      }
      // Ctrl+; / Ctrl+' / Ctrl+" — alterna entre modo código-fonte e visual.
      // Usa e.code (posição física da tecla) além de e.key porque em alguns layouts
      // de teclado (ex: ABNT2) a tecla ' pode não produzir e.key === "'".
      if ((e.ctrlKey || e.metaKey) && (e.key === ';' || e.key === "'" || e.key === '"' || e.code === 'Quote')) {
        e.preventDefault();
        handleToggleMode();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Control' || e.metaKey) setIsCtrlHeld(false); };
    const onBlur = () => setIsCtrlHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleToggleMode]);

  // ── Gera IDs nos headings e nas definições de notas de rodapé ──────────
  useEffect(() => {
    if (!editor || isMarkdownMode) return;
    const updateIds = () => {
      // Heading anchors
      document.querySelectorAll('.ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6')
        .forEach((el) => {
          const id = slugify(el.textContent ?? '');
          if (id) (el as HTMLElement).id = id;
        });
      // Footnote definition anchors: paragraphs whose FIRST child (including text nodes)
      // is a plain <sup>N</sup>. Using firstChild (not firstElementChild) so paragraphs
      // like "texto <sup>1</sup>" are NOT mistaken for definitions.
      document.querySelectorAll('.ProseMirror p').forEach((el) => {
        const firstChild = el.firstChild;
        if (firstChild?.nodeName === 'SUP' && !(firstChild as Element).querySelector?.('a')) {
          const num = (firstChild as Element).textContent?.trim();
          if (num && /^\d+$/.test(num)) {
            (el as HTMLElement).id = `fn-${num}`;
          }
        }
      });
    };
    updateIds();
    editor.on('update', updateIds);
    return () => { editor.off('update', updateIds); };
  }, [editor, isMarkdownMode]);

  // ── Handler de clique em links (Ctrl+clique para navegar) ───────────────────
  const handleEditorClick = useCallback(async (e: React.MouseEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;

    // 1. Notas de rodapé: <sup>N</sup> (inline ref sem <a>)
    const sup = (e.target as HTMLElement).closest('sup') as HTMLElement | null;
    if (sup) {
      const num = sup.textContent?.trim();
      if (num && /^\d+$/.test(num)) {
        // Encontra o parágrafo de definição: firstChild (incluindo texto) deve ser <sup>N</sup>
        // (firstElementChild não serve pois ignora textos antes do <sup>)
        for (const p of document.querySelectorAll('.ProseMirror p')) {
          const firstChild = p.firstChild;
          if (firstChild?.nodeName === 'SUP' && (firstChild as Element).textContent?.trim() === num) {
            p.scrollIntoView({ behavior: 'smooth' });
            break;
          }
        }
      }
      return;
    }

    // 2. Links <a href>
    const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;
    e.preventDefault();
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      const targetSlug = href.slice(1);
      // Busca heading pelo texto slugificado (ProseMirror apaga atributos externos)
      let target: Element | null = null;
      for (const h of document.querySelectorAll(
        '.ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6'
      )) {
        if (slugify(h.textContent ?? '') === targetSlug) { target = h; break; }
      }
      target?.scrollIntoView({ behavior: 'smooth' });
    } else if (/^https?:\/\//.test(href)) {
      await window.electronAPI?.ipcRenderer.invoke('shell:openExternal', href);
    } else if (window.electronAPI) {
      const result = await window.electronAPI.ipcRenderer.invoke('file:open', href) as { content: string; path: string } | null;
      if (result) openFileContent(result.content, result.path);
    }
  }, [openFileContent]);

  // Mantém referência sempre atualizada dos handlers para os listeners de menu
  const handlersRef = useRef<{
    handleNew: () => void;
    handleOpen: () => void;
    handleSave: () => void;
    handleSaveAs: () => void;
    handleExportPdf: () => void;
    handlePrint: () => void;
    checkUnsaved: () => Promise<boolean>;
  }>({} as never);

  useEffect(() => {
    handlersRef.current = { handleNew, handleOpen, handleSave, handleSaveAs, handleExportPdf, handlePrint, checkUnsaved };
  });

  // Subscrições de menu e fechar janela (executado uma vez)
  useEffect(() => {
    if (!window.electronAPI) return;
    const unsubs = [
      window.electronAPI.ipcRenderer.on('menu:new', () => handlersRef.current.handleNew()),
      window.electronAPI.ipcRenderer.on('menu:open', () => handlersRef.current.handleOpen()),
      window.electronAPI.ipcRenderer.on('menu:save', () => handlersRef.current.handleSave()),
      window.electronAPI.ipcRenderer.on('menu:saveAs', () => handlersRef.current.handleSaveAs()),
      window.electronAPI.ipcRenderer.on('menu:exportPdf', () => handlersRef.current.handleExportPdf()),
      window.electronAPI.ipcRenderer.on('menu:print', () => handlersRef.current.handlePrint()),
      window.electronAPI.ipcRenderer.on('app:close-requested', async () => {
        const canClose = await handlersRef.current.checkUnsaved();
        if (canClose) {
          await window.electronAPI!.ipcRenderer.invoke('app:confirmClose');
        }
      }),
    ];
    return () => unsubs.forEach(fn => fn?.());
  }, []);

  if (!editor) {
    return null;
  }

  return (
    <div className="app">
      {showFindBar && (
        <FindBar
          ref={findBarRef}
          editor={editor}
          isMarkdownMode={isMarkdownMode}
          markdownContent={markdownContent}
          textareaRef={textareaRef}
          sourceWrapRef={sourceWrapRef}
          onClose={() => setShowFindBar(false)}
        />
      )}
      <Toolbar
        editor={editor}
        onOpen={handleOpen}
        onSave={handleSave}
        onExportPdf={handleExportPdf}
        onPrint={handlePrint}
        onToggleTheme={handleToggleTheme}
        onToggleMode={handleToggleMode}
        isDark={isDark}
        isMarkdownMode={isMarkdownMode}
        isDirty={isDirty}
      />
      <main className="main-content">
        {isMarkdownMode ? (
          <div className="markdown-source">
            <div className="markdown-source__editor-wrap" ref={sourceWrapRef}>
              <textarea
                ref={textareaRef}
                value={markdownContent}
                onChange={(e) => handleMarkdownChange(e.target.value)}
                placeholder="Digite seu markdown aqui..."
              />
            </div>
          </div>
        ) : (
          <div className={`tiptap-editor${isCtrlHeld ? ' ctrl-held' : ''}`} onClick={handleEditorClick}>
            <EditorContent editor={editor} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;