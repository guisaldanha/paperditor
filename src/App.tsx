import { useState, useEffect, useCallback, useRef } from 'react';
import { emojify } from 'node-emoji';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import SuperscriptBase from '@tiptap/extension-superscript';
import SubscriptBase from '@tiptap/extension-subscript';
import Link from '@tiptap/extension-link';
import ImageBase from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockWithCopy from './extensions/CodeBlockWithCopy';
import DivBlock from './extensions/DivBlock';
import ColorSwatch from './extensions/ColorSwatch';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import UniqueID from '@tiptap/extension-unique-id';
import Toolbar from './components/Toolbar';
import FindBar, { FindBarHandle } from './components/FindBar';
import Toc from './components/Toc';
import SearchHighlight from './extensions/SearchHighlight';
import './App.css';

// Extend Superscript so @tiptap/markdown serializes it as <sup>text</sup>
const Superscript = SuperscriptBase.extend({
  renderMarkdown(node: { content?: unknown[] }, { renderChildren }: { renderChildren: (c: unknown[]) => string }) {
    return `<sup>${renderChildren(node.content ?? [])}</sup>`;
  },
});

// Idem para Subscript: sem renderMarkdown próprio, @tiptap/markdown não tem serializador
// padrão pra essa mark — a abertura/fechamento viram string vazia (ver getMarkOpening/
// getMarkClosing em MarkdownManager.ts), então o texto sobrevive mas a tag <sub> some ao salvar.
const Subscript = SubscriptBase.extend({
  renderMarkdown(node: { content?: unknown[] }, { renderChildren }: { renderChildren: (c: unknown[]) => string }) {
    return `<sub>${renderChildren(node.content ?? [])}</sub>`;
  },
});

// Extend Image: quando width/height estão definidos, serializa como <img> HTML em vez
// de ![alt](src). Sintaxe markdown padrão não tem onde guardar dimensões — sem isso,
// qualquer imagem redimensionada (ex: um logo com width="320") perde o tamanho no
// primeiro round-trip por markdown. Imagens sem dimensão continuam saindo como
// ![]() normal (mais legível no arquivo .md).
type ImageMarkdownAttrs = { src?: string | null; alt?: string | null; title?: string | null; width?: number | string | null; height?: number | string | null };
type MarkdownMark = { type: string; attrs?: { href?: string | null; title?: string | null } };
const Image = ImageBase.extend({
  renderMarkdown(
    node: { attrs?: ImageMarkdownAttrs; marks?: MarkdownMark[] },
    _helpers,
    context?: { previousNode?: { marks?: MarkdownMark[] } | null },
  ) {
    const { src, alt, title, width, height } = node.attrs ?? {};
    const rendered = width || height
      ? `<img ${[
          `src="${src ?? ''}"`,
          alt ? `alt="${alt}"` : null,
          title ? `title="${title}"` : null,
          width ? `width="${width}"` : null,
          height ? `height="${height}"` : null,
        ].filter(Boolean).join(' ')} />`
      : (title ? `![${alt ?? ''}](${src ?? ''} "${title}")` : `![${alt ?? ''}](${src ?? ''})`);

    // @tiptap/markdown só reabre uma mark num nó não-textual (imagem) se ela já
    // estava "ativa" vinda de um texto anterior no mesmo parágrafo — nunca abre
    // uma mark que começa exatamente no nó da imagem. Isso faz imagens dentro de
    // um <a> (badge clicável, botão de download) perderem o link ao salvar.
    // Como recebemos `node.marks` aqui, fechamos essa lacuna manualmente.
    const linkMark = node.marks?.find((mark) => mark.type === 'link');
    const linkAlreadyOpen = context?.previousNode?.marks?.some((mark) => mark.type === 'link');
    if (linkMark && !linkAlreadyOpen) {
      const href = linkMark.attrs?.href ?? '';
      const linkTitle = linkMark.attrs?.title ?? '';
      return linkTitle ? `[${rendered}](${href} "${linkTitle}")` : `[${rendered}](${href})`;
    }
    return rendered;
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

// ── Blocos <div align="..."> ────────────────────────────────────────────────
// O parser de markdown (marked, usado pelo @tiptap/markdown) trata um <div align="...">
// não fechado na mesma linha como HTML "solto" no estilo GitHub: o bloco HTML termina
// na primeira linha em branco, e tudo depois disso (imagem/negrito em sintaxe
// markdown, ou tags HTML soltas) vira blocos de nível superior independentes — até
// sobrar só o `</div>` isolado como outro bloco HTML solto no fim. É exatamente essa
// fragmentação que permite sintaxe markdown funcionar DENTRO de um <div> no GitHub: se
// em vez disso a gente tentasse manter o <div> inteiro como um bloco HTML único e jogar
// pra um parser de HTML puro, qualquer sintaxe markdown lá dentro (![](), **texto**)
// vira texto literal — um parser de HTML não entende sintaxe markdown (foi exatamente
// esse o bug: ao reabrir/alternar Source↔Visual um arquivo já salvo pelo Paperditor,
// cujo conteúdo dentro da div já é sintaxe markdown gerada por nós mesmos, o texto
// virava escapado tipo "\[Paperditor\]\(...\)" a cada rodada).
//
// A estratégia certa: ANTES do parse, substitui só as tags <div align="..."> / </div>
// por marcadores de texto simples (que o marked trata como parágrafos comuns, sem
// nenhum significado especial) — o conteúdo entre elas passa pelo parser de markdown
// normal, sem nenhuma interferência nossa. DEPOIS do parse (ver regroupDivMarkers),
// reagrupamos os nós de nível superior: tudo entre um marcador de abertura e o de
// fechamento correspondente vira filho de um nó DivBlock (ver extensions/DivBlock.ts).
const DIV_MARKER_OPEN_PREFIX = 'PAPERDITOR_DIVBLOCK_OPEN:';
const DIV_MARKER_CLOSE = 'PAPERDITOR_DIVBLOCK_CLOSE';

function substituteDivMarkers(segment: string): string {
  const DIV_TAG_RE = /<div\b([^>]*)>|<\/div\s*>/gi;
  const tags: { index: number; length: number; closing: boolean; align: string | false }[] = [];
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = DIV_TAG_RE.exec(segment)) !== null) {
    const closing = tagMatch[0].startsWith('</');
    let align: string | false = false;
    if (!closing) {
      const attrs = tagMatch[1] ?? '';
      const alignAttr = /\balign\s*=\s*"([^"]+)"|\balign\s*=\s*'([^']+)'/i.exec(attrs);
      const styleAttr = /\bstyle\s*=\s*"([^"]*)"|\bstyle\s*=\s*'([^']*)'/i.exec(attrs);
      const styleValue = styleAttr ? (styleAttr[1] ?? styleAttr[2] ?? '') : '';
      const styleMatch = /text-align:\s*(left|center|right|justify)/i.exec(styleValue);
      const value = (alignAttr ? (alignAttr[1] ?? alignAttr[2]) : (styleMatch?.[1] ?? '')).toLowerCase();
      align = ['left', 'center', 'right', 'justify'].includes(value) ? value : false;
    }
    tags.push({ index: tagMatch.index, length: tagMatch[0].length, closing, align });
  }
  if (tags.length === 0) return segment;

  // Só substitui divs que declaram alinhamento — qualquer outro <div> fica intocado,
  // não empilha e seu conteúdo continua "transparente" como sempre foi (mesma regra
  // do parseDOM do DivBlock: não mexe no que não é nosso).
  const replacements: { index: number; length: number; text: string }[] = [];
  const openStack: number[] = [];
  for (let i = 0; i < tags.length; i += 1) {
    const tag = tags[i];
    if (!tag.closing) {
      if (tag.align) openStack.push(i);
    } else if (openStack.length > 0) {
      const openTag = tags[openStack.pop()!];
      // Força linhas em branco ao redor do marcador, mesmo que a tag original não
      // tivesse nenhuma (ex: `<div align="center">\n  <img .../>`, sem separação —
      // padrão comum quando o div usa tags HTML em vez de sintaxe markdown). Sem
      // isso, o marcador se funde com a linha seguinte num único parágrafo do marked,
      // e regroupDivMarkers nunca reconhece esse parágrafo como um marcador isolado.
      replacements.push({ index: openTag.index, length: openTag.length, text: `\n\n${DIV_MARKER_OPEN_PREFIX}${openTag.align}\n\n` });
      replacements.push({ index: tag.index, length: tag.length, text: `\n\n${DIV_MARKER_CLOSE}\n\n` });
    }
  }
  if (replacements.length === 0) return segment;

  // Cada marcador já carrega sua própria linha em branco (\n\n) antes e depois. Se o
  // texto original ao redor da tag JÁ tinha uma linha em branco ali (comum: é
  // exatamente o formato que o nosso próprio serializer produz — ver
  // DivBlock.renderMarkdown), sem isto as duas se somariam a cada rodada Source↔Visual,
  // acumulando parágrafos vazios (linhas "&nbsp;") no arquivo a cada alternância.
  const stripTrailingBlankLines = (text: string) => text.replace(/(\r?\n[ \t]*)+$/, '');
  const stripLeadingBlankLines = (text: string) => text.replace(/^(\r?\n[ \t]*)+/, '');

  let result = '';
  let cursor = 0;
  for (const r of replacements) {
    let chunk = segment.slice(cursor, r.index);
    if (result !== '') chunk = stripLeadingBlankLines(chunk);
    result += stripTrailingBlankLines(chunk);
    result += r.text;
    cursor = r.index + r.length;
  }
  result += stripLeadingBlankLines(segment.slice(cursor));
  return result;
}

// Uma imagem dentro de um link (badge clicável tipo "[![alt](img)](url)", ou o clássico
// botão de download `<a href="..."><img .../></a>`) perde o link ao ser aberta: o parser
// de marks do @tiptap/markdown (applyMarkToContent, em MarkdownManager.ts) só reabre uma
// mark — como link — em nós de TEXTO; num nó não-textual como imagem ele nunca aplica a
// mark, só tenta recursar em `node.content` (que imagem não tem). O reopen manual feito em
// Image.renderMarkdown (acima) não ajuda aqui: ele reabre a mark ao SERIALIZAR, mas o link
// já chega perdido do PARSE, antes de existir `node.marks` pra reabrir.
// Contornamos normalizando ANTES do parse: convertemos qualquer forma de "imagem num link"
// (markdown aninhado ou HTML cru, possivelmente indentado/multi-linha) pra uma única tag
// HTML `<a href="..."><img .../></a>` numa linha só. Esse caminho passa pelo parser de DOM
// de verdade (generateJSON, via parseHTMLToken) em vez do parser de marks do @tiptap/markdown
// — e o parser de DOM aplica marks a nós não-textuais corretamente (comportamento padrão do
// ProseMirror). Uma linha só também evita que o `<img>` fique indentado o bastante pra ser
// lido como bloco de código indentado pelo marked, outra forma de o link se perder.
function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const MD_LINKED_IMAGE_RE = /\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const MD_LINKED_HTML_IMG_RE = /\[(<img\b[^<>]*?\/?>)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const HTML_LINKED_IMG_RE = /<a\s+([^<>]*?)>\s*(<img\b[^<>]*?\/?>)\s*<\/a\s*>/gi;

function normalizeLinkedImages(segment: string): string {
  let out = segment.replace(
    MD_LINKED_IMAGE_RE,
    (_m, alt: string, imgSrc: string, imgTitle: string | undefined, href: string, linkTitle: string | undefined) => {
      const imgAttrs = [
        `src="${escapeHtmlAttr(imgSrc)}"`,
        alt ? `alt="${escapeHtmlAttr(alt)}"` : null,
        imgTitle ? `title="${escapeHtmlAttr(imgTitle)}"` : null,
      ].filter(Boolean).join(' ');
      const aAttrs = [
        `href="${escapeHtmlAttr(href)}"`,
        linkTitle ? `title="${escapeHtmlAttr(linkTitle)}"` : null,
      ].filter(Boolean).join(' ');
      return `<a ${aAttrs}><img ${imgAttrs}></a>`;
    },
  );
  out = out.replace(
    MD_LINKED_HTML_IMG_RE,
    (_m, imgTag: string, href: string, linkTitle: string | undefined) => {
      const aAttrs = [
        `href="${escapeHtmlAttr(href)}"`,
        linkTitle ? `title="${escapeHtmlAttr(linkTitle)}"` : null,
      ].filter(Boolean).join(' ');
      return `<a ${aAttrs}>${imgTag}</a>`;
    },
  );
  out = out.replace(
    HTML_LINKED_IMG_RE,
    (_m, aAttrs: string, imgTag: string) => `<a ${aAttrs.trim().replace(/\s+/g, ' ')}>${imgTag}</a>`,
  );
  return out;
}

function preprocessLinkedImages(md: string): string {
  // Não mexe dentro de blocos de código cercados — mesma lógica de preprocessDivBlocks.
  const fenceRe = /^(```|~~~)[^\r\n]*\r?\n[\s\S]*?\r?\n\1[ \t]*$/gm;
  let result = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(md)) !== null) {
    result += normalizeLinkedImages(md.slice(cursor, m.index));
    result += m[0];
    cursor = m.index + m[0].length;
  }
  result += normalizeLinkedImages(md.slice(cursor));
  return result;
}

// <sub>/<sup> citadas como texto (ex: "adicionar suporte a tags <sub>" numa entrada
// de changelog) — sem fechamento correspondente, ou como par vazio "<sub></sub>" —
// não são um subscript/superscript de verdade, mas @tiptap/markdown trata os dois
// nomes como HTML reconhecida (por causa do parseDOM das marks Subscript/Superscript,
// ver extends no topo do arquivo) e tenta parsear via generateJSON. Quando não sobra
// conteúdo pra aplicar a mark, o parser da lib devolve um nó "paragraph" solto dentro
// do content de outro parágrafo; o schema rejeita ("Invalid content for node type
// paragraph") e o setContent inteiro falha, deixando o editor sem abrir o arquivo —
// mesma classe do bug do commit 7fecb28 (Image sem inline:true), gatilho diferente.
// Escapamos qualquer <sub>/<sup> que não abra um par não-vazio pra texto literal
// antes do parse, pra nunca chegar nesse caminho.
const SCRIPT_TAG_RE = /<(sub|sup)>([\s\S]*?)<\/\1>|<(sub|sup)>|<\/(sub|sup)>/gi;

// Mesmo bug, gatilho confirmado ao vivo (CDP) num relatório real: "Tags <script> do
// reCAPTCHA v3..." — <script> solto (sem fechamento) no meio de uma frase. script/
// style/pre/textarea são os tags "raw text" do HTML5: mesmo vazios, o parser os trata
// como elemento reconhecido e produz o mesmo "paragraph" órfão dentro de outro
// parágrafo. Sem uso legítimo dentro do editor (não há extensão pra nenhum deles) —
// ao contrário de sub/sup, escapamos sempre, não só quando vazios.
const RAWTEXT_TAG_RE = /<\/?(script|style|pre|textarea)(?:\s[^<>]*)?>/gi;

// Mesma causa da nota acima, mas pra qualquer tag HTML reconhecida, não só sub/sup —
// reproduzido ao vivo (CDP) com `<span style="...">...</span>` vazio (comum em tabelas
// de paleta de cores geradas, ex: swatch de cor sem texto dentro do <span>). Um par
// <tag ...></tag> sem conteúdo textual entre as tags faz o @tiptap/markdown devolver o
// content do "doc" auto-preenchido (um nó de bloco "paragraph" vazio) em vez do content
// inline esperado — mesmo "Invalid content for node type paragraph" de cima. `div` fica
// de fora: tratado à parte por preprocessDivBlocks/regroupDivMarkers, que roda depois
// desta função e precisa ver as tags <div> intactas.
const EMPTY_HTML_PAIR_RE = /<((?!div\b)[a-zA-Z][\w-]*)\b([^>]*)>[ \t\r\n]*<\/\1\s*>/gi;

const escapeAngleBrackets = (s: string) => s.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));

// <span style="...background:...">...</span> vazio tem nó dedicado (ver
// extensions/ColorSwatch.ts, que renderiza um swatch de cor de verdade) — não escapa
// esse caso pra deixar o parser reconhecer via ColorSwatch.parseHTML.
function isColorSwatchSpan(tag: string, attrs: string): boolean {
  return tag.toLowerCase() === 'span' && /background/i.test(attrs);
}

// Mesma classe de bug, gatilho de texto que CITA tags ("use <p>, <h2>, <ul>..." num
// prompt): tag citada sem par de fechamento vira nó órfão e o schema rejeita o
// setContent. Heurística: se a quantidade de aberturas e fechamentos de um nome de tag
// difere no segmento, escapa todas as ocorrências desse nome. Void, div e <a>/<img>
// (tratados em outro lugar) ficam de fora.
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'area', 'base', 'col', 'embed', 'source', 'track', 'param', 'div']);
const ANY_TAG_RE = /<(\/?)([a-zA-Z][\w-]*)\b(?:[^<>]*?)(\/?)>/g;

function escapeUnbalancedTags(segment: string): string {
  const balance = new Map<string, number>();
  for (const m of segment.matchAll(ANY_TAG_RE)) {
    const name = m[2].toLowerCase();
    if (VOID_TAGS.has(name) || m[3] === '/') continue;
    balance.set(name, (balance.get(name) ?? 0) + (m[1] ? -1 : 1));
  }
  return segment.replace(ANY_TAG_RE, (match: string, _c: string, name: string, selfClose: string) => {
    const lower = name.toLowerCase();
    return !VOID_TAGS.has(lower) && selfClose !== '/' && balance.get(lower) ? escapeAngleBrackets(match) : match;
  });
}

function escapeBareScriptTags(segment: string): string {
  const withSubSup = segment.replace(
    SCRIPT_TAG_RE,
    (match: string, pairTag?: string, inner?: string, loneOpenTag?: string, loneCloseTag?: string) => {
      if (pairTag !== undefined) {
        if (!inner || !inner.trim()) {
          return `&lt;${pairTag}&gt;&lt;/${pairTag}&gt;`;
        }
        return match;
      }
      const tag = loneOpenTag ?? loneCloseTag;
      return loneCloseTag !== undefined ? `&lt;/${tag}&gt;` : `&lt;${tag}&gt;`;
    },
  );
  const withRawText = withSubSup.replace(RAWTEXT_TAG_RE, escapeAngleBrackets);
  const withUnbalanced = escapeUnbalancedTags(withRawText);
  return withUnbalanced.replace(EMPTY_HTML_PAIR_RE, (match: string, tag: string, attrs: string) =>
    isColorSwatchSpan(tag, attrs) ? match : escapeAngleBrackets(match),
  );
}

function preprocessBareScriptTags(md: string): string {
  const fenceRe = /^(```|~~~)[^\r\n]*\r?\n[\s\S]*?\r?\n\1[ \t]*$/gm;
  let result = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(md)) !== null) {
    result += escapeBareScriptTags(md.slice(cursor, m.index));
    result += m[0];
    cursor = m.index + m[0].length;
  }
  result += escapeBareScriptTags(md.slice(cursor));
  return result;
}

function preprocessDivBlocks(md: string): string {
  // Não mexe dentro de blocos de código cercados (``` ou ~~~) — só processa o que
  // está fora deles, remontando o texto na mesma ordem.
  const fenceRe = /^(```|~~~)[^\r\n]*\r?\n[\s\S]*?\r?\n\1[ \t]*$/gm;
  let result = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(md)) !== null) {
    result += substituteDivMarkers(md.slice(cursor, m.index));
    result += m[0];
    cursor = m.index + m[0].length;
  }
  result += substituteDivMarkers(md.slice(cursor));
  return result;
}

// Roda DEPOIS do parse (ver preprocessDivBlocks): junta os marcadores inseridos antes
// do parse em nós DivBlock de verdade, usando uma pilha para lidar com divs aninhadas.
// Tipos de nó que o parser de markdown às vezes solta direto no nível superior (ex:
// uma linha só com `![alt](src)` vira um nó "image" sozinho, sem parágrafo em volta).
// No nível do documento isso passa despercebido, mas o DivBlock exige conteúdo de
// bloco (content: 'block+') — sem embrulhar, "Invalid content for node divBlock".
const INLINE_NODE_TYPES = new Set(['image', 'text', 'hardBreak']);

function ensureBlockNode(node: JSONContent): JSONContent {
  return INLINE_NODE_TYPES.has(node.type ?? '') ? { type: 'paragraph', content: [node] } : node;
}

function regroupDivMarkers(nodes: JSONContent[]): JSONContent[] {
  const OPEN_RE = /^PAPERDITOR_DIVBLOCK_OPEN:(left|center|right|justify)$/;

  const markerText = (node: JSONContent): string | null => {
    if (node.type !== 'paragraph' || node.content?.length !== 1) return null;
    const child = node.content[0];
    return child.type === 'text' && typeof child.text === 'string' ? child.text : null;
  };

  const result: JSONContent[] = [];
  const stack: { align: string; content: JSONContent[] }[] = [];
  for (const node of nodes) {
    const text = markerText(node);
    const openMatch = text ? OPEN_RE.exec(text) : null;
    if (openMatch) {
      stack.push({ align: openMatch[1], content: [] });
      continue;
    }
    if (text === DIV_MARKER_CLOSE && stack.length > 0) {
      const finished = stack.pop()!;
      const divNode: JSONContent = { type: 'divBlock', attrs: { align: finished.align }, content: finished.content };
      (stack.length > 0 ? stack[stack.length - 1].content : result).push(divNode);
      continue;
    }
    if (stack.length > 0) {
      stack[stack.length - 1].content.push(ensureBlockNode(node));
    } else {
      result.push(node);
    }
  }
  // Abertura sem fechamento correspondente (entrada malformada) — devolve o conteúdo
  // solto em vez de descartá-lo.
  while (stack.length > 0) {
    const leftover = stack.pop()!;
    (stack.length > 0 ? stack[stack.length - 1].content : result).push(...leftover.content);
  }
  return result;
}

// Faz o parse de markdown → JSON (via o próprio parser do @tiptap/markdown) e reagrupa
// os blocos <div align="..."> nos nós DivBlock correspondentes. Substitui a chamada
// direta de `editor.commands.setContent(text, { contentType: 'markdown' })` nos pontos
// que precisam reconhecer divs — o comando de conveniência do Markdown extension não
// dá gancho para reagrupar o JSON entre o parse e o setContent.
function parseMarkdownWithDivBlocks(editor: Editor, md: string): JSONContent {
  const json = editor.markdown!.parse(preprocessDivBlocks(preprocessLinkedImages(preprocessBareScriptTags(md))));
  return { ...json, content: regroupDivMarkers(json.content ?? []) };
}

// Sanitiza um arquivo .html/.htm aberto diretamente (não markdown com HTML embutido,
// que passa pelo pipeline de markdown acima) antes de entregá-lo ao Tiptap como
// contentType: 'html'. O DOMParser usado por baixo (@tiptap/core → elementFromString)
// já não executa scripts em documentos criados via `parseFromString` — é garantido pela
// spec, não importa se o schema reconhece <script> ou não. Removemos aqui mesmo assim
// por dois motivos: (1) deixa essa garantia explícita e auditável no nosso próprio
// código, em vez de depender de um detalhe de implementação de uma lib; (2) sem isso,
// tags que o schema não reconhece (como <script>/<style>) acabam preservadas como texto
// literal, mostrando código-fonte cru dentro do documento.
function preprocessHtmlForOpen(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

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
  const [toolbarTab, setToolbarTab] = useState<'general' | 'tables' | 'reading'>('general');
  const isReadingMode = toolbarTab === 'reading';
  const [showToc, setShowToc] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isCtrlHeld, setIsCtrlHeld] = useState(false);
  const [showFindBar, setShowFindBar] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const findBarRef = useRef<FindBarHandle>(null);
  const showFindBarRef = useRef(false); // ref para evitar stale closure no keydown handler
  const suppressDirty = useRef(true); // começa true para ignorar o onUpdate inicial do Tiptap

  // Reativa o rastreamento de "alterado" só no próximo tick (macrotask), não
  // sincronamente logo após o setContent. Motivo: com a view do Tiptap montada e
  // editável (modo Editor visual — não acontece no Source, que não usa essa view, nem
  // no Reading, que é somente-leitura), substituir o documento inteiro enquanto a
  // seleção do navegador ainda aponta pro DOM antigo pode disparar uma correção de
  // seleção/DOM assíncrona que o ProseMirror interpreta como uma edição — e essa
  // atualização chega DEPOIS do `suppressDirty.current = false` síncrono, marcando o
  // arquivo como alterado sem o usuário ter feito nada. Mesma classe de bug do
  // onCreate (ver comentário abaixo), mesma solução: adiar a liberação do supressor.
  const releaseSuppressDirty = useCallback(() => {
    setTimeout(() => {
      suppressDirty.current = false;
    }, 0);
  }, []);
  const footnoteDefsRef = useRef<Map<string, string>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sourceWrapRef = useRef<HTMLDivElement>(null);
  const readingViewRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
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
      // inline: true — sem isso, Image vira nó de bloco (padrão do Tiptap), e o
      // parser markdown (@tiptap/markdown) quebra ao encontrar uma imagem dentro de
      // um parágrafo (ex: badge com link "[![alt](img)](url)", ou qualquer imagem
      // inline misturada com texto): gera um parágrafo com uma imagem-bloco como
      // filha, que viola o schema. Isso não falha na hora do parse — só estoura
      // depois (ex: RangeError "Invalid content for node type paragraph" quando o
      // UniqueID tenta atribuir um id ao parágrafo), deixando o editor sem abrir
      // o arquivo e sem erro visível pro usuário.
      Image.configure({ inline: true }),
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
      CodeBlockWithCopy,
      DivBlock,
      ColorSwatch,
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
      // Libera o suppressor só no próximo tick (macrotask), depois que qualquer onUpdate
      // disparado pela própria definição do conteúdo inicial já tiver disparado. Limpar
      // direto aqui dependia da ordem onCreate-vs-onUpdate interna do editor, que não é
      // garantida (varia entre versões) — se o onUpdate do conteúdo inicial disparar
      // DEPOIS do onCreate, o documento nasce marcado como alterado sem o usuário ter
      // feito nada.
      setTimeout(() => {
        suppressDirty.current = false;
      }, 0);
    },
  });

  // Publica a altura real da toolbar (pode variar: a ribbon quebra linha em janelas
  // estreitas) como variável CSS, usada pelo scroll-padding-top do documento — sem
  // isso, o scrollIntoView NATIVO (TOC, links de heading, notas de rodapé) posiciona
  // o alvo exatamente no topo da página, e a toolbar (sticky) fica por cima escondendo-o.
  //
  // O scrollIntoView da BUSCA (editor.commands.scrollIntoView, usado pelo FindBar) é
  // outro mecanismo, totalmente à parte — implementado manualmente pelo próprio
  // ProseMirror (scrollRectIntoView), que NÃO respeita scroll-padding-top nenhum.
  // Ele tem seu próprio jeito de saber quanto espaço deixar nas bordas: as editorProps
  // scrollThreshold/scrollMargin. Sem configurá-las, um match logo abaixo da toolbar
  // pode ser considerado "já visível" (o cálculo não desconta a altura da toolbar) e o
  // ProseMirror decide que não precisa rolar — por isso replicamos a mesma altura ali.
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el || !editor) return;
    const updateHeight = () => {
      const height = el.offsetHeight;
      document.documentElement.style.setProperty('--toolbar-height', `${height}px`);
      editor.setOptions({
        editorProps: {
          scrollThreshold: { top: height + 8, bottom: 8, left: 8, right: 8 },
          scrollMargin: { top: height + 8, bottom: 8, left: 8, right: 8 },
        },
      });
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [editor]);

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
    try {
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
    } catch (error) {
      // Sem isso, uma falha na serialização markdown (getContentToSave) ou no IPC de
      // escrita (ex: disco cheio, permissão negada em dialog:saveFile) vira uma promise
      // rejeitada não tratada: nada é salvo, nada indica isso ao usuário, e quem chamou
      // handleSave (ex: checkUnsaved antes de Novo/Abrir/fechar) segue como se tivesse
      // dado certo. Tratamos como "não salvou" — mesmo efeito de cancelar o diálogo.
      console.error('Falha ao salvar o arquivo:', error);
      return false;
    }
  }, [filePath, getContentToSave]);

  const handleSaveAs = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI) return false;
    try {
      const content = getContentToSave();
      const result = await window.electronAPI.ipcRenderer.invoke('dialog:saveFile', {
        content,
        path: null,
        forceDialog: true,
      }) as string | null;
      if (result) {
        setFilePath(result);
        setMarkdownContent(content);
        setIsDirty(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Falha ao salvar o arquivo (Salvar como):', error);
      return false;
    }
  }, [getContentToSave]);

  const checkUnsaved = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    if (!window.electronAPI) return true;
    const result = await window.electronAPI.ipcRenderer.invoke('dialog:showUnsavedDialog') as 'save' | 'discard' | 'cancel';
    if (result === 'save') return await handleSave();
    return result === 'discard';
  }, [isDirty, handleSave]);

  // Ao trocar de documento (Novo/Abrir), o scroll do modo/container ativo no momento
  // fica onde estava no documento anterior — o navegador não reseta isso sozinho ao
  // trocar o conteúdo. Zera os 3 scrollers possíveis (html no modo Visual, .reading-view
  // no modo Reading, textarea no modo Source); os que não se aplicam ao modo atual
  // simplesmente não têm efeito.
  const resetScroll = useCallback(() => {
    window.scrollTo(0, 0);
    if (readingViewRef.current) readingViewRef.current.scrollTop = 0;
    if (textareaRef.current) textareaRef.current.scrollTop = 0;
  }, []);

  const handleNew = useCallback(async () => {
    const canProceed = await checkUnsaved();
    if (!canProceed) return;
    // Limpa notas de rodapé do arquivo anterior: sem isso, postprocessFootnotes
    // (chamado ao alternar para o modo Source) reanexa as definições antigas
    // no fim do documento novo, mesmo que ele não tenha nenhuma nota.
    footnoteDefsRef.current.clear();
    suppressDirty.current = true;
    if (editor) editor.commands.setContent(initialMarkdownContent, { contentType: 'markdown' });
    releaseSuppressDirty();
    setMarkdownContent(initialMarkdownContent);
    setFilePath(null);
    setIsDirty(false);
    resetScroll();
    window.electronAPI?.ipcRenderer.invoke('file:new');
  }, [checkUnsaved, editor, resetScroll, releaseSuppressDirty]);

  const openFileContent = useCallback((content: string, path: string): boolean => {
    if (!editor) return false;
    suppressDirty.current = true;
    setContentError(null);
    let succeeded = true;
    const isHtml = /\.html?$/i.test(path);
    if (isHtml) {
      editor.commands.setContent(preprocessHtmlForOpen(content), { contentType: 'html' });
    } else {
      const withEmoji = preprocessEmojis(content);
      const processed = preprocessFootnotes(withEmoji, footnoteDefsRef.current);
      try {
        editor.commands.setContent(parseMarkdownWithDivBlocks(editor, processed));
      } catch (error) {
        succeeded = false;
        // Rede de segurança: se o markdown produzir uma árvore que o schema do
        // ProseMirror rejeita (ex: HTML inline reconhecida mas malformada — ver
        // preprocessBareScriptTags acima —, ou qualquer outro caso não previsto),
        // setContent lança e a transação nunca é aplicada: o editor fica travado no
        // documento anterior, sem indicar erro nenhum pro usuário (é assim que o bug
        // original do commit 7fecb28 se manifestava, e por que ele "voltou" com um
        // gatilho diferente). Preferimos cair pro modo Source, que só precisa de uma
        // string e nunca falha, a deixar o arquivo "sem abrir" silenciosamente.
        console.error('Falha ao converter markdown para o editor WYSIWYG, caindo para o modo Source:', error);
        setContentError('Não foi possível exibir este arquivo nos modos Visual/Reading (Markdown incompatível). Mostrando o modo Código-fonte.');
        setIsMarkdownMode(true);
        // Sem isso, se a aba ativa fosse "reading" o usuário cairia numa view que
        // ignora isMarkdownMode e mostra o documento Tiptap antigo (setContent acima
        // nunca chegou a aplicar) — tela em branco, sem nenhum indício do que houve.
        setToolbarTab('general');
      }
    }
    releaseSuppressDirty();
    if (isHtml) {
      // HTML importado não é gravado de volta no .html original (isso sobrescreveria
      // HTML com markdown) — vira um documento markdown novo, "sem título", como em
      // "Novo": salvar pede um destino .md novo em vez de reusar o caminho do HTML.
      setMarkdownContent(getMarkdownFromEditor());
      setFilePath(null);
    } else {
      setMarkdownContent(content);
      setFilePath(path);
    }
    setIsDirty(false);
    resetScroll();
    return succeeded;
  }, [editor, resetScroll, releaseSuppressDirty, getMarkdownFromEditor]);

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
  }, [checkUnsaved, editor, openFileContent]);

  useEffect(() => {
    if (!window.electronAPI || !editor) return;

    const unsubs = [
      window.electronAPI.ipcRenderer.on('file:opened', (...args: unknown[]) => {
        const data = args[0] as { content: string; path: string; mode?: 'reading' | 'editor' } | undefined;
        if (data) {
          const succeeded = openFileContent(data.content, data.path);
          // `mode` só vem preenchido quando o arquivo chega via associação do SO (ver
          // electron/main.ts: getLaunchIntent/open-file) — navegação por link interno
          // (Ctrl+clique num link relativo) não define mode, então mantém o modo atual
          // em vez de forçar Reading/Editor. Só força Visual/Reading quando o parse deu
          // certo — senão isso sobrescreve o fallback pro modo Source que openFileContent
          // acabou de aplicar (setIsMarkdownMode(true) + toolbarTab 'general'), voltando o
          // usuário pra aba Reading, que ignora isMarkdownMode e mostra o documento antigo
          // (setContent nunca chegou a aplicar) — exatamente o "arquivo não abre" original.
          if (data.mode && succeeded) {
            setIsMarkdownMode(false);
            setToolbarTab(data.mode === 'reading' ? 'reading' : 'general');
          }
        }
      }),
    ];
    return () => unsubs.forEach(fn => fn?.());
  }, [editor, openFileContent]);

  // Garante que o documento Tiptap reflete o conteúdo atual antes de gerar o HTML de
  // exportação/impressão — necessário porque no modo Source o editor pode estar
  // desatualizado em relação ao textarea. Compartilhado entre export PDF/HTML/DOCX/Print.
  // Chama o mesmo parseMarkdownWithDivBlocks + setContent do openFileContent, então está
  // sujeito ao mesmo tipo de exceção (ex: HTML reconhecida malformada, ver
  // preprocessBareScriptTags) — sem o try/catch, markdown problemático digitado/colado no
  // modo Source travaria a exportação com uma promise rejeitada não tratada, sem avisar o
  // usuário. Retorna false nesse caso para os handlers abaixo abortarem a exportação em vez
  // de gerar HTML a partir do documento antigo (desatualizado) do editor.
  const syncEditorFromMarkdownIfNeeded = useCallback((): boolean => {
    if (!editor || !isMarkdownMode) return true;
    suppressDirty.current = true;
    try {
      const processed = preprocessFootnotes(markdownContent, footnoteDefsRef.current);
      editor.commands.setContent(parseMarkdownWithDivBlocks(editor, processed));
      return true;
    } catch (error) {
      console.error('Falha ao sincronizar o editor a partir do modo Source; exportação/impressão abortada:', error);
      setContentError('Não foi possível exportar/imprimir: o Markdown atual é incompatível com o conversor.');
      return false;
    } finally {
      releaseSuppressDirty();
    }
  }, [editor, isMarkdownMode, markdownContent, releaseSuppressDirty]);

  const handleExportPdf = useCallback(async () => {
    if (!window.electronAPI || !editor) return;
    if (!syncEditorFromMarkdownIfNeeded()) return;
    const htmlContent = generatePrintHtml();
    try {
      await window.electronAPI.ipcRenderer.invoke('dialog:exportPdf', { htmlContent });
    } catch (error) {
      console.error('Falha ao exportar PDF:', error);
    }
  }, [editor, syncEditorFromMarkdownIfNeeded, generatePrintHtml]);

  const handleExportHtml = useCallback(async () => {
    if (!window.electronAPI || !editor) return;
    if (!syncEditorFromMarkdownIfNeeded()) return;
    const htmlContent = generatePrintHtml();
    try {
      await window.electronAPI.ipcRenderer.invoke('dialog:exportHtml', { htmlContent });
    } catch (error) {
      console.error('Falha ao exportar HTML:', error);
    }
  }, [editor, syncEditorFromMarkdownIfNeeded, generatePrintHtml]);

  const handleExportDocx = useCallback(async () => {
    if (!window.electronAPI || !editor) return;
    if (!syncEditorFromMarkdownIfNeeded()) return;
    const htmlContent = generatePrintHtml();
    try {
      await window.electronAPI.ipcRenderer.invoke('dialog:exportDocx', { htmlContent });
    } catch (error) {
      console.error('Falha ao exportar DOCX:', error);
    }
  }, [editor, syncEditorFromMarkdownIfNeeded, generatePrintHtml]);

  const handlePrint = useCallback(async () => {
    if (!window.electronAPI || !editor) return;
    if (!syncEditorFromMarkdownIfNeeded()) return;
    const htmlContent = generatePrintHtml();
    try {
      await window.electronAPI.ipcRenderer.invoke('dialog:print', { htmlContent });
    } catch (error) {
      console.error('Falha ao imprimir:', error);
    }
  }, [editor, syncEditorFromMarkdownIfNeeded, generatePrintHtml]);

  const handleToggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  // Source → Visual: carrega o markdown no editor Tiptap e aplica a seleção equivalente.
  // Compartilhado entre handleToggleMode e a entrada no modo Reading a partir do Source
  // (a visualização Reading usa o mesmo documento Tiptap do modo Editor). Retorna false
  // se o markdown não puder ser convertido — sem isso (bug original), uma exceção aqui
  // ficava sem try/catch: estourava sem aviso nenhum e travava o usuário no modo Source,
  // já que o código que muda pra Visual (setIsMarkdownMode(false) etc.) nunca era alcançado.
  const switchSourceToEditor = useCallback((): boolean => {
    if (!editor) return false;
    const textarea = textareaRef.current;
    const selStart = textarea ? textarea.selectionStart : 0;
    const selEnd = textarea ? textarea.selectionEnd : 0;
    suppressDirty.current = true;
    try {
      const withEmoji = preprocessEmojis(markdownContent);
      const processed = preprocessFootnotes(withEmoji, footnoteDefsRef.current);
      editor.commands.setContent(parseMarkdownWithDivBlocks(editor, processed));
    } catch (error) {
      console.error('Falha ao converter Markdown para o editor WYSIWYG:', error);
      setContentError('Não foi possível exibir este conteúdo nos modos Visual/Reading (Markdown incompatível). Permanecendo no modo Código-fonte.');
      return false;
    } finally {
      releaseSuppressDirty();
    }
    setContentError(null);

    const breakpoints = buildPositionMap(editor.state.doc, markdownContent);
    applySelectionFromTextOffsets(editor, breakpoints, selStart, selEnd);
    setIsMarkdownMode(false);
    localStorage.setItem('editorMode', 'visual');
    return true;
  }, [editor, markdownContent, releaseSuppressDirty]);

  const handleToggleMode = useCallback(() => {
    if (isReadingMode) return; // alternância Editor/Source não se aplica no modo Reading
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
      // Source → Visual: a posição em si não depende do DOM estar montado — só focar e
      // rolar até ela precisam esperar o remount do EditorContent, feito no efeito abaixo.
      if (switchSourceToEditor()) pendingVisualFocusRef.current = true;
    }
  }, [isReadingMode, isMarkdownMode, getMarkdownFromEditor, editor, switchSourceToEditor]);

  // Muda a aba ativa da toolbar. Entrar na aba "reading" a partir do modo Source
  // primeiro converte o conteúdo para o documento Tiptap (mesmo caminho do toggle
  // Source→Visual), já que o modo Reading reaproveita o editor Tiptap em somente-leitura.
  // Se a conversão falhar, cancela a troca de aba — sem isso, "reading" mostraria o
  // documento Tiptap desatualizado (a conversão não chegou a aplicar) sem indicar nada.
  const handleTabChange = useCallback((tab: 'general' | 'tables' | 'reading') => {
    if (tab === 'reading' && isMarkdownMode && !switchSourceToEditor()) return;
    setToolbarTab(tab);
  }, [isMarkdownMode, switchSourceToEditor]);

  // Mantém o editor não-editável enquanto o modo Reading está ativo, e reabilita a
  // edição ao sair dele — funciona em cima da mesma instância/documento do editor.
  useEffect(() => {
    if (!editor) return;
    // Segundo argumento `false`: não emite 'update' — alternar editable não é uma
    // edição de conteúdo, e por padrão setEditable() dispara 'update' mesmo assim,
    // o que marcava o documento como sujo só de montar o editor ou entrar no Reading.
    editor.setEditable(!isReadingMode, false);
  }, [editor, isReadingMode]);

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
  useEffect(() => {
    showFindBarRef.current = showFindBar;
  }, [showFindBar]);

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
    // No modo Reading, links/notas de rodapé navegam com clique simples (não precisa
    // de Ctrl) — não há texto sendo editado, então não existe o conflito com
    // posicionamento de cursor que motiva a exigência de Ctrl no modo Editor.
    if (!isReadingMode && !e.ctrlKey && !e.metaKey) return;

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
  }, [openFileContent, isReadingMode]);

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
        ref={toolbarRef}
        editor={editor}
        onOpen={handleOpen}
        onSave={handleSave}
        onExportPdf={handleExportPdf}
        onExportHtml={handleExportHtml}
        onExportDocx={handleExportDocx}
        onPrint={handlePrint}
        onToggleTheme={handleToggleTheme}
        onToggleMode={handleToggleMode}
        isDark={isDark}
        isMarkdownMode={isMarkdownMode}
        isDirty={isDirty}
        activeTab={toolbarTab}
        onTabChange={handleTabChange}
        showToc={showToc}
        onToggleToc={() => setShowToc((v) => !v)}
      />
      {contentError && (
        <div className="content-error-banner" role="alert">
          <span>{contentError}</span>
          <button type="button" onClick={() => setContentError(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}
      <main className="main-content">
        {isReadingMode ? (
          <div className="reading-layout">
            {showToc && <Toc editor={editor} slugify={slugify} />}
            <div className="reading-view" ref={readingViewRef} onClick={handleEditorClick}>
              <EditorContent editor={editor} />
            </div>
          </div>
        ) : isMarkdownMode ? (
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