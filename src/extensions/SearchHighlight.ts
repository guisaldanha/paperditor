import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';

export interface SearchMatch {
  from: number;
  to: number;
}

interface SearchHighlightMeta {
  matches: SearchMatch[];
  activeIndex: number;
}

export const searchHighlightPluginKey = new PluginKey<DecorationSet>('searchHighlight');

// Procura todas as ocorrências de `query` (case-insensitive) dentro de cada nó
// de texto-bloco do documento (parágrafo, heading, célula de tabela, item de
// lista etc.), um bloco por vez — um match nunca cruza a fronteira entre dois
// blocos, mas cruza fronteiras de marks (negrito/itálico/link) dentro do mesmo
// bloco, já que o texto de todos os nós-filho é concatenado antes da busca.
export function findMatchesInDoc(doc: PMNode, query: string): SearchMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const lowerQuery = trimmed.toLowerCase();
  const matches: SearchMatch[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    let text = '';
    const posMap: number[] = [];
    node.descendants((child, offset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) {
          posMap.push(pos + 1 + offset + i);
        }
        text += child.text;
      }
      return true;
    });

    const lowerText = text.toLowerCase();
    let searchFrom = 0;
    let found = lowerText.indexOf(lowerQuery, searchFrom);
    while (found !== -1) {
      matches.push({
        from: posMap[found],
        to: posMap[found + lowerQuery.length - 1] + 1,
      });
      searchFrom = found + lowerQuery.length;
      found = lowerText.indexOf(lowerQuery, searchFrom);
    }

    return false;
  });

  return matches;
}

export function setSearchMatches(editor: Editor, matches: SearchMatch[], activeIndex: number) {
  const { state, view } = editor;
  view.dispatch(state.tr.setMeta(searchHighlightPluginKey, { matches, activeIndex } as SearchHighlightMeta));
}

export function clearSearchMatches(editor: Editor) {
  setSearchMatches(editor, [], -1);
}

const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(searchHighlightPluginKey) as SearchHighlightMeta | undefined;
            if (meta) {
              const decorations = meta.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class: i === meta.activeIndex ? 'search-match search-match--active' : 'search-match',
                })
              );
              return DecorationSet.create(tr.doc, decorations);
            }
            return tr.docChanged ? old.map(tr.mapping, tr.doc) : old;
          },
        },
        props: {
          decorations(state) {
            return searchHighlightPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});

export default SearchHighlight;
