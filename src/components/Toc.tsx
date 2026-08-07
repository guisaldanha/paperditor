import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

interface TocItem {
  id: string;
  level: number;
  text: string;
}

interface TocProps {
  editor: Editor;
  slugify: (text: string) => string;
}

function computeToc(editor: Editor, slugify: (text: string) => string): TocItem[] {
  const items: TocItem[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'heading') {
      const text = node.textContent;
      const id = slugify(text);
      if (id) items.push({ id, level: node.attrs.level as number, text });
    }
    return true;
  });
  return items;
}

function Toc({ editor, slugify }: TocProps) {
  const [items, setItems] = useState<TocItem[]>(() => computeToc(editor, slugify));

  useEffect(() => {
    const update = () => setItems(computeToc(editor, slugify));
    update();
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor, slugify]);

  // Não usa document.getElementById: o atributo id só é (re)atribuído aos headings
  // no listener de 'update' do editor (App.tsx), que não dispara em modo Reading
  // (somente-leitura) — então, ao entrar direto nessa aba, os ids podem nunca ter
  // sido escritos no DOM recém-montado. Busca pelo texto slugificado diretamente,
  // igual à navegação de links internos (#heading) em handleEditorClick.
  const handleClick = (id: string) => {
    for (const h of document.querySelectorAll(
      '.reading-view .ProseMirror h1, .reading-view .ProseMirror h2, .reading-view .ProseMirror h3, .reading-view .ProseMirror h4, .reading-view .ProseMirror h5, .reading-view .ProseMirror h6'
    )) {
      if (slugify(h.textContent ?? '') === id) {
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  };

  return (
    <nav className="toc-panel">
      <span className="toc-panel__title">Contents</span>
      {items.length === 0 ? (
        <p className="toc-panel__empty">No headings</p>
      ) : (
        <ul>
          {items.map((item, i) => (
            <li key={`${item.id}-${i}`} className={`toc-level-${item.level}`}>
              <button type="button" onClick={() => handleClick(item.id)}>{item.text}</button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

export default Toc;
