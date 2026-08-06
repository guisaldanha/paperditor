import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type ForwardedRef,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import {
  findMatchesInDoc,
  setSearchMatches,
  clearSearchMatches,
  type SearchMatch,
} from '../extensions/SearchHighlight';
import './FindBar.css';

interface Props {
  editor: Editor | null;
  isMarkdownMode: boolean;
  markdownContent: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  sourceWrapRef: RefObject<HTMLDivElement>;
  onClose: () => void;
}

export interface FindBarHandle {
  focusInput: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MIRROR_STYLE_PROPS = [
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'letterSpacing', 'lineHeight', 'tabSize', 'wordSpacing',
] as const;

// Busca todas as ocorrências de `query` (case-insensitive) numa string plana —
// usado no modo Source, onde o conteúdo é markdown puro em vez de um doc ProseMirror.
function findMatchesInText(text: string, query: string): SearchMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const matches: SearchMatch[] = [];
  let from = 0;
  let found = lowerText.indexOf(lowerQuery, from);
  while (found !== -1) {
    matches.push({ from: found, to: found + lowerQuery.length });
    from = found + lowerQuery.length;
    found = lowerText.indexOf(lowerQuery, from);
  }
  return matches;
}

// Mede o(s) retângulo(s) exatos (relativos ao canto superior esquerdo do textarea,
// ignorando o scroll atual) ocupados pelo texto de `match` dentro de `text`, usando
// a técnica de "mirror div": um <div> invisível com a mesma largura de conteúdo,
// fonte e espaçamento do textarea, que quebra linha exatamente como ele quebraria.
// getClientRects() no <span> do match retorna um retângulo por linha visual que ele
// ocupa — por isso funciona corretamente mesmo se o texto do textarea tiver dado
// wrap (coisa que contar apenas quebras de linha "\n" não capta).
function measureMatchRects(textarea: HTMLTextAreaElement, text: string, match: SearchMatch): Rect[] {
  const cs = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.boxSizing = 'border-box';
  mirror.style.border = '0';
  mirror.style.margin = '0';
  // clientWidth já exclui a barra de rolagem (se houver) — usar isso em vez do
  // width computado evita que o mirror quebre linha num ponto diferente do textarea real.
  mirror.style.width = `${textarea.clientWidth}px`;
  MIRROR_STYLE_PROPS.forEach((prop) => {
    mirror.style[prop] = cs[prop];
  });

  const before = document.createTextNode(text.slice(0, match.from));
  const markEl = document.createElement('span');
  markEl.textContent = text.slice(match.from, match.to) || '​';
  const after = document.createTextNode(text.slice(match.to));
  mirror.appendChild(before);
  mirror.appendChild(markEl);
  mirror.appendChild(after);
  document.body.appendChild(mirror);

  const borderTop = parseFloat(cs.borderTopWidth) || 0;
  const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
  const mirrorRect = mirror.getBoundingClientRect();
  const rects: Rect[] = Array.from(markEl.getClientRects()).map((r) => ({
    top: r.top - mirrorRect.top + borderTop,
    left: r.left - mirrorRect.left + borderLeft,
    width: r.width,
    height: r.height,
  }));

  document.body.removeChild(mirror);
  return rects;
}

const FindBar = forwardRef(function FindBar(
  { editor, isMarkdownMode, markdownContent, textareaRef, sourceWrapRef, onClose }: Props,
  ref: ForwardedRef<FindBarHandle>
) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [docVersion, setDocVersion] = useState(0);
  // Retângulos "crus" (sem descontar o scroll atual) do match ativo no modo Source,
  // e o offset de scroll atual do textarea — combinados na hora de renderizar, para que
  // reposicionar o overlay ao rolar não exija remedir o texto no mirror a cada scroll tick.
  const [rawMatchRects, setRawMatchRects] = useState<Rect[]>([]);
  const [scrollOffset, setScrollOffset] = useState({ top: 0, left: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const prevQueryRef = useRef('');

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Recalcula os matches sempre que o documento do Tiptap mudar (edição feita
  // com a barra de busca aberta) — não há round-trip de IPC, então isso é local e síncrono.
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => setDocVersion((v) => v + 1);
    editor.on('update', onUpdate);
    return () => { editor.off('update', onUpdate); };
  }, [editor]);

  const matches = useMemo(() => {
    if (isMarkdownMode) return findMatchesInText(markdownContent, query);
    if (!editor) return [];
    return findMatchesInDoc(editor.state.doc, query);
    // docVersion é usado apenas para forçar recomputo quando o doc muda; eslint não enxerga essa dependência indireta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isMarkdownMode, markdownContent, editor, docVersion]);

  // Ao mudar a query, pula para o primeiro match. Ao mudar só o conteúdo (mesma query),
  // mantém a posição atual (clampada), em vez de saltar de volta para o início.
  useEffect(() => {
    if (matches.length === 0) {
      setActiveIndex(-1);
      prevQueryRef.current = query;
      return;
    }
    if (prevQueryRef.current !== query) {
      setActiveIndex(0);
    } else {
      setActiveIndex((i) => Math.min(i < 0 ? 0 : i, matches.length - 1));
    }
    prevQueryRef.current = query;
  }, [matches, query]);

  // Aplica o match ativo: no modo Visual via decorações do ProseMirror (funcionam mesmo
  // sem o editor estar focado); no modo Source via seleção nativa do textarea + retângulo(s)
  // de destaque medidos no mirror (a seleção nativa só é visível quando o elemento está
  // focado, e não queremos roubar o foco do input de busca — por isso o overlay).
  useEffect(() => {
    if (isMarkdownMode) {
      if (editor) clearSearchMatches(editor);
      const textarea = textareaRef.current;
      const match = activeIndex >= 0 ? matches[activeIndex] : null;
      if (!textarea || !match) {
        setRawMatchRects([]);
        return;
      }
      textarea.setSelectionRange(match.from, match.to);
      const rects = measureMatchRects(textarea, markdownContent, match);
      setRawMatchRects(rects);
      const target = rects[0];
      if (target) {
        textarea.scrollTop = Math.max(0, target.top - textarea.clientHeight / 2);
      }
      setScrollOffset({ top: textarea.scrollTop, left: textarea.scrollLeft });
    } else {
      setRawMatchRects([]);
      if (!editor) return;
      const match = activeIndex >= 0 ? matches[activeIndex] : null;
      if (!match) {
        clearSearchMatches(editor);
        return;
      }
      setSearchMatches(editor, matches, activeIndex);
      editor.commands.setTextSelection(match);
      editor.commands.scrollIntoView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, matches, isMarkdownMode]);

  // Mantém o(s) retângulo(s) de destaque do modo Source alinhados caso o usuário role
  // o textarea manualmente (sem mover seleção/cursor nem remedir — só reposiciona).
  useEffect(() => {
    if (!isMarkdownMode) return;
    const textarea = textareaRef.current;
    if (!textarea || rawMatchRects.length === 0) return;
    const onScroll = () => setScrollOffset({ top: textarea.scrollTop, left: textarea.scrollLeft });
    textarea.addEventListener('scroll', onScroll);
    return () => textarea.removeEventListener('scroll', onScroll);
  }, [isMarkdownMode, rawMatchRects, textareaRef]);

  // Ao fechar a busca, restaura o foco no editor/textarea na posição do último match
  // (sem isso o caret fica invisível — a seleção foi movida via comando/setSelectionRange,
  // sem focar, para não roubar o foco do input de busca durante a navegação dos matches).
  const handleClose = () => {
    if (isMarkdownMode) {
      const textarea = textareaRef.current;
      const match = activeIndex >= 0 ? matches[activeIndex] : null;
      if (textarea) {
        textarea.focus();
        // Reaplica a seleção explicitamente em vez de confiar na que já estava no DOM:
        // o re-render disparado por onClose() (desmontando esta barra) pode reatribuir
        // textarea.value, o que em alguns navegadores reseta a seleção nativa.
        if (match) textarea.setSelectionRange(match.from, match.to);
      }
    } else if (editor) {
      editor.chain().focus().run();
    }
    onClose();
  };

  // Garante que as decorações somem do editor ao fechar/desmontar a barra, seja
  // qual for o caminho (botão fechar, Esc, ou troca de modo desmontando o componente).
  useEffect(() => {
    return () => {
      if (editor) clearSearchMatches(editor);
    };
  }, [editor]);

  const navigate = (forward: boolean) => {
    if (matches.length === 0) return;
    setActiveIndex((i) => {
      const base = i < 0 ? 0 : i;
      return forward ? (base + 1) % matches.length : (base - 1 + matches.length) % matches.length;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      navigate(!e.shiftKey);
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  const noMatch = matches.length === 0 && !!query.trim();
  const counter = matches.length > 0 ? `${activeIndex + 1}/${matches.length}` : noMatch ? 'No results' : '';

  return (
    <div ref={barRef} className="find-bar" role="search">
      <input
        ref={inputRef}
        className={`find-bar__input${noMatch ? ' find-bar__input--no-match' : ''}`}
        type="text"
        placeholder="Find…"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
      />
      {counter && <span className="find-bar__counter">{counter}</span>}
      <button
        ref={prevBtnRef}
        className="find-bar__btn"
        title="Previous (Shift+Enter)"
        disabled={matches.length === 0}
        onClick={() => navigate(false)}
      >
        ↑
      </button>
      <button
        ref={nextBtnRef}
        className="find-bar__btn"
        title="Next (Enter)"
        disabled={matches.length === 0}
        onClick={() => navigate(true)}
      >
        ↓
      </button>
      <button className="find-bar__close" title="Close (Esc)" onClick={handleClose}>
        ✕
      </button>
      {isMarkdownMode && rawMatchRects.length > 0 && sourceWrapRef.current &&
        createPortal(
          <>
            {rawMatchRects.map((r, i) => (
              <div
                key={i}
                className="find-text-highlight"
                style={{
                  top: r.top - scrollOffset.top,
                  left: r.left - scrollOffset.left,
                  width: r.width,
                  height: r.height,
                }}
              />
            ))}
          </>,
          sourceWrapRef.current
        )}
    </div>
  );
});

export default FindBar;
