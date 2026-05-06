import { useState, useEffect, useRef } from 'react'
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
  useLeadFields,
  useBranches,
} from '../hooks/queries'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { usePageTitle } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Send, Search, CheckCircle, Bot, BotOff, MessageSquare,
  Paperclip, Mic, Square, FileText, X, Building2, MapPin, Phone, Mail,
} from 'lucide-react'
import { format, formatDistanceToNow, isToday, isYesterday, differenceInMinutes } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale/fr'
import { enUS } from 'date-fns/locale/en-US'
import { he as heLocale } from 'date-fns/locale/he'
import { LeadDetail, LeadCommentInput } from './Leads'

const dateLocales = { fr: frLocale, en: enUS, he: heLocale }

const STATUS_COLORS = {
  open: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  resolved: 'bg-gray-500/10 text-muted-foreground border-gray-500/20',
  snoozed: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
}

function channelLabel(channel, t) {
  const map = {
    website: t('chatInbox.channelWebsite') || 'Website',
    api: t('chatInbox.channelApi') || 'API',
    gmail: t('chatInbox.channelGmail') || 'Gmail',
    whatsapp_unipile: t('chatInbox.channelWhatsappUnipile') || 'WhatsApp',
    whatsapp_business_manual: t('chatInbox.channelWhatsappBusiness') || 'WhatsApp Business',
  }
  return map[channel] || channel
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

function formatRelative(dateStr, locale) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const loc = dateLocales[locale] || frLocale
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return `${format(d, 'HH:mm')}`
  if (differenceInMinutes(new Date(), d) < 60 * 24 * 7) return formatDistanceToNow(d, { addSuffix: true, locale: loc })
  return format(d, 'd MMM', { locale: loc })
}

function isBranchLead(lead) {
  return !!lead?.metadata?.is_branch
}

// Post-migration 041 a conversation can be a branch dispatch thread without
// any lead row at all (contact_id NULL, branch_id set). Helper that covers both:
// the legacy hybrid Aaron-style lead-with-is_branch AND the new pure-branch conv.
function isBranchConversation(conv) {
  return !!conv?.branch_id || !!conv?.branches || isBranchLead(conv?.leads)
}

export default function ChatInbox() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const isAdminOrAbove = user?.role === 'admin' || user?.role === 'super_admin'
  usePageTitle(t('chatInbox.title') || 'Messages')

  const [filters, setFilters] = useState({ status: '', search: '', inbox_id: '', lead_type: 'all' })
  const [selectedId, setSelectedId] = useState(null)
  const [contactPanelOpen, setContactPanelOpen] = useState(false)

  const { data: inboxes } = useChatInboxes()
  // server-side filters (excluding lead_type which is client-side, based on lead.metadata)
  const { lead_type, ...serverFilters } = filters
  const { data: allConversations = [], isLoading } = useChatConversations(serverFilters)
  const conversations = allConversations.filter(c => {
    if (lead_type === 'all') return true
    const branch = isBranchConversation(c)
    return lead_type === 'branch' ? branch : !branch
  })
  const { data: selected } = useChatConversation(selectedId)
  const { data: messages = [] } = useChatMessages(selectedId)
  const { data: leadFields } = useLeadFields()
  const markRead = useMarkChatRead()

  useEffect(() => {
    if (selectedId && selected?.unread_count > 0) markRead.mutate(selectedId)
  }, [selectedId, selected?.unread_count])

  useEffect(() => {
    if (!selectedId && conversations.length > 0) setSelectedId(conversations[0].id)
  }, [conversations, selectedId])

  // Reset selection if it falls outside the filtered list (after a tab switch)
  useEffect(() => {
    if (selectedId && conversations.length > 0 && !conversations.some(c => c.id === selectedId)) {
      setSelectedId(conversations[0].id)
    }
  }, [conversations, selectedId])

  // Auto-open the panel when switching to another conversation, but stay closed
  // si l'utilisateur l'a explicitement fermé.
  // Pour l'instant: ne pas auto-ouvrir, l'utilisateur clique pour ouvrir.

  const lead = selected?.leads
  const isBranch = isBranchConversation(selected)

  return (
    <div className="-mx-6 -my-6 h-[calc(100svh-3rem)] flex bg-background overflow-hidden">
      {/* Left: conversation list */}
      <aside className="w-80 shrink-0 border-e flex flex-col bg-muted/30">
        <ConversationListHeader filters={filters} setFilters={setFilters} inboxes={inboxes || []} t={t} />
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <ListSkeleton />
          ) : conversations.length === 0 ? (
            <EmptyList />
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

      {/* Center: thread */}
      <main className="flex-1 flex flex-col min-w-0">
        {selectedId && selected ? (
          <>
            <ConversationHeader
              conversation={selected}
              isBranch={isBranch}
              contactPanelOpen={contactPanelOpen}
              onContactClick={() => setContactPanelOpen(v => !v)}
            />
            <MessageThread
              conversationId={selectedId}
              messages={messages}
              locale={locale}
              currentLead={lead}
            />
            <MessageInput conversationId={selectedId} aiDisabled={selected.ai_disabled} />
          </>
        ) : (
          <EmptyThread />
        )}
      </main>

      {/* Right: contact panel (lead detail or branch card) — INLINE column, pushes the chat */}
      {selectedId && contactPanelOpen && lead && (
        <aside className="w-[420px] shrink-0 border-s flex flex-col bg-background">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              {isBranch ? (
                <>
                  <Building2 className="h-4 w-4 text-primary" />
                  {t('chatInbox.branchPanelTitle') || 'Détails du Snif'}
                </>
              ) : (
                t('leads.detail') || 'Détails du lead'
              )}
            </h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setContactPanelOpen(false)}>
              <X size={14} />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isBranch ? (
              <BranchPanel lead={lead} t={t} />
            ) : (
              <>
                <div className="px-6 py-4">
                  <LeadDetail
                    lead={lead}
                    t={t}
                    leadFields={leadFields}
                    isSuperAdmin={isAdminOrAbove}
                    userRole={user?.role}
                  />
                </div>
                <LeadCommentInput leadId={lead.id} t={t} />
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

function ConversationListHeader({ filters, setFilters, inboxes, t }) {
  const tabs = [
    { value: 'all', label: t('chatInbox.tabAll') },
    { value: 'lead', label: t('chatInbox.tabLeads') },
    { value: 'branch', label: t('chatInbox.tabBranches') },
  ]
  return (
    <div className="p-3 border-b space-y-2 bg-background">
      <div className="flex items-center gap-0.5 border rounded-lg p-0.5 bg-muted/30">
        {tabs.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilters(f => ({ ...f, lead_type: tab.value }))}
            className={`flex-1 text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
              (filters.lead_type || 'all') === tab.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          placeholder={t('chatInbox.search')}
          className="ps-9 h-9"
        />
      </div>
      <div className="flex gap-2">
        <Select
          value={filters.status || 'all'}
          onValueChange={v => setFilters(f => ({ ...f, status: v === 'all' ? '' : v }))}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('chatInbox.allStatuses')}</SelectItem>
            <SelectItem value="open">{t('chatInbox.statusOpen')}</SelectItem>
            <SelectItem value="pending">{t('chatInbox.statusPending')}</SelectItem>
            <SelectItem value="resolved">{t('chatInbox.statusResolved')}</SelectItem>
            <SelectItem value="snoozed">{t('chatInbox.statusSnoozed')}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.inbox_id || 'all'}
          onValueChange={v => setFilters(f => ({ ...f, inbox_id: v === 'all' ? '' : v }))}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder={t('chatInbox.channelPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('chatInbox.allChannels')}</SelectItem>
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
  const { t } = useI18n()
  const lead = conversation.leads
  const branch = conversation.branches
  const lastMsg = conversation.last_message
  const hasUnread = conversation.unread_count > 0
  const isBranch = isBranchConversation(conversation)

  return (
    <button
      onClick={onClick}
      className={`w-full text-start px-3 py-2.5 border-b border-border/50 hover:bg-accent/50 transition flex gap-3 ${
        selected ? 'bg-accent' : ''
      }`}
    >
      <div className={`h-10 w-10 shrink-0 rounded-full font-medium flex items-center justify-center text-sm ${
        isBranch ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-primary/10 text-primary'
      } ${hasUnread ? 'ring-2 ring-primary' : ''}`}>
        {isBranch ? <Building2 className="h-4 w-4" /> : initials(lead?.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className={`text-sm truncate ${hasUnread ? 'font-semibold' : 'font-medium'}`}>
            {branch?.name || lead?.name || '—'}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatRelative(conversation.last_message_at, locale)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {channelLabel(conversation.channel, t)}
          </span>
          {isBranch && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{t('chatInbox.branchBadge')}</span>}
          {conversation.ai_disabled && <BotOff className="h-3 w-3 text-muted-foreground" />}
          <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0 rounded ${STATUS_COLORS[conversation.status] || ''}`}>
            {conversation.status}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <p className={`text-xs truncate flex-1 ${hasUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
            {lastMsg?.sender_type === 'agent' && '↪ '}
            {lastMsg?.sender_type === 'bot' && '🤖 '}
            {lastMsg?.content_type === 'audio' && '🎤 '}
            {lastMsg?.content_type === 'image' && '🖼 '}
            {lastMsg?.content_type === 'video' && '🎥 '}
            {lastMsg?.content_type === 'file' && '📎 '}
            {lastMsg?.content?.replace(/^🎤 /, '') || '—'}
          </p>
          {hasUnread && (
            <Badge className="h-5 min-w-5 px-1.5 text-[10px] shrink-0">{conversation.unread_count}</Badge>
          )}
        </div>
      </div>
    </button>
  )
}

function ConversationHeader({ conversation, isBranch, contactPanelOpen, onContactClick }) {
  const { t } = useI18n()
  const lead = conversation.leads
  const resolveMut = useResolveChatConversation()
  const toggleAi = useToggleChatAi()

  return (
    <div className="border-b px-4 py-2.5 flex items-center gap-3 bg-background shrink-0">
      <button
        onClick={onContactClick}
        className={`flex items-center gap-3 flex-1 min-w-0 -ms-2 ps-2 -my-1 py-1 rounded-md transition ${
          contactPanelOpen ? 'bg-accent' : 'hover:bg-accent/50'
        }`}
        title={contactPanelOpen ? t('chatInbox.closeContact') : t('chatInbox.openContact')}
      >
        <div className={`h-9 w-9 rounded-full font-medium flex items-center justify-center text-sm shrink-0 ${
          isBranch ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-primary/10 text-primary'
        }`}>
          {isBranch ? <Building2 className="h-4 w-4" /> : initials(lead?.name)}
        </div>
        <div className="text-start min-w-0">
          <div className="font-medium truncate text-sm flex items-center gap-1.5">
            {lead?.name || '—'}
            {isBranch && (
              <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">
                {t('chatInbox.branchBadge')}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span>{channelLabel(conversation.channel, t)}</span>
            {lead?.phone && <><span>·</span><span dir="ltr">{lead.phone}</span></>}
          </div>
        </div>
      </button>
      <Button
        size="sm"
        variant={conversation.ai_disabled ? 'default' : 'outline'}
        onClick={() => toggleAi.mutate(conversation.id)}
        title={conversation.ai_disabled ? t('chatInbox.aiOn') : t('chatInbox.aiOff')}
        className="h-8 gap-1"
      >
        {conversation.ai_disabled ? <BotOff className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        {t('chatInbox.aiLabel')}
      </Button>
      {conversation.status !== 'resolved' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => resolveMut.mutate(conversation.id)}
          className="h-8 gap-1"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          {t('chatInbox.resolve')}
        </Button>
      )}
    </div>
  )
}

function BranchPanel({ lead, t }) {
  const branchId = lead?.metadata?.branch_id
  const { data: branches } = useBranches()
  const branch = (branches || []).find(b => b.id === branchId)

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="text-center space-y-2">
        <div className="h-16 w-16 mx-auto rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center">
          <Building2 className="h-7 w-7" />
        </div>
        <div>
          <h3 className="font-semibold">{branch?.name || lead.name}</h3>
          <Badge variant="outline" className="mt-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px]">{t('chatInbox.branchBadge')}</Badge>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        {(branch?.contact_name || lead.metadata?.contact_name) && (
          <Field icon={<Building2 className="h-3.5 w-3.5" />} label={t('chatInbox.branchCoordinator')} value={branch?.contact_name || lead.metadata?.contact_name} />
        )}
        {(branch?.phone || lead.phone) && (
          <Field icon={<Phone className="h-3.5 w-3.5" />} label={t('chatInbox.branchPhone')} value={branch?.phone || lead.phone} link={`tel:${branch?.phone || lead.phone}`} ltr />
        )}
        {(branch?.mobile) && (
          <Field icon={<Phone className="h-3.5 w-3.5" />} label={t('chatInbox.branchMobile')} value={branch.mobile} link={`tel:${branch.mobile}`} ltr />
        )}
        {(branch?.whatsapp_phone || lead.phone) && (
          <Field icon={<MessageSquare className="h-3.5 w-3.5" />} label={t('chatInbox.branchWhatsapp')} value={branch?.whatsapp_phone || lead.phone} ltr />
        )}
        {(branch?.email) && (
          <Field icon={<Mail className="h-3.5 w-3.5" />} label={t('chatInbox.branchEmail')} value={branch.email} link={`mailto:${branch.email}`} />
        )}
        {(branch?.address) && (
          <Field icon={<MapPin className="h-3.5 w-3.5" />} label={t('chatInbox.branchAddress')} value={branch.address} />
        )}
      </div>

      {branchId && (
        <div className="pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => window.location.assign(`/branches?id=${branchId}`)}
          >
            <Building2 className="h-4 w-4 me-1" /> {t('chatInbox.branchManage')}
          </Button>
        </div>
      )}
    </div>
  )
}

function Field({ icon, label, value, link, ltr }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
        {link ? (
          <a href={link} className="hover:underline break-all" dir={ltr ? 'ltr' : undefined}>{value}</a>
        ) : (
          <div className="break-all" dir={ltr ? 'ltr' : undefined}>{value}</div>
        )}
      </div>
    </div>
  )
}

function MessageThread({ conversationId, messages, locale, currentLead }) {
  const { t } = useI18n()
  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages?.length, conversationId])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-muted/10">
      {messages.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">
          {t('chatInbox.threadEmpty')}
        </div>
      ) : (
        messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            message={m}
            locale={locale}
            leadName={currentLead?.name}
            prevMsg={messages[i - 1]}
          />
        ))
      )}
    </div>
  )
}

function MessageBubble({ message, locale, leadName, prevMsg }) {
  const { t } = useI18n()
  const isContact = message.sender_type === 'contact'
  const isPrivate = message.is_private
  const isSameSenderAsPrev = prevMsg?.sender_type === message.sender_type && !prevMsg?.is_private && !isPrivate
  const senderLabel = isContact
    ? (leadName || 'Contact')
    : message.sender_type === 'bot'
      ? 'AI'
      : (message.agent?.email?.split('@')[0] || 'Agent')

  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  // Defensive: skip rendering of completely empty messages (no content + no attachments)
  if (!message.content && attachments.length === 0) return null

  return (
    <div className={`flex ${isContact ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[75%] ${isSameSenderAsPrev ? 'mt-0.5' : 'mt-2'}`}>
        {!isSameSenderAsPrev && (
          <div className={`text-[10px] mb-1 px-1 ${isContact ? 'text-start' : 'text-end'} text-muted-foreground`}>
            {senderLabel}
            {message.delivery_status === 'failed' && <span className="ms-1 text-red-500">· {t('chatInbox.deliveryFailed')}</span>}
          </div>
        )}
        <div className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
          isPrivate
            ? 'bg-yellow-500/10 border border-yellow-500/30 text-foreground'
            : isContact
              ? 'bg-card border'
              : message.sender_type === 'bot'
                ? 'bg-violet-500/10 border border-violet-500/30 text-foreground'
                : 'bg-primary text-primary-foreground'
        }`}>
          {isPrivate && <div className="text-[10px] font-medium mb-1 opacity-70">📝 {t('chatInbox.privateNote')}</div>}
          {attachments.length > 0 && (
            <div className="mb-1.5 space-y-1.5">
              {attachments.map((a, i) => <AttachmentPreview key={i} attachment={a} />)}
            </div>
          )}
          {message.content}
        </div>
        <div className={`text-[10px] mt-0.5 px-1 ${isContact ? 'text-start' : 'text-end'} text-muted-foreground/70`}>
          {format(new Date(message.created_at), 'HH:mm')}
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
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt={file_name} className="max-h-56 rounded-lg" />
      </a>
    )
  }
  if (type === 'video') return <video src={url} controls className="max-h-56 rounded-lg" />
  if (type === 'audio') return <audio src={url} controls className="max-w-full min-w-[240px]" />
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
      <FileText className="h-4 w-4" /> {file_name || 'Fichier'}
    </a>
  )
}

function MessageInput({ conversationId, aiDisabled }) {
  const { t } = useI18n()
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
      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg']
      const mimeType = mimeCandidates.find(m =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
      ) || ''
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recordChunks.current = []
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunks.current.push(ev.data) }
      mr.onstop = () => {
        const actualType = mr.mimeType || mimeType || 'audio/webm'
        const ext = actualType.includes('mp4') ? 'm4a' : actualType.includes('mpeg') ? 'mp3' : 'webm'
        const blob = new Blob(recordChunks.current, { type: actualType })
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: actualType })
        attachMut.mutate({ file, content: '' })
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      recorderRef.current = mr
      setRecording(true)
    } catch (err) {
      console.error('[chat] Mic access error:', err)
      alert(t('chatInbox.micDenied'))
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  return (
    <div className="border-t bg-background shrink-0">
      {!aiDisabled && (
        <div className="text-[11px] text-muted-foreground px-4 pt-2 flex items-center gap-1.5">
          <Bot className="h-3 w-3" />
          {t('chatInbox.aiActive')}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={onFile}
        accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
      />
      <div className="flex gap-2 items-end px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileRef.current?.click()}
          disabled={attachMut.isPending || recording}
          title={t('chatInbox.attachFile')}
          className="shrink-0 h-9 w-9"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button
          variant={recording ? 'destructive' : 'ghost'}
          size="icon"
          onClick={recording ? stopRecording : startRecording}
          disabled={attachMut.isPending}
          title={recording ? t('chatInbox.stopRecord') : t('chatInbox.recordVoice')}
          className="shrink-0 h-9 w-9"
        >
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={recording ? t('chatInbox.recording') : t('chatInbox.composePlaceholder')}
          rows={1}
          className="resize-none min-h-9 max-h-32 py-2"
          disabled={recording}
        />
        <Button
          onClick={send}
          disabled={!text.trim() || sendMut.isPending || attachMut.isPending || recording}
          size="icon"
          className="shrink-0 h-9 w-9"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {attachMut.isPending && (
        <div className="text-[11px] text-muted-foreground px-4 pb-2">{t('chatInbox.sending')}</div>
      )}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="p-3 space-y-3">
      {[0,1,2,3].map(i => (
        <div key={i} className="flex gap-3">
          <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
            <div className="h-2.5 w-1/3 bg-muted rounded animate-pulse" />
            <div className="h-2.5 w-full bg-muted rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyList() {
  const { t } = useI18n()
  return (
    <div className="text-center text-sm text-muted-foreground py-12 px-6">
      <MessageSquare className="h-8 w-8 mx-auto opacity-30 mb-2" />
      {t('chatInbox.empty')}
    </div>
  )
}

function EmptyThread() {
  const { t } = useI18n()
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 bg-muted/10">
      <MessageSquare className="h-12 w-12 opacity-20" />
      <p className="text-sm">{t('chatInbox.selectConv')}</p>
    </div>
  )
}
