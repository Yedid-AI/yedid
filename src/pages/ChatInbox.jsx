import { useState, useMemo, useEffect, useRef } from 'react'
import {
  useChatConversations,
  useChatConversation,
  useChatMessages,
  useSendChatMessage,
  useSendChatAttachment,
  useResolveChatConversation,
  useToggleChatAi,
  useMarkChatRead,
  useChatInboxes,
} from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Send, Search, CheckCircle, Bot, BotOff, MessageSquare,
  Phone, Mail, User, Inbox as InboxIcon, Paperclip, Mic, Square,
  FileText, Image as ImageIcon, Film, Music,
} from 'lucide-react'
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale/fr'
import { enUS } from 'date-fns/locale/en-US'
import { he as heLocale } from 'date-fns/locale/he'

const calendarLocales = { fr: frLocale, en: enUS, he: heLocale }

const STATUS_COLORS = {
  open: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  resolved: 'bg-gray-500/10 text-gray-500',
  snoozed: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
}

const CHANNEL_LABELS = {
  website: 'Website',
  api: 'API',
  gmail: 'Gmail',
  whatsapp_unipile: 'WhatsApp',
  whatsapp_business_manual: 'WhatsApp Business',
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

function formatRelative(dateStr, locale) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return format(d, 'HH:mm')
  return formatDistanceToNow(d, { addSuffix: true, locale: calendarLocales[locale] || frLocale })
}

export default function ChatInbox() {
  const { t, locale } = useI18n()
  usePageTitle(t('chatInbox.title') || 'Boîte de réception')

  const [filters, setFilters] = useState({ status: 'open', search: '', inbox_id: '' })
  const [selectedId, setSelectedId] = useState(null)

  const { data: inboxes } = useChatInboxes()
  const { data: conversations = [], isLoading } = useChatConversations(filters)
  const { data: selected } = useChatConversation(selectedId)
  const { data: messages = [] } = useChatMessages(selectedId)
  const markRead = useMarkChatRead()

  // Auto-mark as read when selecting
  useEffect(() => {
    if (selectedId && selected?.unread_count > 0) {
      markRead.mutate(selectedId)
    }
  }, [selectedId, selected?.unread_count])

  // Auto-select first conversation on load
  useEffect(() => {
    if (!selectedId && conversations.length > 0) {
      setSelectedId(conversations[0].id)
    }
  }, [conversations, selectedId])

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 overflow-hidden">
      {/* Left: conversation list */}
      <aside className="w-80 shrink-0 border-r flex flex-col">
        <ConversationListHeader
          filters={filters}
          setFilters={setFilters}
          inboxes={inboxes || []}
        />
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Chargement…</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Aucune conversation.</div>
          ) : (
            conversations.map(c => (
              <ConversationItem
                key={c.id}
                conversation={c}
                selected={c.id === selectedId}
                onClick={() => setSelectedId(c.id)}
                locale={locale}
              />
            ))
          )}
        </div>
      </aside>

      {/* Center: message thread */}
      <main className="flex-1 flex flex-col min-w-0">
        {selectedId && selected ? (
          <>
            <ConversationHeader conversation={selected} />
            <MessageThread
              conversationId={selectedId}
              messages={messages}
              locale={locale}
              currentLead={selected.leads}
            />
            <MessageInput conversationId={selectedId} aiDisabled={selected.ai_disabled} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <MessageSquare className="h-8 w-8 mr-2 opacity-50" />
            Sélectionnez une conversation
          </div>
        )}
      </main>

      {/* Right: lead sidebar */}
      <aside className="w-72 shrink-0 border-l overflow-y-auto">
        {selected?.leads ? (
          <LeadSidebar lead={selected.leads} conversation={selected} />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Aucun contact sélectionné.</div>
        )}
      </aside>
    </div>
  )
}

function ConversationListHeader({ filters, setFilters, inboxes }) {
  return (
    <div className="p-3 border-b space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          placeholder="Rechercher…"
          className="pl-8 h-9"
        />
      </div>
      <div className="flex gap-2">
        <Select value={filters.status || 'all'} onValueChange={v => setFilters(f => ({ ...f, status: v === 'all' ? '' : v }))}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="open">Ouvertes</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="resolved">Résolues</SelectItem>
            <SelectItem value="snoozed">Reportées</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.inbox_id || 'all'} onValueChange={v => setFilters(f => ({ ...f, inbox_id: v === 'all' ? '' : v }))}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Inbox" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous canaux</SelectItem>
            {inboxes.map(ib => (
              <SelectItem key={ib.id} value={ib.id}>
                {ib.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function ConversationItem({ conversation, selected, onClick, locale }) {
  const lead = conversation.leads
  const lastMsg = conversation.last_message
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border-b hover:bg-muted/50 transition flex gap-3 ${selected ? 'bg-muted' : ''}`}
    >
      <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 text-primary font-medium flex items-center justify-center text-sm">
        {initials(lead?.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="font-medium text-sm truncate">{lead?.name || '—'}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {formatRelative(conversation.last_message_at, locale)}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Badge variant="outline" className={`text-[10px] py-0 px-1.5 h-4 ${STATUS_COLORS[conversation.status] || ''}`}>
            {CHANNEL_LABELS[conversation.channel] || conversation.channel}
          </Badge>
          {conversation.ai_disabled && (
            <BotOff className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-1">
          {lastMsg?.content || '—'}
        </p>
        {conversation.unread_count > 0 && (
          <Badge className="mt-1 h-4 px-1.5 text-[10px]">{conversation.unread_count}</Badge>
        )}
      </div>
    </button>
  )
}

function ConversationHeader({ conversation }) {
  const lead = conversation.leads
  const resolveMut = useResolveChatConversation()
  const toggleAi = useToggleChatAi()

  return (
    <div className="border-b p-3 flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary font-medium flex items-center justify-center">
        {initials(lead?.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{lead?.name || '—'}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] py-0 px-1.5 h-4 ${STATUS_COLORS[conversation.status]}`}>
            {conversation.status}
          </Badge>
          <span>{CHANNEL_LABELS[conversation.channel] || conversation.channel}</span>
        </div>
      </div>
      <Button
        size="sm"
        variant={conversation.ai_disabled ? 'default' : 'outline'}
        onClick={() => toggleAi.mutate(conversation.id)}
        title={conversation.ai_disabled ? 'Réactiver l\'AI' : 'Désactiver l\'AI'}
      >
        {conversation.ai_disabled ? <BotOff className="h-4 w-4 mr-1" /> : <Bot className="h-4 w-4 mr-1" />}
        AI
      </Button>
      {conversation.status !== 'resolved' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => resolveMut.mutate(conversation.id)}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          Résoudre
        </Button>
      )}
    </div>
  )
}

function MessageThread({ conversationId, messages, locale, currentLead }) {
  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages?.length, conversationId])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map(m => (
        <MessageBubble key={m.id} message={m} locale={locale} leadName={currentLead?.name} />
      ))}
      {messages.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-12">
          Aucun message dans cette conversation.
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message, locale, leadName }) {
  const isContact = message.sender_type === 'contact'
  const isPrivate = message.is_private
  const senderLabel = isContact
    ? (leadName || 'Contact')
    : message.sender_type === 'bot'
      ? 'AI'
      : (message.agent?.email || 'Agent')

  const attachments = Array.isArray(message.attachments) ? message.attachments : []

  return (
    <div className={`flex ${isContact ? 'justify-start' : 'justify-end'}`}>
      <div className="max-w-[70%]">
        <div className={`text-[11px] mb-0.5 ${isContact ? 'text-left' : 'text-right'} text-muted-foreground`}>
          {senderLabel} · {formatRelative(message.created_at, locale)}
          {message.delivery_status === 'failed' && <span className="ml-1 text-red-500">(échec)</span>}
        </div>
        <div className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          isPrivate
            ? 'bg-yellow-500/10 border border-yellow-500/30 text-foreground'
            : isContact
              ? 'bg-muted'
              : 'bg-primary text-primary-foreground'
        }`}>
          {isPrivate && <div className="text-[10px] font-medium mb-1 opacity-70">📝 NOTE PRIVÉE</div>}
          {attachments.length > 0 && (
            <div className="mb-1.5 space-y-1.5">
              {attachments.map((a, i) => <AttachmentPreview key={i} attachment={a} />)}
            </div>
          )}
          {message.content}
        </div>
      </div>
    </div>
  )
}

function AttachmentPreview({ attachment }) {
  const { type, url, file_name } = attachment || {}
  if (!url) return null

  if (type === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={file_name} className="max-h-48 rounded" />
      </a>
    )
  }
  if (type === 'video') {
    return <video src={url} controls className="max-h-48 rounded" />
  }
  if (type === 'audio') {
    return <audio src={url} controls className="max-w-full" />
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
      <FileText className="h-4 w-4" /> {file_name || 'Fichier'}
    </a>
  )
}

function MessageInput({ conversationId, aiDisabled }) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const fileRef = useRef(null)
  const recorderRef = useRef(null)
  const recordChunks = useRef([])

  const sendMut = useSendChatMessage(conversationId)
  const attachMut = useSendChatAttachment(conversationId)

  function send() {
    const c = text.trim()
    if (!c) return
    sendMut.mutate({ content: c })
    setText('')
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    attachMut.mutate({ file, content: text.trim() || '' })
    setText('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recordChunks.current = []
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunks.current.push(ev.data) }
      mr.onstop = () => {
        const blob = new Blob(recordChunks.current, { type: 'audio/webm' })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        attachMut.mutate({ file, content: '' })
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      recorderRef.current = mr
      setRecording(true)
    } catch (err) {
      console.error('Mic access denied:', err)
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  return (
    <div className="border-t p-3">
      {!aiDisabled && (
        <div className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1">
          <Bot className="h-3 w-3" />
          L'AI est active. Vos messages remplacent sa réponse.
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={onFile}
        accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
      />
      <div className="flex gap-2 items-end">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileRef.current?.click()}
          disabled={attachMut.isPending || recording}
          title="Joindre un fichier"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button
          variant={recording ? 'destructive' : 'ghost'}
          size="icon"
          onClick={recording ? stopRecording : startRecording}
          disabled={attachMut.isPending}
          title={recording ? 'Arrêter' : 'Message vocal'}
        >
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={recording ? 'Enregistrement…' : 'Tapez votre message…'}
          rows={2}
          className="resize-none"
          disabled={recording}
        />
        <Button
          onClick={send}
          disabled={!text.trim() || sendMut.isPending || attachMut.isPending || recording}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {(attachMut.isPending) && (
        <div className="text-[11px] text-muted-foreground mt-1">Envoi en cours…</div>
      )}
    </div>
  )
}

function LeadSidebar({ lead, conversation }) {
  return (
    <div className="p-4 space-y-4">
      <div className="text-center">
        <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 text-primary font-medium flex items-center justify-center text-xl">
          {initials(lead.name)}
        </div>
        <h3 className="mt-2 font-medium">{lead.name}</h3>
        {lead.status && (
          <Badge variant="outline" className="mt-1 text-[10px]">
            {lead.status}
          </Badge>
        )}
      </div>

      <div className="space-y-2 text-sm">
        {lead.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a>
          </div>
        )}
        {lead.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
          </div>
        )}
        {lead.city && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-[11px]">📍 {lead.city}</span>
          </div>
        )}
        {lead.branch && (
          <div className="text-xs text-muted-foreground">Filiale: {lead.branch}</div>
        )}
        {lead.company && (
          <div className="text-xs text-muted-foreground">Société: {lead.company}</div>
        )}
        {lead.source && (
          <div className="text-xs text-muted-foreground">Source: {lead.source}</div>
        )}
      </div>

      <div className="pt-3 border-t">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => window.location.assign(`/leads?id=${lead.id}`)}
        >
          <User className="h-4 w-4 mr-1" /> Fiche du lead
        </Button>
      </div>
    </div>
  )
}
