import { useState } from 'react';
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';

const lowlight = createLowlight(common);

function CodeBlockView({ node }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const language = (node.attrs.language as string | null) || 'text';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível — ignora silenciosamente, sem fallback de UI.
    }
  };

  return (
    <NodeViewWrapper className="code-block-wrap">
      <div className="code-block-toolbar" contentEditable={false}>
        <span className="code-block-lang">{language}</span>
        <button type="button" className="code-block-copy-btn" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre><NodeViewContent<'code'> as="code" /></pre>
    </NodeViewWrapper>
  );
}

const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ lowlight });

export default CodeBlockWithCopy;
