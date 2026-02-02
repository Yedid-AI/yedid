import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Markdown } from 'tiptap-markdown'
import { common, createLowlight } from 'lowlight'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Code, Highlighter, Link as LinkIcon, Unlink,
  Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Minus, Check, X, GripVertical, Plus,
} from 'lucide-react'

const lowlight = createLowlight(common)

// ─── Slash command items (translated via i18n) ──────────
function getSlashItems(t) {
  return [
    { id: 'h1', label: t('editor.slashH1'), description: t('editor.slashH1Desc'), icon: Heading1, keywords: ['h1', 'heading', 'titre'], action: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: 'h2', label: t('editor.slashH2'), description: t('editor.slashH2Desc'), icon: Heading2, keywords: ['h2', 'heading', 'titre'], action: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: 'h3', label: t('editor.slashH3'), description: t('editor.slashH3Desc'), icon: Heading3, keywords: ['h3', 'heading', 'titre'], action: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run() },
    { id: 'bullet', label: t('editor.slashBullet'), description: t('editor.slashBulletDesc'), icon: List, keywords: ['bullet', 'list', 'puces', 'ul'], action: (ed) => ed.chain().focus().toggleBulletList().run() },
    { id: 'numbered', label: t('editor.slashNumbered'), description: t('editor.slashNumberedDesc'), icon: ListOrdered, keywords: ['numbered', 'ordered', 'numero', 'ol'], action: (ed) => ed.chain().focus().toggleOrderedList().run() },
    { id: 'quote', label: t('editor.slashQuote'), description: t('editor.slashQuoteDesc'), icon: Quote, keywords: ['quote', 'blockquote', 'citation'], action: (ed) => ed.chain().focus().toggleBlockquote().run() },
    { id: 'code', label: t('editor.slashCode'), description: t('editor.slashCodeDesc'), icon: Code, keywords: ['code', 'codeblock', 'pre'], action: (ed) => ed.chain().focus().toggleCodeBlock().run() },
    { id: 'divider', label: t('editor.slashDivider'), description: t('editor.slashDividerDesc'), icon: Minus, keywords: ['divider', 'hr', 'separator', 'ligne'], action: (ed) => ed.chain().focus().setHorizontalRule().run() },
  ]
}

// ─── Slash command dropdown ──────────────────────────────
function SlashCommandMenu({ items, selectedIndex, onSelect, onHover, position }) {
  const menuRef = useRef(null)

  useEffect(() => {
    const el = menuRef.current?.children[selectedIndex]
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (items.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="absolute z-50 w-60 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ top: position.top, left: position.left }}
    >
      {items.map((item, index) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            )}
            onClick={() => onSelect(item)}
            onMouseEnter={() => onHover(index)}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
              <Icon className="h-4 w-4" />
            </div>
            <div className="text-left">
              <div className="font-medium">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Bubble menu button ──────────────────────────────────
function BubbleButton({ children, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded p-1.5 transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {children}
    </button>
  )
}

// ─── Main editor component ──────────────────────────────
function RichEditor({
  value,
  onChange,
  placeholder,
  minHeight = '200px',
  maxHeight = '600px',
  editable = true,
  className,
}) {
  const { t } = useI18n()
  const resolvedPlaceholder = placeholder || t('editor.placeholder')
  const slashItems = useMemo(() => getSlashItems(t), [t])
  const containerRef = useRef(null)

  // Slash command state
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashPos, setSlashPos] = useState({ top: 0, left: 0 })
  const [slashRange, setSlashRange] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Link input state (bubble menu)
  const [linkMode, setLinkMode] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [savedSelection, setSavedSelection] = useState(null)

  // Refs for event-handler closures
  const slashOpenRef = useRef(false)
  const selectedIndexRef = useRef(0)
  const slashRangeRef = useRef(null)
  const filteredItemsRef = useRef(slashItems)
  const linkModeRef = useRef(false)
  const editorRef = useRef(null)

  // Block drag handle state
  const [blockHandle, setBlockHandle] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dropLine, setDropLine] = useState(null)
  const dragSourcePosRef = useRef(null)
  const dropTargetPosRef = useRef(null)
  const blockHandleRef = useRef(null)

  useEffect(() => { slashOpenRef.current = slashOpen }, [slashOpen])
  useEffect(() => { selectedIndexRef.current = selectedIndex }, [selectedIndex])
  useEffect(() => { slashRangeRef.current = slashRange }, [slashRange])
  useEffect(() => { linkModeRef.current = linkMode }, [linkMode])

  // Filter slash items by query
  const filteredItems = useMemo(() => {
    if (!slashQuery) return slashItems
    const q = slashQuery.toLowerCase()
    return slashItems.filter(item =>
      item.id.includes(q) ||
      item.label.toLowerCase().includes(q) ||
      item.keywords.some(k => k.includes(q))
    )
  }, [slashQuery, slashItems])

  useEffect(() => { filteredItemsRef.current = filteredItems }, [filteredItems])

  // Detect slash command context from cursor position
  const checkSlashCommand = useCallback((ed) => {
    const { state } = ed
    const { from, empty } = state.selection

    if (!empty) { setSlashOpen(false); return }

    const $from = state.doc.resolve(from)
    const start = Math.max(0, $from.parentOffset - 30)
    const textBefore = $from.parent.textBetween(start, $from.parentOffset, undefined, '\ufffc')

    const match = textBefore.match(/\/([\w]*)$/)
    if (match) {
      setSlashQuery(match[1])
      setSlashOpen(true)
      setSelectedIndex(0)

      const startPos = from - match[0].length
      setSlashRange({ from: startPos, to: from })

      if (containerRef.current) {
        const coords = ed.view.coordsAtPos(startPos)
        const rect = containerRef.current.getBoundingClientRect()
        setSlashPos({
          top: coords.bottom - rect.top + containerRef.current.scrollTop + 4,
          left: Math.max(0, coords.left - rect.left),
        })
      }
    } else {
      setSlashOpen(false)
    }
  }, [])

  // Execute a slash command: delete the /query text then run the action
  const execSlashCommand = useCallback((item) => {
    const ed = editorRef.current
    if (!ed || !slashRangeRef.current) return
    ed.chain().focus().deleteRange(slashRangeRef.current).run()
    item.action(ed)
    setSlashOpen(false)
  }, [])

  // ── Tiptap editor instance ──
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder: resolvedPlaceholder }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline cursor-pointer' },
      }),
      Underline,
      Highlight.configure({
        HTMLAttributes: { class: 'bg-yellow-100 dark:bg-yellow-900/50 rounded-sm px-0.5' },
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Markdown.configure({
        html: true,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    content: value || '',
    editable,
    editorProps: {
      attributes: {
        class: 'outline-none',
        style: `min-height:${minHeight};max-height:${maxHeight}`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = ed.storage.markdown.getMarkdown()
      onChange?.(md)
      checkSlashCommand(ed)
    },
    onSelectionUpdate: ({ editor: ed }) => {
      checkSlashCommand(ed)
    },
  })

  useEffect(() => { editorRef.current = editor }, [editor])

  // Keep editable in sync
  useEffect(() => {
    if (editor) editor.setEditable(editable)
  }, [editor, editable])

  // Keyboard handler for slash menu (capture phase to intercept before ProseMirror)
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom

    const handleKeyDown = (e) => {
      if (!slashOpenRef.current) return
      const items = filteredItemsRef.current

      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        setSlashOpen(false)
        return
      }
      if (items.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        setSelectedIndex(i => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation()
        execSlashCommand(items[selectedIndexRef.current])
      }
    }

    dom.addEventListener('keydown', handleKeyDown, true)
    return () => dom.removeEventListener('keydown', handleKeyDown, true)
  }, [editor, execSlashCommand])

  // Close slash menu on outside click
  useEffect(() => {
    if (!slashOpen) return
    const handleClick = (e) => {
      if (!containerRef.current?.contains(e.target)) setSlashOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [slashOpen])

  // Sync external value changes (e.g. form reset, API load)
  useEffect(() => {
    if (!editor || value == null) return
    const currentMd = editor.storage.markdown.getMarkdown()
    const norm = (s) => (s || '').replace(/\n+$/, '')
    if (norm(value) !== norm(currentMd)) {
      editor.commands.setContent(value)
    }
  }, [editor, value])

  // ── Link handling ──
  const handleLinkClick = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    setSavedSelection({ from, to })
    setLinkUrl(editor.getAttributes('link').href || '')
    setLinkMode(true)
  }, [editor])

  const applyLink = useCallback(() => {
    if (!editor || !linkUrl) return
    if (savedSelection) {
      editor.chain().focus().setTextSelection(savedSelection).setLink({ href: linkUrl }).run()
    }
    setLinkMode(false)
    setLinkUrl('')
    setSavedSelection(null)
  }, [editor, linkUrl, savedSelection])

  const removeLink = useCallback(() => {
    if (!editor) return
    editor.chain().focus().unsetLink().run()
  }, [editor])

  // ── Block handle: find block at mouse position ──
  const findBlockFromCoords = useCallback((clientX, clientY) => {
    if (!editor?.view) return null
    let posInfo = editor.view.posAtCoords({ left: clientX, top: clientY })
    if (!posInfo) {
      const editorRect = editor.view.dom.getBoundingClientRect()
      posInfo = editor.view.posAtCoords({ left: editorRect.left + 60, top: clientY })
    }
    if (!posInfo) return null
    try {
      const $pos = editor.state.doc.resolve(posInfo.pos)
      if ($pos.depth < 1) return null
      const blockPos = $pos.before(1)
      const node = editor.state.doc.nodeAt(blockPos)
      const dom = editor.view.nodeDOM(blockPos)
      if (!node || !(dom instanceof HTMLElement)) return null
      return { pos: blockPos, node, dom }
    } catch { return null }
  }, [editor])

  // Show handle on hover
  const handleEditorMouseMove = useCallback((e) => {
    if (!editor || !containerRef.current || isDragging || !editable) return
    if (blockHandleRef.current?.contains(e.target)) return
    // Mouse in the left handle zone → keep current handle visible
    const containerRect = containerRef.current.getBoundingClientRect()
    if (blockHandle && e.clientX < containerRect.left + 48) return
    const block = findBlockFromCoords(e.clientX, e.clientY)
    if (!block) { setBlockHandle(null); return }
    const blockRect = block.dom.getBoundingClientRect()
    setBlockHandle({ top: blockRect.top - containerRect.top + 2, pos: block.pos })
  }, [editor, isDragging, editable, findBlockFromCoords, blockHandle])

  const handleEditorMouseLeave = useCallback(() => {
    if (!isDragging) setBlockHandle(null)
  }, [isDragging])

  // + button → insert empty block below
  const handleAddBlock = useCallback(() => {
    if (!editor || !blockHandle) return
    const node = editor.state.doc.nodeAt(blockHandle.pos)
    if (!node) return
    const insertPos = blockHandle.pos + node.nodeSize
    editor.chain().focus().insertContentAt(insertPos, { type: 'paragraph' }).setTextSelection(insertPos + 1).run()
    setBlockHandle(null)
  }, [editor, blockHandle])

  // Grip mousedown → manual drag (avoids HTML5 DnD + ProseMirror conflicts)
  const handleGripMouseDown = useCallback((e) => {
    if (!editor || !blockHandle) return
    e.preventDefault()

    const sourcePos = blockHandle.pos
    dragSourcePosRef.current = sourcePos
    setIsDragging(true)

    // Dim the source block
    const srcDom = editor.view.nodeDOM(sourcePos)
    if (srcDom instanceof HTMLElement) srcDom.style.opacity = '0.4'

    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    const onMouseMove = (me) => {
      if (!containerRef.current || !editor) return
      const containerRect = containerRef.current.getBoundingClientRect()
      let best = null, minDist = Infinity
      editor.state.doc.forEach((node, pos) => {
        const dom = editor.view.nodeDOM(pos)
        if (!(dom instanceof HTMLElement)) return
        const rect = dom.getBoundingClientRect()
        const dTop = Math.abs(me.clientY - rect.top)
        if (dTop < minDist) { minDist = dTop; best = { top: rect.top - containerRect.top, targetPos: pos } }
        const dBot = Math.abs(me.clientY - rect.bottom)
        if (dBot < minDist) { minDist = dBot; best = { top: rect.bottom - containerRect.top, targetPos: pos + node.nodeSize } }
      })
      if (best) {
        const srcNode = editor.state.doc.nodeAt(sourcePos)
        if (srcNode && (best.targetPos === sourcePos || best.targetPos === sourcePos + srcNode.nodeSize)) {
          setDropLine(null); dropTargetPosRef.current = null; return
        }
        dropTargetPosRef.current = best.targetPos
        setDropLine(best)
      }
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (srcDom instanceof HTMLElement) srcDom.style.opacity = ''

      const targetPos = dropTargetPosRef.current
      if (targetPos != null && editor) {
        const node = editor.state.doc.nodeAt(sourcePos)
        if (node && targetPos !== sourcePos && targetPos !== sourcePos + node.nodeSize) {
          const clone = node.copy(node.content)
          const tr = editor.state.tr
          tr.delete(sourcePos, sourcePos + node.nodeSize)
          tr.insert(tr.mapping.map(targetPos), clone)
          editor.view.dispatch(tr)
        }
      }

      setIsDragging(false); setDropLine(null); setBlockHandle(null)
      dragSourcePosRef.current = null; dropTargetPosRef.current = null
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [editor, blockHandle])

  // Hide handle on editor scroll
  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom
    const hide = () => setBlockHandle(null)
    el.addEventListener('scroll', hide, { passive: true })
    return () => el.removeEventListener('scroll', hide)
  }, [editor])

  if (!editor) return null

  return (
    <div
      ref={containerRef}
      onMouseMove={handleEditorMouseMove}
      onMouseLeave={handleEditorMouseLeave}
      className={cn(
        "rich-editor relative rounded-md border bg-background transition-shadow",
        editable && "focus-within:ring-1 focus-within:ring-ring focus-within:border-ring",
        // Editor base
        "[&_.tiptap]:pl-11 [&_.tiptap]:pr-3 [&_.tiptap]:py-2 [&_.tiptap]:outline-none [&_.tiptap]:overflow-y-auto",
        // Headings
        "[&_.tiptap_h1]:text-2xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mt-4 [&_.tiptap_h1]:mb-1",
        "[&_.tiptap_h2]:text-xl [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:mt-3 [&_.tiptap_h2]:mb-1",
        "[&_.tiptap_h3]:text-lg [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mt-2 [&_.tiptap_h3]:mb-1",
        // Lists
        "[&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_ul]:my-1",
        "[&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_ol]:my-1",
        "[&_.tiptap_li]:my-0.5",
        // Blockquote
        "[&_.tiptap_blockquote]:border-l-4 [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:pl-4 [&_.tiptap_blockquote]:my-2 [&_.tiptap_blockquote]:text-muted-foreground [&_.tiptap_blockquote]:italic",
        // Code block
        "[&_.tiptap_pre]:bg-muted [&_.tiptap_pre]:rounded-md [&_.tiptap_pre]:p-3 [&_.tiptap_pre]:my-2 [&_.tiptap_pre]:font-mono [&_.tiptap_pre]:text-sm [&_.tiptap_pre]:overflow-x-auto",
        // Inline code (override for code inside pre)
        "[&_.tiptap_code]:bg-muted [&_.tiptap_code]:rounded [&_.tiptap_code]:px-1.5 [&_.tiptap_code]:py-0.5 [&_.tiptap_code]:font-mono [&_.tiptap_code]:text-sm",
        "[&_.tiptap_pre_code]:bg-transparent [&_.tiptap_pre_code]:rounded-none [&_.tiptap_pre_code]:p-0",
        // Horizontal rule
        "[&_.tiptap_hr]:border-border [&_.tiptap_hr]:my-4",
        // Paragraphs
        "[&_.tiptap_p]:my-1",
        className
      )}
    >
      {/* Placeholder pseudo-element styles */}
      <style>{`
        .rich-editor .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--color-muted-foreground);
          pointer-events: none;
          height: 0;
        }
      `}</style>

      {/* ── Block handle (+ and ⋮⋮) ── */}
      {blockHandle && !slashOpen && editable && (
        <div
          ref={blockHandleRef}
          className={cn(
            "absolute left-1 flex items-center gap-0 z-10 transition-opacity",
            isDragging && "opacity-0 pointer-events-none"
          )}
          style={{ top: blockHandle.top }}
        >
          <button
            type="button"
            className="flex items-center justify-center h-5 w-5 rounded hover:bg-accent text-muted-foreground/30 hover:text-muted-foreground transition-colors"
            onClick={handleAddBlock}
            tabIndex={-1}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <div
            className="flex items-center justify-center h-5 w-5 rounded hover:bg-accent text-muted-foreground/30 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing"
            onMouseDown={handleGripMouseDown}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        </div>
      )}

      {/* ── Drop indicator ── */}
      {dropLine && (
        <div
          className="absolute left-11 right-3 h-0.5 bg-primary rounded-full pointer-events-none z-50"
          style={{ top: dropLine.top }}
        />
      )}

      {/* ── Bubble Menu (text selection toolbar) ── */}
      {editable && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ state }) => {
            if (linkModeRef.current) return true
            const { from, to } = state.selection
            return from !== to && !editor.isActive('codeBlock')
          }}
        >
          <div className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
            {linkMode ? (
              <div className="flex items-center gap-1 px-1">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); applyLink() }
                    if (e.key === 'Escape') { setLinkMode(false); setLinkUrl(''); setSavedSelection(null) }
                  }}
                  placeholder="https://..."
                  className="h-7 w-48 rounded border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                <button type="button" onClick={applyLink} className="rounded p-1 hover:bg-accent">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => { setLinkMode(false); setLinkUrl(''); setSavedSelection(null) }} className="rounded p-1 hover:bg-accent">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <BubbleButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
                  <Bold className="h-4 w-4" />
                </BubbleButton>
                <BubbleButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
                  <Italic className="h-4 w-4" />
                </BubbleButton>
                <BubbleButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
                  <UnderlineIcon className="h-4 w-4" />
                </BubbleButton>
                <BubbleButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
                  <Strikethrough className="h-4 w-4" />
                </BubbleButton>
                <div className="mx-0.5 h-5 w-px bg-border" />
                <BubbleButton active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
                  <Code className="h-4 w-4" />
                </BubbleButton>
                <BubbleButton active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}>
                  <Highlighter className="h-4 w-4" />
                </BubbleButton>
                <div className="mx-0.5 h-5 w-px bg-border" />
                {editor.isActive('link') ? (
                  <BubbleButton onClick={removeLink}>
                    <Unlink className="h-4 w-4" />
                  </BubbleButton>
                ) : (
                  <BubbleButton onClick={handleLinkClick}>
                    <LinkIcon className="h-4 w-4" />
                  </BubbleButton>
                )}
              </>
            )}
          </div>
        </BubbleMenu>
      )}

      {/* ── Slash Command Menu ── */}
      {slashOpen && filteredItems.length > 0 && (
        <SlashCommandMenu
          items={filteredItems}
          selectedIndex={selectedIndex}
          onSelect={execSlashCommand}
          onHover={setSelectedIndex}
          position={slashPos}
        />
      )}

      {/* ── Editor Content ── */}
      <EditorContent editor={editor} />
    </div>
  )
}

export { RichEditor }
