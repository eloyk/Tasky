import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Link as LinkIcon,
  Undo,
  Redo
} from 'lucide-react';
import { Button } from './button';
import { forwardRef, useEffect, useImperativeHandle } from 'react';

interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export interface RichTextEditorRef {
  setContent: (content: string) => void;
  getHTML: () => string;
  clear: () => void;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ value = '', onChange, placeholder = 'Escribe aquí...', className = '' }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
        }),
        Placeholder.configure({
          placeholder,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-primary underline cursor-pointer',
          },
        }),
      ],
      content: value,
      editorProps: {
        attributes: {
          class: 'prose prose-sm max-w-none focus:outline-none min-h-32 p-4 text-sm',
        },
      },
      onUpdate: ({ editor }) => {
        onChange?.(editor.getHTML());
      },
    });

    useEffect(() => {
      if (editor && value !== editor.getHTML()) {
        editor.commands.setContent(value);
      }
    }, [value, editor]);

    useImperativeHandle(ref, () => ({
      setContent: (content: string) => {
        editor?.commands.setContent(content);
      },
      getHTML: () => {
        return editor?.getHTML() || '';
      },
      clear: () => {
        editor?.commands.clearContent();
      },
    }));

    if (!editor) {
      return null;
    }

    const toggleLink = () => {
      const previousUrl = editor.getAttributes('link').href;
      const url = window.prompt('URL del enlace:', previousUrl);

      if (url === null) {
        return;
      }

      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return;
      }

      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    return (
      <div className={`border border-input rounded-md bg-background ${className}`}>
        <div className="border-b border-border p-2 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`h-8 px-2 ${editor.isActive('bold') ? 'bg-accent' : ''}`}
            data-testid="button-bold"
            aria-label="Negrita"
          >
            <Bold className="w-4 h-4" />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`h-8 px-2 ${editor.isActive('italic') ? 'bg-accent' : ''}`}
            data-testid="button-italic"
            aria-label="Cursiva"
          >
            <Italic className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`h-8 px-2 ${editor.isActive('bulletList') ? 'bg-accent' : ''}`}
            data-testid="button-bullet-list"
            aria-label="Lista con viñetas"
          >
            <List className="w-4 h-4" />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`h-8 px-2 ${editor.isActive('orderedList') ? 'bg-accent' : ''}`}
            data-testid="button-ordered-list"
            aria-label="Lista numerada"
          >
            <ListOrdered className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={toggleLink}
            className={`h-8 px-2 ${editor.isActive('link') ? 'bg-accent' : ''}`}
            data-testid="button-link"
            aria-label="Insertar enlace"
          >
            <LinkIcon className="w-4 h-4" />
          </Button>

          <div className="flex-1" />

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="h-8 px-2"
            data-testid="button-undo"
            aria-label="Deshacer"
          >
            <Undo className="w-4 h-4" />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="h-8 px-2"
            data-testid="button-redo"
            aria-label="Rehacer"
          >
            <Redo className="w-4 h-4" />
          </Button>
        </div>

        <EditorContent editor={editor} />
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';
