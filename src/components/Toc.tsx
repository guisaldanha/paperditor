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

  const handleClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
