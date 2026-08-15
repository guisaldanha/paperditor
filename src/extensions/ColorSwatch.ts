import { Node, mergeAttributes } from '@tiptap/core';

// <span style="...background:#RRGGBB...">...</span> vazio: padrão comum em tabelas de
// paleta de cores geradas (ex: docs de tema VS Code) pra mostrar um quadradinho colorido
// ao lado do hex. Sem nó dedicado, o @tiptap/markdown reconhece <span> como tag HTML
// válida mas, por ser um par vazio, devolve o content do "doc" auto-preenchido (um nó de
// bloco "paragraph" solto) em vez do content inline esperado — RangeError: Invalid
// content for node type paragraph (mesma causa do EMPTY_HTML_PAIR_RE em App.tsx, que
// escapa esse padrão pra texto cru em qualquer outra tag vazia). Aqui, em vez de
// escapar, reivindicamos o <span> só quando ele é vazio e declara `background` no style
// — para qualquer outro span (com texto, ou vazio sem cor) a regra devolve `false` e ele
// cai no comportamento padrão (ou no escape genérico).
const ColorSwatch = Node.create({
  name: 'colorSwatch',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      style: {
        default: '',
        renderHTML: (attrs: { style?: string }) => (attrs.style ? { style: attrs.style } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (element) => {
          if (!(element instanceof Element) || element.childNodes.length > 0) return false;
          const style = element.getAttribute('style') || '';
          return /background/i.test(style) ? { style } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes)];
  },

  renderMarkdown(node: { attrs?: { style?: string } }) {
    return `<span style="${node.attrs?.style ?? ''}"></span>`;
  },
});

export default ColorSwatch;
