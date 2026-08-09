import { Node, mergeAttributes } from '@tiptap/core';

// Representa um <div align="..."> / <div style="text-align:..."> "cru" do markdown
// (padrão comum em README do GitHub para centralizar banners, badges e tabelas).
// Sem este nó, o <div> não tem nenhuma regra de schema — o parser HTML embutido no
// @tiptap/markdown o trata como "transparente" (ignora a tag, mantém só os filhos),
// e o alinhamento se perde tanto na renderização quanto ao salvar de volta (Visual →
// Source apaga a tag). Só reivindicamos divs que declaram alinhamento explicitamente
// (getAttrs retorna `false` para qualquer outro <div>) — isso deixa intocado qualquer
// outro uso de <div> no HTML (ex: wrappers de NodeView como o do CodeBlockWithCopy),
// evitando que colem sem querer nessa regra ao colar conteúdo copiado do editor.
const ALIGNMENTS = ['left', 'center', 'right', 'justify'];

function resolveAlign(element: Element): string | false {
  const attrAlign = element.getAttribute('align');
  const styleMatch = /text-align:\s*(left|center|right|justify)/i.exec(element.getAttribute('style') || '');
  const value = (attrAlign || styleMatch?.[1] || '').toLowerCase();
  return ALIGNMENTS.includes(value) ? value : false;
}

export interface DivBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

const DivBlock = Node.create<DivBlockOptions>({
  name: 'divBlock',
  group: 'block',
  content: 'block+',

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      align: {
        default: null,
        renderHTML: (attrs: { align?: string | null }) =>
          attrs.align ? { style: `text-align: ${attrs.align}` } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div',
        getAttrs: (element) => {
          if (!(element instanceof Element)) return false;
          const align = resolveAlign(element);
          return align ? { align } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  renderMarkdown(node: { attrs?: { align?: string | null }; content?: unknown[] }, { renderChildren }: { renderChildren: (c: unknown[], separator?: string) => string }) {
    const align = node.attrs?.align;
    const inner = renderChildren(node.content ?? [], '\n\n');
    return align ? `<div align="${align}">\n\n${inner}\n\n</div>` : inner;
  },
});

export default DivBlock;
