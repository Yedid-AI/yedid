import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  useAgent,
  useUpdateAgentConfig,
  useAgentPlaybooks,
  useUpdateAgentPlaybooks,
  useAgentEscalationRules,
  useUpdateAgentEscalationRules,
  useTools,
  useToolsLibrary,
  useUpdatePlaybookLibrary,
  useCreatePlaybookLibrary,
  useUpdateEscalationLibrary,
  useCreateEscalationLibrary,
  useInboxes,
} from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RichEditor } from '@/components/ui/rich-editor'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import {
  ArrowLeft,
  Inbox,
  GitBranch,
  BookOpen,
  ArrowUpRight,
  Wrench,
  Plus,
  MoreHorizontal,
  ExternalLink,
  ChevronLeft,
  Loader2,
  Sparkles,
  Globe,
  MessageCircle,
  Instagram,
  Facebook,
  Phone,
} from 'lucide-react'

const CHANNEL_ICONS = {
  web: Globe, whatsapp: MessageCircle, instagram: Instagram, meta: Facebook, api: Globe, sms: Phone,
}

export default function AgentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, dateLocale } = useI18n()
  const { data: agent, isLoading, error: queryError } = useAgent(id)
  const { data: playbooks = [] } = useAgentPlaybooks(id)
  const { data: escalations = [] } = useAgentEscalationRules(id)
  const { data: tools = [] } = useTools(id)
  const { data: allInboxes = [] } = useInboxes()
  const inboxes = useMemo(
    () => allInboxes.filter((ib) => String(ib.agent_bot_id) === String(id)),
    [allInboxes, id],
  )
  usePageTitle(agent?.name || '')

  // Selection state: which node is open in the right panel,
  // and (optionally) which item is being edited.
  const [selected, setSelected] = useState({ node: 'router' })

  const goToList = (node) => setSelected({ node })
  const editPlaybook = (editId) => setSelected({ node: 'playbooks', editing: 'playbook', editId })
  const editEscalation = (editId) => setSelected({ node: 'escalation', editing: 'escalation', editId })

  // Esc closes the editor (back to its parent list panel)
  useEffect(() => {
    if (!selected.editing) return
    const handler = (e) => {
      if (e.key === 'Escape') goToList(selected.node)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected])

  if (isLoading) return <PageSkeleton />
  if (queryError) return (
    <div>
      <Button variant="ghost" onClick={() => navigate('/agents')} className="mb-4">
        <ArrowLeft className="me-2 h-4 w-4 icon-directional" /> {t('common.back')}
      </Button>
      <div className="p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{queryError.message}</div>
    </div>
  )

  const cfg = agent.agent_config?.[0] || agent.agent_config || {}

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/agents')}>
          <ArrowLeft className="me-2 h-4 w-4 icon-directional" /> {t('common.back')}
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold leading-tight truncate">{agent.name}</h1>
            <span
              className={`inline-block size-1.5 rounded-full ${
                agent.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'
              }`}
              title={agent.is_active ? t('common.active') : t('common.inactive')}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('common.createdAt')} {new Date(agent.created_at).toLocaleDateString(dateLocale)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => editPlaybook('new')}>
          <Plus className="me-1.5 h-4 w-4" /> {t('agentDetail.newScenario')}
        </Button>
        <Button size="sm" variant="ghost" title={t('agentDetail.testAgent')}>
          <Sparkles className="me-1.5 h-4 w-4" /> {t('agentDetail.test')}
        </Button>
        <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
      </div>

      {/* Title */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('agentDetail.orchestration')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('agentDetail.orchestrationSubtitle')}
          </p>
        </div>
        <KeyboardHints />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
        <FlowCanvas
          selected={selected.node}
          onSelect={goToList}
          onEditPlaybook={editPlaybook}
          onEditEscalation={editEscalation}
          agent={agent}
          inboxes={inboxes}
          playbooks={playbooks}
          escalations={escalations}
          tools={tools}
        />
        <RightPanel
          selected={selected}
          setSelected={setSelected}
          editPlaybook={editPlaybook}
          editEscalation={editEscalation}
          agent={agent}
          cfg={cfg}
          inboxes={inboxes}
          playbooks={playbooks}
          escalations={escalations}
          tools={tools}
        />
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────── */
/* Flow Canvas                                                */
/* ────────────────────────────────────────────────────────── */

function FlowCanvas({ selected, onSelect, onEditPlaybook, onEditEscalation, agent, inboxes, playbooks, escalations, tools }) {
  const { t } = useI18n()
  return (
    <div
      className="relative rounded-xl border bg-muted/30 p-8 lg:p-12 min-h-[760px] overflow-hidden"
      style={{
        backgroundImage: 'radial-gradient(circle, oklch(0.85 0.005 75) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <div className="relative flex flex-col items-center gap-10">
        {/* Inboxes node */}
        <FlowNode
          kind="entry"
          icon={Inbox}
          label={t('nav.inboxes').toUpperCase()}
          count={inboxes.length}
          selected={selected === 'inboxes'}
          onClick={() => onSelect('inboxes')}
          width="w-[280px]"
        >
          {inboxes.length === 0 ? (
            <EmptyTile to="/inboxes" label={t('agentDetail.connectChannel')} />
          ) : (
            <div className="space-y-1">
              {inboxes.slice(0, 4).map((ib) => {
                const Icon = CHANNEL_ICONS[ib.channel_type] || Globe
                return (
                  <ItemTile key={ib.id} icon={Icon} label={ib.name} sub={ib.channel_type} />
                )
              })}
              {inboxes.length > 4 && (
                <div className="text-[11px] text-muted-foreground px-1">
                  {t('agentDetail.others', { n: inboxes.length - 4 })}
                </div>
              )}
            </div>
          )}
        </FlowNode>

        <Connector />

        {/* Router node */}
        <FlowNode
          kind="router"
          icon={GitBranch}
          label={(agent.name || t('nav.agents')).toUpperCase()}
          subtitle={t('agentDetail.routerSubtitle')}
          selected={selected === 'router'}
          onClick={() => onSelect('router')}
          width="w-[340px]"
        >
          <NodeSection title={t('agentDetail.toolsSection').toUpperCase()} count={tools.length} addTo="/tools">
            {tools.length === 0 ? (
              <EmptyTile to="/tools" label={t('agentDetail.addTool')} />
            ) : (
              <div className="space-y-1">
                {tools.slice(0, 3).map((tl) => (
                  <ItemTile
                    key={tl.id}
                    icon={Wrench}
                    label={tl.name}
                    asLink="/tools"
                  />
                ))}
                {tools.length > 3 && (
                  <div className="text-[11px] text-muted-foreground px-1">
                    {t('agentDetail.others', { n: tools.length - 3 })}
                  </div>
                )}
              </div>
            )}
          </NodeSection>
        </FlowNode>

        {/* Y-split SVG */}
        <div className="relative w-full max-w-[720px] h-12 -my-2">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 720 48" preserveAspectRatio="none">
            <path
              d="M 360 0 L 360 16 Q 360 24 352 24 L 188 24 Q 180 24 180 32 L 180 48"
              fill="none"
              stroke="oklch(0.55 0.17 162)"
              strokeWidth="1.5"
            />
            <path
              d="M 360 0 L 360 16 Q 360 24 368 24 L 532 24 Q 540 24 540 32 L 540 48"
              fill="none"
              stroke="oklch(0.7 0.18 145)"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        {/* Playbooks + Escalation row */}
        <div className="grid grid-cols-2 gap-12 w-full max-w-[720px] items-start">
          <FlowNode
            kind="playbook"
            icon={BookOpen}
            label={t('nav.playbooks').toUpperCase()}
            count={playbooks.length}
            subtitle={t('agentDetail.scenariosSubtitle')}
            selected={selected === 'playbooks'}
            onClick={() => onSelect('playbooks')}
            onAdd={() => onEditPlaybook('new')}
          >
            {playbooks.length === 0 ? (
              <EmptyTile onClick={() => onEditPlaybook('new')} label={t('agentDetail.createFirstScenario')} />
            ) : (
              <div className="space-y-1.5">
                {playbooks.map((pb) => (
                  <ItemTile
                    key={pb.id}
                    emoji={pb.emoji || '📘'}
                    label={pb.title}
                    sub={pb.tools?.name ? `${pb.tools.name}` : pb.audience}
                    subIcon={pb.tools?.name ? Wrench : null}
                    active={pb.is_active}
                    onClick={(e) => { e.stopPropagation(); onEditPlaybook(pb.id) }}
                  />
                ))}
              </div>
            )}
          </FlowNode>

          <FlowNode
            kind="escalation"
            icon={ArrowUpRight}
            label={t('nav.escalation').toUpperCase()}
            count={escalations.length}
            subtitle={t('agentDetail.escalationSubtitle')}
            selected={selected === 'escalation'}
            onClick={() => onSelect('escalation')}
            onAdd={() => onEditEscalation('new')}
          >
            <NodeSection title={t('agentDetail.rulesSection').toUpperCase()} count={escalations.length}>
              {escalations.length === 0 ? (
                <EmptyTile onClick={() => onEditEscalation('new')} label={t('agentDetail.createRule')} />
              ) : (
                <div className="space-y-1">
                  {escalations.slice(0, 3).map((e) => (
                    <ItemTile
                      key={e.id}
                      emoji={e.emoji || '🚨'}
                      label={e.title}
                      sub={e.audience}
                      active={e.is_active}
                      onClick={(ev) => { ev.stopPropagation(); onEditEscalation(e.id) }}
                    />
                  ))}
                  {escalations.length > 3 && (
                    <div className="text-[11px] text-muted-foreground px-1">
                      {t('agentDetail.others', { n: escalations.length - 3 })}
                    </div>
                  )}
                </div>
              )}
            </NodeSection>
          </FlowNode>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-6 rounded-md border bg-background/90 backdrop-blur px-3 py-2 text-xs space-y-1.5 shadow-sm">
        <LegendItem color="oklch(0.65 0.12 270)" label={t('agentDetail.legendEntry')} />
        <LegendItem color="oklch(0.55 0.17 162)" label={t('agentDetail.legendRouter')} />
        <LegendItem color="oklch(0.55 0.17 162)" label={t('agentDetail.legendScenario')} />
        <LegendItem color="oklch(0.7 0.18 145)" label={t('agentDetail.legendEscalation')} />
        <LegendItem color="oklch(0.55 0.04 260)" label={t('agentDetail.legendTool')} />
      </div>

      {/* Zoom controls (decorative) */}
      <div className="absolute bottom-4 left-6 flex items-center gap-1 rounded-md border bg-background/90 backdrop-blur px-2 py-1 text-xs shadow-sm">
        <button className="px-1.5 hover:bg-muted rounded">−</button>
        <span className="px-2 text-muted-foreground">100%</span>
        <button className="px-1.5 hover:bg-muted rounded">+</button>
      </div>
    </div>
  )
}

function Connector() {
  return (
    <div className="relative h-10 w-px bg-gradient-to-b from-primary/0 via-primary to-primary -my-2">
      <div className="absolute -left-[3px] top-1/2 -translate-y-1/2 size-[7px] rounded-full bg-primary" />
    </div>
  )
}

function FlowNode({ kind, icon: Icon, label, count, subtitle, selected, onClick, onAdd, width = 'w-[300px]', children }) {
  const { t } = useI18n()
  const accent = {
    entry: 'oklch(0.65 0.12 270)',
    router: 'oklch(0.55 0.17 162)',
    playbook: 'oklch(0.55 0.17 162)',
    escalation: 'oklch(0.7 0.18 145)',
  }[kind]

  return (
    <div
      onClick={onClick}
      className={`${width} text-left rounded-xl border bg-background p-4 shadow-soft-sm transition cursor-pointer hover:-translate-y-0.5 hover:shadow-soft-md ${
        selected ? 'ring-2 ring-primary/60 border-primary/40' : ''
      }`}
    >
      <div className="flex items-center gap-2 pb-3 border-b">
        <span
          className="grid place-items-center size-7 rounded-md text-white shrink-0"
          style={{ backgroundColor: accent }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-xs font-semibold tracking-wide text-foreground truncate">{label}</div>
            {typeof count === 'number' && (
              <span className="text-[10px] tabular-nums text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                {count}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="text-[11px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
              {subtitle}
            </div>
          )}
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd() }}
            className="grid place-items-center size-6 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title={t('agentDetail.add')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="pt-3 space-y-3">{children}</div>
    </div>
  )
}

function NodeSection({ title, count, children, className = '', addTo }) {
  const { t } = useI18n()
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className={`text-[10px] font-semibold tracking-wider uppercase text-muted-foreground ${className}`}>
          {title}
          {typeof count === 'number' && <span className="ms-1 normal-case font-normal">({count})</span>}
        </div>
        {addTo && (
          <Link to={addTo} onClick={(e) => e.stopPropagation()} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
            <Plus className="h-2.5 w-2.5" /> {t('agentDetail.add')}
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

function ItemTile({ icon: Icon, emoji, label, sub, subIcon: SubIcon, active = true, muted = false, onClick, asLink }) {
  const inner = (
    <>
      <div className="flex items-center gap-2">
        {emoji ? (
          <span className="text-[15px] leading-none shrink-0">{emoji}</span>
        ) : Icon ? (
          <Icon className={`h-3.5 w-3.5 shrink-0 ${muted ? 'text-amber-700' : 'text-muted-foreground'}`} />
        ) : null}
        <span className={`text-xs flex-1 truncate ${active ? '' : 'text-muted-foreground line-through decoration-muted-foreground/30'}`}>
          {label}
        </span>
        {!muted && (
          <span className={`size-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
        )}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 ms-6 truncate">
          {SubIcon && <SubIcon className="h-2.5 w-2.5" />}
          <span className="truncate">{sub}</span>
        </div>
      )}
    </>
  )

  const baseClass = 'block w-full text-left rounded-md border bg-background px-2.5 py-1.5 transition'
  const interactive = onClick || asLink ? 'hover:border-primary/40 hover:bg-accent/40 cursor-pointer' : ''

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${baseClass} ${interactive}`}>
        {inner}
      </button>
    )
  }
  if (asLink) {
    return (
      <Link to={asLink} onClick={(e) => e.stopPropagation()} className={`${baseClass} ${interactive}`}>
        {inner}
      </Link>
    )
  }
  return <div className={baseClass}>{inner}</div>
}

function EmptyTile({ to, onClick, label }) {
  const cls = 'flex items-center justify-center gap-1.5 w-full rounded-md border border-dashed bg-background/40 px-2.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent/30 transition'
  if (to) return <Link to={to} onClick={(e) => e.stopPropagation()} className={cls}><Plus className="h-3 w-3" /> {label}</Link>
  return <button type="button" onClick={(e) => { e.stopPropagation(); onClick?.() }} className={cls}><Plus className="h-3 w-3" /> {label}</button>
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-foreground/80">{label}</span>
    </div>
  )
}

function KeyboardHints() {
  const { t } = useI18n()
  return (
    <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground">
      <Kbd>Esc</Kbd> {t('agentDetail.kbdClose')}
      <Kbd>⌘S</Kbd> {t('agentDetail.kbdSave')}
    </div>
  )
}

function Kbd({ children }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded border bg-background text-[10px] font-mono">
      {children}
    </span>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-1/3 rounded bg-muted" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        <div className="h-[760px] rounded-xl bg-muted/40" />
        <div className="h-[480px] rounded-xl bg-muted/40" />
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────── */
/* Right Panel                                                */
/* ────────────────────────────────────────────────────────── */

function RightPanel({ selected, setSelected, editPlaybook, editEscalation, agent, cfg, inboxes, playbooks, escalations, tools }) {
  const { t } = useI18n()

  // Edit modes
  if (selected.editing === 'playbook') {
    return (
      <PlaybookEditor
        agentId={agent.id}
        playbookId={selected.editId}
        playbooks={playbooks}
        onBack={() => setSelected({ node: 'playbooks' })}
        onCreated={(newId) => editPlaybook(newId)}
      />
    )
  }
  if (selected.editing === 'escalation') {
    return (
      <EscalationEditor
        agentId={agent.id}
        escalationId={selected.editId}
        escalations={escalations}
        onBack={() => setSelected({ node: 'escalation' })}
        onCreated={(newId) => editEscalation(newId)}
      />
    )
  }

  // List modes
  if (selected.node === 'inboxes') {
    return (
      <PanelShell title={t('inboxes.title')} subtitle={t('agentDetail.inboxesPanelSubtitle')}>
        {inboxes.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t('agentDetail.noInboxTitle')}
            description={t('agentDetail.noInboxDesc')}
            actionLabel={t('agentDetail.connectChannel')}
            actionTo="/inboxes"
          />
        ) : (
          <PanelList
            items={inboxes.map((ib) => ({
              id: ib.id,
              icon: CHANNEL_ICONS[ib.channel_type] || Globe,
              label: ib.name,
              sub: ib.channel_type,
            }))}
            link={{ to: '/inboxes', label: t('agentDetail.manageInboxes') }}
          />
        )}
      </PanelShell>
    )
  }

  if (selected.node === 'playbooks') {
    return (
      <PanelShell
        title={t('nav.playbooks')}
        subtitle={t('agentDetail.clickToEdit')}
        action={{ label: t('agentDetail.new'), onClick: () => editPlaybook('new'), icon: Plus }}
      >
        {playbooks.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={t('playbooks.empty')}
            description={t('agentDetail.noScenarioDesc')}
            actionLabel={t('agentDetail.createScenario')}
            onAction={() => editPlaybook('new')}
          />
        ) : (
          <PanelList
            items={playbooks.map((pb) => ({
              id: pb.id,
              emoji: pb.emoji || '📘',
              label: pb.title,
              sub: pb.audience,
              badge: pb.tools?.name,
              status: pb.is_active,
              onClick: () => editPlaybook(pb.id),
            }))}
            link={{ to: '/playbooks', label: t('agentDetail.manageLibrary') }}
          />
        )}
      </PanelShell>
    )
  }

  if (selected.node === 'escalation') {
    return (
      <PanelShell
        title={t('agentDetail.escalationsTitle')}
        subtitle={t('escalation.subtitle')}
        action={{ label: t('agentDetail.new'), onClick: () => editEscalation('new'), icon: Plus }}
      >
        {escalations.length === 0 ? (
          <EmptyState
            icon={ArrowUpRight}
            title={t('escalation.empty')}
            description={t('agentDetail.noRuleDesc')}
            actionLabel={t('agentDetail.createRule')}
            onAction={() => editEscalation('new')}
          />
        ) : (
          <PanelList
            items={escalations.map((e) => ({
              id: e.id,
              emoji: e.emoji || '🚨',
              label: e.title,
              sub: e.audience,
              status: e.is_active,
              onClick: () => editEscalation(e.id),
            }))}
            link={{ to: '/escalation', label: t('agentDetail.editEscalations') }}
          />
        )}
      </PanelShell>
    )
  }

  // default: router → editable agent config
  return <AgentRouterEditor agent={agent} cfg={cfg} tools={tools} />
}

/* ────────────────────────────────────────────────────────── */
/* Router Editor (agent config)                               */
/* ────────────────────────────────────────────────────────── */

const ALLOWED_MODELS = {
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414'],
}

function useDirty(form, initial) {
  return useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial])
}

function useCmdSave(handler, enabled) {
  useEffect(() => {
    if (!enabled) return
    const fn = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [handler, enabled])
}

function AgentRouterEditor({ agent, cfg, tools }) {
  const { t } = useI18n()
  const updateConfig = useUpdateAgentConfig(agent.id)
  const initial = useMemo(() => ({
    name: cfg.name || agent.name || '',
    prompt: cfg.prompt || '',
    tone: cfg.tone || '',
    response_length: cfg.response_length || '',
    llm_provider: cfg.llm_provider || 'openai',
    llm_model: cfg.llm_model || 'gpt-4.1-mini',
  }), [agent.id, cfg.name, cfg.prompt, cfg.tone, cfg.response_length, cfg.llm_provider, cfg.llm_model, agent.name])

  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const dirty = useDirty(form, initial)

  useEffect(() => { setForm(initial) }, [initial])

  const doSave = async () => {
    setError('')
    const allowed = ALLOWED_MODELS[form.llm_provider] || []
    if (!allowed.includes(form.llm_model)) {
      setError(t('agentDetail.invalidModel', { provider: form.llm_provider }))
      return
    }
    setSaving(true)
    setSuccess(false)
    try {
      await updateConfig.mutateAsync(form)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 1800)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  useCmdSave(doSave, dirty)

  return (
    <PanelShell
      title={agent.name}
      subtitle={t('agentDetail.routerEditorSubtitle')}
      badge={dirty ? t('agentDetail.unsavedChanges') : null}
    >
      {error && <PanelError msg={error} />}

      <form onSubmit={(e) => { e.preventDefault(); doSave() }} className="space-y-4">
        <FieldRow>
          <Label className="text-xs">{t('common.name')}</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-8 text-sm"
          />
        </FieldRow>

        <FieldRow>
          <Label className="text-xs">{t('config.prompt')}</Label>
          <RichEditor
            value={form.prompt}
            onChange={(md) => setForm({ ...form, prompt: md })}
            placeholder={t('config.promptPlaceholder')}
            minHeight="160px"
          />
        </FieldRow>

        <div className="grid grid-cols-2 gap-2">
          <FieldRow>
            <Label className="text-xs">{t('config.llmProvider')}</Label>
            <Select
              value={form.llm_provider}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  llm_provider: v,
                  llm_model: v === 'openai' ? 'gpt-4.1-mini' : 'claude-sonnet-4-20250514',
                })
              }
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow>
            <Label className="text-xs">{t('config.model')}</Label>
            <Select value={form.llm_model} onValueChange={(v) => setForm({ ...form, llm_model: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(ALLOWED_MODELS[form.llm_provider] || []).map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <FieldRow>
            <Label className="text-xs">{t('config.tone')}</Label>
            <Select
              value={form.tone || 'none'}
              onValueChange={(v) => setForm({ ...form, tone: v === 'none' ? '' : v })}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('config.toneDefault')}</SelectItem>
                <SelectItem value="professionnel">{t('config.toneProfessional')}</SelectItem>
                <SelectItem value="amical">{t('config.toneFriendly')}</SelectItem>
                <SelectItem value="formel">{t('config.toneFormal')}</SelectItem>
                <SelectItem value="decontracte">{t('config.toneCasual')}</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow>
            <Label className="text-xs">{t('config.responseLength')}</Label>
            <Select
              value={form.response_length || 'none'}
              onValueChange={(v) => setForm({ ...form, response_length: v === 'none' ? '' : v })}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('config.lengthDefault')}</SelectItem>
                <SelectItem value="courte">{t('config.lengthShort')}</SelectItem>
                <SelectItem value="moyenne">{t('config.lengthMedium')}</SelectItem>
                <SelectItem value="longue">{t('config.lengthLong')}</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </div>

        <SaveButton dirty={dirty} saving={saving} success={success} />
      </form>

      <Section heading={t('agentDetail.toolsCount', { count: tools.length })}>
        {tools.length === 0 ? (
          <EmptySection label={t('agentDetail.noToolsHint')} to="/tools" actionLabel={t('agentDetail.open')} />
        ) : tools.slice(0, 5).map((tl) => (
          <Link
            key={tl.id}
            to="/tools"
            className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:border-primary/40 transition"
          >
            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 truncate">{tl.name}</span>
            <Badge variant="secondary" className="text-[10px]">{t('common.active')}</Badge>
          </Link>
        ))}
      </Section>

    </PanelShell>
  )
}

/* ────────────────────────────────────────────────────────── */
/* Playbook Editor (create + edit)                            */
/* ────────────────────────────────────────────────────────── */

function PlaybookEditor({ agentId, playbookId, playbooks, onBack, onCreated }) {
  const { t } = useI18n()
  const isNew = playbookId === 'new'
  const playbook = isNew ? null : playbooks.find((p) => p.id === playbookId)

  // If id is missing (deleted, or stale state), bounce back
  useEffect(() => {
    if (!isNew && !playbook) onBack()
  }, [isNew, playbook])

  const updatePlaybook = useUpdatePlaybookLibrary()
  const createPlaybook = useCreatePlaybookLibrary()
  const updateAssociations = useUpdateAgentPlaybooks(agentId)
  const { data: tools = [] } = useToolsLibrary()

  const initial = useMemo(() => ({
    title: playbook?.title || '',
    content: playbook?.content || '',
    audience: playbook?.audience || '',
    rules: typeof playbook?.rules === 'string' ? playbook.rules : Array.isArray(playbook?.rules) ? playbook.rules.join('\n') : '',
    tool_id: playbook?.tools?.id ? String(playbook.tools.id) : '',
    emoji: playbook?.emoji || '',
    is_active: playbook?.is_active ?? true,
  }), [playbook?.id])

  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const dirty = useDirty(form, initial)

  useEffect(() => { setForm(initial) }, [initial])

  const doSave = async () => {
    setError('')
    setSaving(true)
    setSuccess(false)
    try {
      const body = { ...form, tool_id: form.tool_id ? parseInt(form.tool_id) : null }
      if (isNew) {
        const created = await createPlaybook.mutateAsync(body)
        const newId = created?.playbook?.id || created?.id
        if (newId) {
          const currentIds = playbooks.map((p) => p.id)
          await updateAssociations.mutateAsync([...currentIds, newId])
          setSuccess(true)
          setTimeout(() => onCreated(newId), 400)
        }
      } else {
        await updatePlaybook.mutateAsync({ id: playbook.id, body })
        setSuccess(true)
        setTimeout(() => setSuccess(false), 1800)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  useCmdSave(doSave, dirty)

  if (!isNew && !playbook) return null

  return (
    <PanelShell
      backLabel={t('agentDetail.backToScenarios')}
      onBack={onBack}
      title={isNew ? t('agentDetail.newScenario') : (playbook.emoji ? `${playbook.emoji} ${playbook.title}` : playbook.title)}
      subtitle={isNew ? t('agentDetail.defineScenario') : t('agentDetail.editScenario')}
      badge={dirty ? t('agentDetail.unsaved') : null}
      headerRight={
        !isNew && (
          <div className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <span className="text-[11px] text-muted-foreground">{form.is_active ? t('common.active') : t('common.inactive')}</span>
          </div>
        )
      }
    >
      {error && <PanelError msg={error} />}

      <form onSubmit={(e) => { e.preventDefault(); doSave() }} className="space-y-4">
        <div className="flex items-end gap-2">
          <EmojiPicker value={form.emoji} onChange={(v) => setForm({ ...form, emoji: v })} />
          <FieldRow className="flex-1">
            <Label className="text-xs">{t('common.title')}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="h-8 text-sm"
              required
              autoFocus={isNew}
            />
          </FieldRow>
        </div>

        <FieldRow>
          <Label className="text-xs">{t('common.audience')}</Label>
          <Input
            value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value })}
            className="h-8 text-sm"
            placeholder={t('agentDetail.audiencePlaceholder')}
          />
        </FieldRow>

        <FieldRow>
          <Label className="text-xs">{t('common.rules')}</Label>
          <RichEditor
            value={form.rules}
            onChange={(md) => setForm({ ...form, rules: md })}
            placeholder={t('playbooks.rulesPlaceholder')}
            minHeight="100px"
          />
        </FieldRow>

        <FieldRow>
          <Label className="text-xs">{t('agentDetail.content')}</Label>
          <RichEditor
            value={form.content}
            onChange={(md) => setForm({ ...form, content: md })}
            placeholder={t('playbooks.contentPlaceholder')}
            minHeight="140px"
          />
        </FieldRow>

        <FieldRow>
          <Label className="text-xs">{t('agentDetail.tool')}</Label>
          <Select
            value={form.tool_id || 'none'}
            onValueChange={(v) => setForm({ ...form, tool_id: v === 'none' ? '' : v })}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t('agentDetail.noTool')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('agentDetail.noTool')}</SelectItem>
              {tools.map((tl) => (
                <SelectItem key={tl.id} value={String(tl.id)}>{tl.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>

        <SaveButton dirty={dirty} saving={saving} success={success} createLabel={isNew ? t('common.create') : null} />
      </form>
    </PanelShell>
  )
}

/* ────────────────────────────────────────────────────────── */
/* Escalation Editor (create + edit)                          */
/* ────────────────────────────────────────────────────────── */

function EscalationEditor({ agentId, escalationId, escalations, onBack, onCreated }) {
  const { t } = useI18n()
  const isNew = escalationId === 'new'
  const rule = isNew ? null : escalations.find((e) => e.id === escalationId)

  useEffect(() => {
    if (!isNew && !rule) onBack()
  }, [isNew, rule])

  const updateRule = useUpdateEscalationLibrary()
  const createRule = useCreateEscalationLibrary()
  const updateAssociations = useUpdateAgentEscalationRules(agentId)

  const initial = useMemo(() => ({
    title: rule?.title || '',
    trigger_description: rule?.trigger_description || '',
    rules: typeof rule?.rules === 'string' ? rule.rules : Array.isArray(rule?.rules) ? rule.rules.join('\n') : '',
    audience: rule?.audience || '',
    assign_to_agent: rule?.assign_to_agent ? String(rule.assign_to_agent) : '',
    emoji: rule?.emoji || '',
    is_active: rule?.is_active ?? true,
  }), [rule?.id])

  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const dirty = useDirty(form, initial)

  useEffect(() => { setForm(initial) }, [initial])

  const doSave = async () => {
    setError('')
    setSaving(true)
    setSuccess(false)
    try {
      const body = { ...form, assign_to_agent: form.assign_to_agent ? parseInt(form.assign_to_agent) : null }
      if (isNew) {
        const created = await createRule.mutateAsync(body)
        const newId = created?.rule?.id || created?.id
        if (newId) {
          const currentIds = escalations.map((e) => e.id)
          await updateAssociations.mutateAsync([...currentIds, newId])
          setSuccess(true)
          setTimeout(() => onCreated(newId), 400)
        }
      } else {
        await updateRule.mutateAsync({ id: rule.id, body })
        setSuccess(true)
        setTimeout(() => setSuccess(false), 1800)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  useCmdSave(doSave, dirty)

  if (!isNew && !rule) return null

  return (
    <PanelShell
      backLabel={t('agentDetail.backToEscalations')}
      onBack={onBack}
      title={isNew ? t('agentDetail.newRule') : (rule.emoji ? `${rule.emoji} ${rule.title}` : rule.title)}
      subtitle={isNew ? t('agentDetail.defineRule') : t('agentDetail.editRule')}
      badge={dirty ? t('agentDetail.unsaved') : null}
      headerRight={
        !isNew && (
          <div className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <span className="text-[11px] text-muted-foreground">{form.is_active ? t('common.active') : t('common.inactive')}</span>
          </div>
        )
      }
    >
      {error && <PanelError msg={error} />}

      <form onSubmit={(e) => { e.preventDefault(); doSave() }} className="space-y-4">
        <div className="flex items-end gap-2">
          <EmojiPicker value={form.emoji} onChange={(v) => setForm({ ...form, emoji: v })} />
          <FieldRow className="flex-1">
            <Label className="text-xs">{t('common.title')}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="h-8 text-sm"
              required
              autoFocus={isNew}
            />
          </FieldRow>
        </div>

        <FieldRow>
          <Label className="text-xs">{t('common.audience')}</Label>
          <Input
            value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value })}
            className="h-8 text-sm"
          />
        </FieldRow>

        <FieldRow>
          <Label className="text-xs">{t('escalation.trigger')}</Label>
          <RichEditor
            value={form.trigger_description}
            onChange={(md) => setForm({ ...form, trigger_description: md })}
            placeholder={t('escalation.triggerPlaceholder')}
            minHeight="100px"
          />
        </FieldRow>

        <FieldRow>
          <Label className="text-xs">{t('common.rules')}</Label>
          <RichEditor
            value={form.rules}
            onChange={(md) => setForm({ ...form, rules: md })}
            placeholder={t('escalation.rulesPlaceholder')}
            minHeight="100px"
          />
        </FieldRow>

        <FieldRow>
          <Label className="text-xs">{t('agentDetail.assignAgent')}</Label>
          <Input
            type="number"
            value={form.assign_to_agent}
            onChange={(e) => setForm({ ...form, assign_to_agent: e.target.value })}
            className="h-8 text-sm"
          />
        </FieldRow>

        <SaveButton dirty={dirty} saving={saving} success={success} createLabel={isNew ? t('common.create') : null} />
      </form>
    </PanelShell>
  )
}

/* ────────────────────────────────────────────────────────── */
/* Panel primitives                                           */
/* ────────────────────────────────────────────────────────── */

function PanelShell({ title, subtitle, children, badge, headerRight, action, backLabel, onBack }) {
  const { t } = useI18n()
  return (
    <div className="rounded-xl border bg-card p-5 shadow-soft-sm space-y-4 lg:sticky lg:top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> {backLabel || t('common.back')}
        </button>
      )}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold leading-tight truncate">{title}</h3>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {headerRight}
        {action && (
          <Button size="sm" variant="outline" onClick={action.onClick} className="h-7 text-xs shrink-0">
            {action.icon && <action.icon className="me-1 h-3 w-3" />} {action.label}
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}

function FieldRow({ children, className = '' }) {
  return <div className={`space-y-1.5 ${className}`}>{children}</div>
}

function Section({ heading, children }) {
  return (
    <div className="space-y-2 pt-3 border-t">
      <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
        {heading}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function PanelError({ msg }) {
  return (
    <div className="p-2 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
      {msg}
    </div>
  )
}

function SaveButton({ dirty, saving, success, createLabel }) {
  const { t } = useI18n()
  let label = createLabel || t('common.save')
  if (success) label = (createLabel ? t('agentDetail.created') : t('agentDetail.savedShort')) + ' ✓'
  if (saving) label = t('common.saving')
  return (
    <div className="flex items-center gap-2">
      <Button
        type="submit"
        size="sm"
        className="flex-1"
        disabled={saving || (!dirty && !createLabel)}
      >
        {saving && <Loader2 className="me-1.5 h-3 w-3 animate-spin" />}
        {label}
      </Button>
      {dirty && !saving && (
        <span className="text-[10px] text-muted-foreground">⌘S</span>
      )}
    </div>
  )
}

function EmptyState({ icon: Icon, title, description, actionLabel, actionTo, onAction }) {
  return (
    <div className="rounded-lg border border-dashed bg-background/40 p-6 text-center space-y-3">
      <div className="grid place-items-center mx-auto size-10 rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      {(actionTo || onAction) && (
        actionTo ? (
          <Button asChild size="sm" variant="outline">
            <Link to={actionTo}><Plus className="me-1.5 h-3 w-3" />{actionLabel}</Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onAction}>
            <Plus className="me-1.5 h-3 w-3" />{actionLabel}
          </Button>
        )
      )}
    </div>
  )
}

function EmptySection({ label, to, actionLabel }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-2 rounded-md border border-dashed bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent/30 transition">
      <span>{label}</span>
      <span className="text-primary flex items-center gap-1"><ExternalLink className="h-3 w-3" />{actionLabel}</span>
    </Link>
  )
}

function PanelList({ items, link }) {
  return (
    <div className="space-y-2">
      {items.map((it) => {
        const Wrap = it.onClick ? 'button' : 'div'
        return (
          <Wrap
            key={it.id}
            type={it.onClick ? 'button' : undefined}
            onClick={it.onClick}
            className={`w-full text-left rounded-md border bg-background px-3 py-2 transition ${
              it.onClick ? 'hover:border-primary/40 hover:bg-accent/40 cursor-pointer' : ''
            }`}
          >
            <div className="flex items-center gap-2 text-sm">
              {it.emoji && <span className="text-base leading-none">{it.emoji}</span>}
              {it.icon && !it.emoji && <it.icon className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className={`flex-1 truncate ${it.status === false ? 'text-muted-foreground' : ''}`}>{it.label}</span>
              {it.badge && (
                <Badge variant="secondary" className="text-[10px]">{it.badge}</Badge>
              )}
              {typeof it.status === 'boolean' && (
                <span className={`size-1.5 rounded-full ${it.status ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
              )}
            </div>
            {it.sub && (
              <div className="text-xs text-muted-foreground mt-0.5 truncate ms-6">{it.sub}</div>
            )}
          </Wrap>
        )
      })}
      {link && (
        <Link
          to={link.to}
          className="flex items-center gap-1 text-xs text-primary hover:underline mt-1 px-1"
        >
          <ExternalLink className="h-3 w-3" /> {link.label}
        </Link>
      )}
    </div>
  )
}
