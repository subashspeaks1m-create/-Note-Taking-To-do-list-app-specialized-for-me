import type { JSONContent } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';
import { safeHref } from './DocView';

export interface RichEditorChange {
  doc: JSONContent;
  plainText: string;
}

interface Props {
  initial: JSONContent;
  placeholder: string;
  label: string;
  onChange: (change: RichEditorChange) => void;
  /** Bumped when the stored document must replace the editor's content (restore, other tab). */
  resetKey: number;
  resetDoc: JSONContent;
  autoFocus?: boolean;
}

export function plainTextOf(editor: Editor): string {
  return editor.getText({ blockSeparator: '\n\n' }).replace(/\n{3,}/g, '\n\n');
}

/**
 * The paragraph editor. Lazy-loaded so TipTap only downloads when writing.
 * Content is a structured document (no raw HTML is ever stored or injected);
 * links are limited to http(s) and mailto.
 */
export default function RichEditor({ initial, placeholder, label, onChange, resetKey, resetDoc, autoFocus }: Props) {
  const onChangeRef = useRef(onChange);
  const placeholderRef = useRef(placeholder);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          protocols: ['http', 'https', 'mailto'],
          isAllowedUri: (url) => safeHref(url) !== null || /^[\w.-]+\.[a-z]{2,}/i.test(url),
        },
      }),
      // Read through a ref so a kind change updates the hint without rebuilding the editor.
      // The function runs when ProseMirror decorates, never during React render.
      // eslint-disable-next-line react-hooks/refs
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
    ],
    content: initial,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'prose prose--editor',
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: ed }) => onChangeRef.current({ doc: ed.getJSON(), plainText: plainTextOf(ed) }),
  });

  // Replace content only when the parent says the stored version should win.
  const lastReset = useRef(resetKey);
  useEffect(() => {
    if (!editor || lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    editor.commands.setContent(resetDoc, { emitUpdate: false });
  }, [editor, resetKey, resetDoc]);

  useEffect(() => {
    placeholderRef.current = placeholder;
    if (!editor || editor.isDestroyed || !editor.isInitialized) return;
    editor.view.dispatch(editor.state.tr);
  }, [editor, placeholder]);

  return (
    <div className="rich">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="rich__content" />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      code: e.isActive('code'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const btn = (key: keyof typeof state, labelText: string, glyph: string, run: () => void) => (
    <button
      type="button"
      className={`rich__btn ${key === 'italic' ? 'rich__btn--italic' : ''}`}
      aria-pressed={state[key]}
      aria-label={labelText}
      title={labelText}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {glyph}
    </button>
  );

  const applyLink = () => {
    const raw = url.trim();
    if (!raw) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = safeHref(raw) ?? safeHref(`https://${raw}`);
    if (!href || /^https?:\/\/[^.]+$/.test(href)) {
      setLinkError('Use a web address like https://example.com');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
  };

  return (
    <div className="rich__toolbar" role="toolbar" aria-label="Formatting">
      {btn('bold', 'Bold (Ctrl+B)', 'B', () => editor.chain().focus().toggleBold().run())}
      {btn('italic', 'Italic (Ctrl+I)', 'I', () => editor.chain().focus().toggleItalic().run())}
      {btn('code', 'Inline code', '</>', () => editor.chain().focus().toggleCode().run())}
      <span className="rich__sep" aria-hidden="true" />
      {btn('h2', 'Heading', 'H', () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {btn('h3', 'Subheading', 'h', () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
      {btn('bullet', 'Bulleted list', '•', () => editor.chain().focus().toggleBulletList().run())}
      {btn('ordered', 'Numbered list', '1.', () => editor.chain().focus().toggleOrderedList().run())}
      {btn('quote', 'Quote', '❝', () => editor.chain().focus().toggleBlockquote().run())}
      <span className="rich__sep" aria-hidden="true" />
      <button
        type="button"
        className="rich__btn"
        aria-pressed={state.link}
        aria-expanded={linkOpen}
        aria-label="Link"
        title="Link"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setUrl((editor.getAttributes('link').href as string | undefined) ?? '');
          setLinkError(null);
          setLinkOpen((v) => !v);
        }}
      >
        ↗
      </button>
      {linkOpen && (
        <div className="rich__link">
          <label className="visually-hidden" htmlFor="rich-link-url">
            Link address
          </label>
          <input
            id="rich-link-url"
            className="input input--sm"
            value={url}
            placeholder="https://"
            autoFocus
            onChange={(e) => {
              setUrl(e.target.value);
              setLinkError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setLinkOpen(false);
                editor.commands.focus();
              }
            }}
          />
          <button type="button" className="btn btn--quiet btn--sm" onClick={applyLink}>
            {url.trim() ? 'Apply' : 'Remove'}
          </button>
          {linkError && (
            <span className="form-error" role="alert">
              {linkError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
