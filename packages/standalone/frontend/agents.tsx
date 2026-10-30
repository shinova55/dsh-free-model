import { tr, locale } from './i18n.mjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ChevronDown, ChevronUp, CircleAlert, Clock3, FileJson, FolderSearch, KeyRound, Monitor, Play, Plus, RefreshCw, Save, Search, Square, Terminal, Trash2, Upload } from 'lucide-react'
import { Badge, Button, Input, Switch } from './components/ui'
import { WorkbenchDialog } from './components/workbench-dialog'
import { failureMessage, management, useManagementResource } from './management'
import type { Host, Summary } from './types'

interface Client {
  id: string; name: string; kind: 'cli' | 'desktop'; installed: boolean
  executable: string; cwd: string; model: string; mode: 'gateway' | 'native'
  running?: boolean; lastLaunchedAt?: number; error?: string; nativeOnly?: boolean
}
interface QuotaWindow {
  name: string; kind?: string; windowSeconds?: number; usedPercent?: number; remainingPercent?: number
  resetsAt?: number | string; limit?: number; remaining?: number
}
interface Account {
  id: string; provider: string; label: string; enabled: boolean; plan?: string; models: string[]
  quota?: { windows: QuotaWindow[]; fetchedAt?: number; checkedAt?: string; error?: string; state?: string; status?: string; plan?: string }
}
interface Workbench { clients: Client[]; accounts: Account[] }
interface Candidate { provider: string; label: string; available: boolean }
const splitModels = (text: string) => [...new Set(text.split(/[\n,]+/).map(value => value.trim()).filter(Boolean))]
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const dateLabel = (value?: number | string) => {
  if (value === undefined || value === '') return ''
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value)
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ClientRow({ client, summary, onChanged }: { client: Client; summary: Summary; onChanged(): Promise<void> }) {
  const [expanded, setExpanded] = useState(false)
  const [executable, setExecutable] = useState(client.executable)
  const [cwd, setCwd] = useState(client.cwd)
  const [model, setModel] = useState(client.model)
  const [mode, setMode] = useState(client.mode)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const live = useRef(true)
  const lock = useRef(false)
  useEffect(() => () => { live.current = false }, [])
  const availableModels = useMemo(() => summary.catalog.filter(row => row.routable && !row.hiddenByUser && !row.hiddenByGroup), [summary.catalog])
  const dirty = executable !== client.executable || cwd !== client.cwd || model !== client.model || mode !== client.mode
  const run = async (action: 'save' | 'launch' | 'stop') => {
    if (lock.current) return
    lock.current = true; setBusy(action); setError(''); setStatus('')
    try {
      if (action !== 'stop' && (dirty || action === 'save')) {
        if (!executable.trim()) throw new Error(tr("请设置客户端可执行文件的绝对路径。"))
        await management('/workbench/clients/save', { id: client.id, executable: executable.trim(), cwd: cwd.trim(), model, mode })
      }
      if (action !== 'save') await management(`/workbench/clients/${action}`, { id: client.id })
      if (live.current) {
        setStatus(action === 'launch' ? tr("启动请求已完成。") : action === 'stop' ? tr("已停止本工作台启动的进程。") : tr("配置已保存。"))
        await onChanged()
      }
    } catch (reason) { if (live.current) setError(failureMessage(reason)) }
    finally { lock.current = false; if (live.current) setBusy('') }
  }
  return <div className="wb-client" data-running={client.running ? 'true' : undefined}>
    <div className="wb-client-row">
      <span className={`wb-app-icon ${client.kind === 'desktop' ? 'is-green' : ''}`}>{client.kind === 'desktop' ? <Monitor size={22} /> : <Terminal size={22} />}</span>
      <div className="wb-client-name"><strong>{client.name}</strong><small>{client.kind === 'desktop' ? tr("桌面应用") : tr("命令行客户端")}<span> · </span>{client.running ? tr("运行中") : client.installed ? tr("已检测到") : tr("未检测到")}</small></div>
      <label className="wb-model-select"><span className="wb-sr-only">{client.name} {tr(" 模型")}</span><select value={model} disabled={!!busy || client.running || client.nativeOnly} onChange={event => { setModel(event.target.value); setStatus('') }}>
        <option value="">{mode === 'gateway' ? tr("选择网关模型") : tr("客户端默认模型")}</option>
        {model && !availableModels.some(row => row.id === model) && <option value={model}>{model}{tr("（当前配置）")}</option>}
        {availableModels.map(row => <option key={row.id} value={row.id}>{row.name || row.id}</option>)}
      </select></label>
      <Badge tone={client.running ? 'success' : 'neutral'} dot={!!client.running}>{client.running ? tr("运行中") : mode === 'gateway' ? tr("第三方 API") : tr("原生配置")}</Badge>
      <div className="wb-client-actions">
        <Button variant="ghost" title={tr("{0} 启动设置", client.name)} aria-label={tr("{0} 启动设置", client.name)} aria-expanded={expanded} disabled={!!busy} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</Button>
        {client.running ? <Button variant="outline" disabled={!!busy} busy={busy === 'stop'} onClick={() => void run('stop')}><Square size={13} />{tr("停止")}</Button>
          : <Button disabled={!!busy || !executable.trim() || (mode === 'gateway' && !model)} busy={busy === 'launch'} onClick={() => void run('launch')}><Play size={14} />{tr("启动")}</Button>}
      </div>
    </div>
    {expanded && <form className="wb-client-settings" onSubmit={event => { event.preventDefault(); void run('save') }}>
      <label>{tr("可执行文件")}<Input value={executable} disabled={!!busy || client.running} placeholder={tr("可执行文件的绝对路径")} onChange={event => setExecutable(event.target.value)} /></label>
      <label>{tr("工作目录")}<Input value={cwd} disabled={!!busy || client.running} placeholder={tr("默认工作目录")} onChange={event => setCwd(event.target.value)} /></label>
      <label>{tr("接入方式")}<select value={mode} disabled={!!busy || client.running || client.nativeOnly} onChange={event => setMode(event.target.value as Client['mode'])}><option value="gateway">{tr("第三方 API · 本地网关")}</option><option value="native">{tr("客户端原生配置")}</option></select></label>
      <Button type="submit" variant="outline" busy={busy === 'save'} disabled={!!busy || !dirty || !!client.running}><Save size={14} />{tr("保存")}</Button>
      {client.lastLaunchedAt && <small className="wb-client-last">{tr("最近启动 ")}{dateLabel(client.lastLaunchedAt)}</small>}
    </form>}
    {(error || client.error) && <p className="wb-row-feedback wb-error" role="alert"><CircleAlert size={14} />{error || client.error}</p>}
    {status && <p className="wb-row-feedback wb-status" role="status"><Check size={14} />{status}</p>}
  </div>
}

function QuotaMeter({ title, window }: { title: string; window?: QuotaWindow }) {
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  const used = finite(window?.usedPercent) ? window.usedPercent
    : finite(window?.remainingPercent) ? 100 - window.remainingPercent
      : finite(window?.remaining) && finite(window?.limit) && window.limit > 0 ? 100 * (1 - window.remaining / window.limit) : undefined
  const clamped = used === undefined ? undefined : Math.min(100, Math.max(0, used))
  return <div className="wb-quota">
    <div><span>{title}</span><strong>{clamped === undefined ? tr("未知") : tr("{0}% 已用", Math.round(clamped))}</strong></div>
    {clamped === undefined ? <div className="wb-quota-track is-unknown" aria-label={tr("{0}额度未知", title)} />
      : <div className="wb-quota-track" role="progressbar" aria-label={tr("{0}已用额度", title)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)}><span className={clamped >= 90 ? 'is-low' : clamped >= 70 ? 'is-warn' : ''} style={{ width: `${clamped}%` }} /></div>}
    <small>{window?.resetsAt && dateLabel(window.resetsAt) ? tr("{0} 重置", dateLabel(window.resetsAt)) : tr("重置时间未知")}</small>
  </div>
}

function ImportSubscription({ candidates, onClose, onSaved }: { candidates: Candidate[]; onClose(): void; onSaved(): Promise<void> }) {
  const [tab, setTab] = useState<'api' | 'json' | 'file'>('api')
  const [provider, setProvider] = useState('api')
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [json, setJson] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [models, setModels] = useState('')
  const [format, setFormat] = useState('openai-chat')
  const [quotaOnly, setQuotaOnly] = useState(false)
  const [filename, setFilename] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileValue = useRef<Record<string, unknown> | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)
  const live = useRef(true)
  const fileSequence = useRef(0)
  useEffect(() => () => { live.current = false; fileSequence.current++; fileValue.current = undefined }, [])
  const clear = () => { setApiKey(''); setJson(''); setFilename(''); fileValue.current = undefined; if (fileInput.current) fileInput.current.value = '' }
  const chooseTab = (value: typeof tab) => { clear(); fileSequence.current++; setTab(value); setProvider(value === 'api' ? 'api' : 'codex'); setError('') }
  const readFile = async (file?: File) => {
    const sequence = ++fileSequence.current
    setError(''); setFilename(''); fileValue.current = undefined
    if (!file) return
    if (file.size > 768 * 1024) { setError(tr("JSON 文件不能超过 768 KB。")); return }
    try {
      const value: unknown = JSON.parse(await file.text())
      if (!object(value)) throw new Error()
      if (live.current && sequence === fileSequence.current) { fileValue.current = value; setFilename(file.name) }
    } catch { if (live.current && sequence === fileSequence.current) setError(tr("文件必须是有效的 JSON 对象。")) }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError('')
    let credentials: Record<string, unknown>
    let payload: Record<string, unknown> = {}
    if (tab === 'api') {
      if (!apiKey.trim()) { setError(tr("请输入 API Key。")); return }
      credentials = { apiKey: apiKey.trim() }
    } else {
      let parsed: unknown
      try { parsed = tab === 'file' ? fileValue.current : JSON.parse(json) } catch { setError(tr("请输入有效的 JSON 对象。")); return }
      if (!object(parsed)) { setError(tab === 'file' ? tr("请先选择 JSON 文件。") : tr("凭据必须是 JSON 对象。")); return }
      credentials = object(parsed.credentials) ? parsed.credentials : parsed
      if (object(parsed.credentials)) {
        if (typeof parsed.provider === 'string') payload.provider = parsed.provider
        if (typeof parsed.label === 'string') payload.label = parsed.label
        if (typeof parsed.baseUrl === 'string') payload.baseUrl = parsed.baseUrl
        if (typeof parsed.format === 'string') payload.format = parsed.format
        if (Array.isArray(parsed.models) && parsed.models.every(value => typeof value === 'string')) payload.models = parsed.models
      }
    }
    if (!Object.keys(credentials).length) { setError(tr("凭据对象不能为空。")); return }
    const actualProvider = typeof payload.provider === 'string' ? payload.provider : provider.trim()
    if (!['codex', 'claude', 'gemini', 'api'].includes(actualProvider)) { setError(tr("请选择受支持的订阅供应商。")); return }
    const actualUrl = actualProvider === 'api' ? baseUrl.trim() || (typeof payload.baseUrl === 'string' ? payload.baseUrl : '') : ''
    if (actualProvider === 'api' && !actualUrl) { setError(tr("API 订阅需要填写 API 地址。")); return }
    if (actualUrl) {
      try { const url = new URL(actualUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error() }
      catch { setError(tr("请输入不含用户名和密码的 HTTP(S) API 地址。")); return }
    }
    payload = {
      provider: actualProvider, ...(label.trim() ? { label: label.trim() } : {}),
      ...payload, ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      ...(models.trim() ? { models: splitModels(models) } : {}), credentials,
    }
    if (actualProvider === 'api') { payload.baseUrl = actualUrl; payload.format = payload.format ?? format }
    else { delete payload.baseUrl; delete payload.format }
    if (quotaOnly) payload.models = []
    else if (!Array.isArray(payload.models) || payload.models.length === 0) { setError(tr("请填写模型 ID，或选择“仅管理额度”。")); return }
    if (!payload.provider) { setError(tr("请输入供应商 ID。")); return }
    setBusy(true)
    try {
      await management('/subscriptions/import', payload)
      if (!live.current) return
      clear(); await onSaved(); onClose()
    } catch (reason) { if (live.current) setError(failureMessage(reason)) }
    finally { if (live.current) setBusy(false) }
  }
  return <WorkbenchDialog title={tr("导入订阅")} onClose={() => { clear(); onClose() }} busy={busy}>
    <form className="wb-form" onSubmit={event => void submit(event)}>
      <div className="wb-segments wb-import-tabs" aria-label={tr("导入方式")}>
        {([['api', 'API Key', KeyRound], ['json', tr("JSON 凭据"), FileJson], ['file', tr("JSON 文件"), Upload]] as const).map(([id, name, Icon]) => <button key={id} type="button" aria-pressed={tab === id} disabled={busy} onClick={() => chooseTab(id)}><Icon size={14} />{name}</button>)}
      </div>
      <div className="wb-form-grid"><label>{tr("供应商")}<select required value={provider} disabled={busy || tab === 'api'} onChange={event => setProvider(event.target.value)}><option value="api">{tr("第三方 API")}</option><option value="codex">{tr("Codex 订阅")}</option><option value="claude">{tr("Claude 订阅")}</option><option value="gemini">{tr("Gemini 订阅")}</option></select></label>
        <label>{tr("账号名称")}<Input value={label} disabled={busy} placeholder={tr("可选")} onChange={event => setLabel(event.target.value)} /></label></div>
      {tab === 'api' && <label>API Key<Input type="password" autoComplete="new-password" spellCheck={false} required value={apiKey} disabled={busy} onChange={event => setApiKey(event.target.value)} /></label>}
      {tab === 'json' && <label>{tr("凭据 JSON")}<textarea rows={6} spellCheck={false} autoComplete="off" required value={json} disabled={busy} onChange={event => setJson(event.target.value)} /></label>}
      {tab === 'file' && <label className="wb-file"><Upload size={22} /><span>{filename || tr("选择本机 JSON 凭据文件")}</span><input ref={fileInput} type="file" accept=".json,application/json" disabled={busy} aria-label={tr("选择 JSON 凭据文件")} onChange={event => void readFile(event.target.files?.[0])} /></label>}
      {provider === 'api' && <label>{tr("API 地址")}<Input type="url" value={baseUrl} disabled={busy} placeholder="https://api.example.com/v1" onChange={event => setBaseUrl(event.target.value)} /></label>}
      <div className="wb-form-grid">{provider === 'api' && <label>{tr("协议")}<select value={format} disabled={busy} onChange={event => setFormat(event.target.value)}><option value="openai-chat">OpenAI Chat</option><option value="openai-responses">OpenAI Responses</option><option value="anthropic-messages">Anthropic Messages</option></select></label>}
        <label>{tr("模型 ID")}<Input value={models} disabled={busy || quotaOnly} placeholder={tr("以逗号分隔")} onChange={event => setModels(event.target.value)} /></label></div>
      <label className="wb-checkbox"><input type="checkbox" checked={quotaOnly} disabled={busy} onChange={event => setQuotaOnly(event.target.checked)} /><span>{tr("仅管理额度")}</span></label>
      {error && <p className="wb-error" role="alert"><CircleAlert size={15} />{error}</p>}
      <div className="wb-form-actions"><Button variant="outline" disabled={busy} onClick={() => { clear(); onClose() }}>{tr("取消")}</Button><Button type="submit" busy={busy}><Upload size={15} />{tr("导入订阅")}</Button></div>
    </form>
  </WorkbenchDialog>
}

export function Agents({ summary, active, host }: { summary: Summary; active: boolean; host: Host }) {
  const workbench = useManagementResource<Workbench>('/workbench', active)
  const subscriptions = useManagementResource<{ accounts: Account[] }>('/subscriptions', active)
  const discovery = useManagementResource<{ candidates: Candidate[] }>('/subscriptions/discover', active)
  const [importing, setImporting] = useState(false)
  const [local, setLocal] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [removing, setRemoving] = useState('')
  const live = useRef(true)
  const lock = useRef(false)
  useEffect(() => () => { live.current = false }, [])
  const accounts = subscriptions.data?.accounts ?? workbench.data?.accounts ?? []
  const candidates = discovery.data?.candidates ?? []
  const refresh = async () => { await Promise.all([workbench.reload(), subscriptions.reload(), host.refresh()]) }
  const run = async (path: string, body: Record<string, unknown>, key: string) => {
    if (lock.current) return
    lock.current = true; setBusy(key); setError(''); setStatus('')
    try {
      await management(path, body)
      if (!live.current) return
      setStatus(path.endsWith('/quota') ? tr("额度查询已完成。") : path.endsWith('/import-local') ? tr("本机订阅已导入。") : tr("订阅设置已更新。"))
      setRemoving(''); await subscriptions.reload()
      if (!path.endsWith('/quota')) await host.refresh()
    } catch (reason) { if (live.current) setError(failureMessage(reason)) }
    finally { lock.current = false; if (live.current) setBusy('') }
  }
  const rows = accounts.filter(account => `${account.label} ${account.provider} ${account.plan ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <div className="wb-page">
    <header className="wb-heading"><div><span className="wb-eyebrow">DESKTOP WORKBENCH</span><h1>{tr("客户端与订阅")}</h1><p>{tr("本机客户端 · 第三方 API · 订阅额度")}</p></div>
      <Button variant="outline" title={tr("刷新工作台")} aria-label={tr("刷新工作台")} disabled={workbench.loading || subscriptions.loading || !!busy} busy={workbench.loading || subscriptions.loading} onClick={() => void refresh()}><RefreshCw size={15} /><span>{tr("刷新")}</span></Button></header>
    <div className="wb-summary"><span><strong>{workbench.data ? workbench.data.clients.filter(client => client.installed).length : '—'}</strong> {tr(" 已安装客户端")}</span><span><i className="wb-dot" /><strong>{workbench.data ? workbench.data.clients.filter(client => client.running).length : '—'}</strong> {tr(" 运行中")}</span><span><strong>{subscriptions.data || workbench.data ? accounts.filter(account => account.enabled).length : '—'}</strong> {tr(" 已启用订阅")}</span></div>
    <div className="wb-section-heading"><h2><Monitor size={17} />{tr("客户端")}</h2><Badge tone="blue">{tr("第三方 API 接入")}</Badge></div>
    {workbench.error && <div className="wb-feedback wb-error" role="alert"><CircleAlert size={16} /><span>{workbench.error}</span><Button variant="outline" onClick={() => void workbench.reload()}>{tr("重试")}</Button></div>}
    <section className="wb-client-list" aria-label={tr("客户端启动器")} aria-busy={workbench.loading}>
      {workbench.data?.clients.map(client => <ClientRow key={client.id} client={client} summary={summary} onChanged={workbench.reload} />)}
      {!workbench.data && workbench.loading && <div className="wb-empty" role="status"><RefreshCw size={22} /><strong>{tr("正在检测客户端")}</strong></div>}
      {workbench.data?.clients.length === 0 && <div className="wb-empty"><Terminal size={24} /><strong>{tr("服务未返回可配置的客户端")}</strong><Button variant="outline" onClick={() => void workbench.reload()}>{tr("重新检测")}</Button></div>}
    </section>
    <div className="wb-section-heading wb-subscription-heading"><h2><Clock3 size={17} />{tr("订阅与额度 ")}<small>{accounts.length}</small></h2>
      <div><Button variant="outline" aria-expanded={local} onClick={() => setLocal(!local)}><FolderSearch size={15} />{tr("本机发现")}</Button><Button onClick={() => setImporting(true)}><Plus size={15} />{tr("导入订阅")}</Button></div></div>
    {local && <section className="wb-discovery" aria-label={tr("本机订阅发现")}>
      <div className="wb-discovery-heading"><strong>{tr("本机订阅")}</strong><Button variant="ghost" aria-label={tr("重新发现本机订阅")} title={tr("重新发现本机订阅")} disabled={discovery.loading || !!busy} busy={discovery.loading} onClick={() => void discovery.reload()}><RefreshCw size={15} /></Button></div>
      {discovery.error && <p role="alert" className="wb-error">{discovery.error}</p>}
      {candidates.map(candidate => <div className="wb-candidate" key={candidate.provider}><span><strong>{candidate.label}</strong><small>{candidate.provider}</small></span><Badge tone={candidate.available ? 'blue' : 'neutral'}>{candidate.available ? tr("可导入") : tr("未发现")}</Badge><Button variant="outline" disabled={!candidate.available || !!busy} busy={busy === `local:${candidate.provider}`} onClick={() => void run('/subscriptions/import-local', { provider: candidate.provider }, `local:${candidate.provider}`)}><Upload size={14} />{tr("导入")}</Button></div>)}
      {!discovery.loading && !candidates.length && !discovery.error && <p className="wb-discovery-empty">{tr("未发现本机订阅")}</p>}
    </section>}
    <div className="wb-toolbar"><label className="wb-search"><Search size={16} /><Input aria-label={tr("搜索订阅")} placeholder={tr("搜索账号、供应商或方案")} value={search} onChange={event => setSearch(event.target.value)} /></label><span className="wb-toolbar-meta">{tr("5 小时 / 每周额度")}</span></div>
    {(error || subscriptions.error) && <div className="wb-feedback wb-error" role="alert"><CircleAlert size={16} /><span>{error || subscriptions.error}</span><Button variant="outline" disabled={!!busy} onClick={() => { setError(''); void subscriptions.reload() }}>{tr("重试")}</Button></div>}
    {status && <div className="wb-feedback wb-status" role="status"><Check size={16} />{status}</div>}
    <section className="wb-account-list" aria-label={tr("订阅账号")} aria-busy={subscriptions.loading}>
      {rows.map(account => {
        const windows = account.quota?.windows ?? []
        const fiveHour = windows.find(window => window.kind === 'five_hour' || window.windowSeconds === 18000 || /5\s*h|5.?hour|five.?hour|5.?小时|session|short/i.test(window.name))
        const weekly = windows.find(window => window.kind === 'weekly' || window.windowSeconds === 604800 || /week|seven.?day|7.?day|周|星期/i.test(window.name))
        const other = windows.filter(window => window !== fiveHour && window !== weekly)
        return <div className="wb-account" key={account.id}>
          <div className="wb-account-info"><span className="wb-app-icon is-green"><KeyRound size={20} /></span><div><strong>{account.label}</strong><small>{account.provider}{account.plan || account.quota?.plan ? ` · ${account.plan || account.quota?.plan}` : ''}</small><small>{account.models?.length ?? 0} {tr(" 个模型")}</small></div>
            <Switch checked={account.enabled} aria-label={tr("启用订阅 {0}", account.label)} disabled={!!busy} onCheckedChange={enabled => void run('/subscriptions/enabled', { id: account.id, enabled }, `enable:${account.id}`)} /></div>
          <div className="wb-quota-windows"><QuotaMeter title={tr("5 小时")} window={fiveHour} /><QuotaMeter title={tr("每周")} window={weekly} />{other.map((window, index) => <QuotaMeter title={window.name} window={window} key={`${window.name}:${index}`} />)}</div>
          <div className="wb-account-actions"><Button variant="ghost" title={tr("刷新 {0} 额度", account.label)} aria-label={tr("刷新 {0} 额度", account.label)} disabled={!!busy} busy={busy === `quota:${account.id}`} onClick={() => void run('/subscriptions/quota', { id: account.id }, `quota:${account.id}`)}><RefreshCw size={15} /></Button>
            <Button variant="ghost" title={tr("移除 {0}", account.label)} aria-label={tr("移除 {0}", account.label)} className="wb-danger" disabled={!!busy} onClick={() => setRemoving(account.id)}><Trash2 size={15} /></Button></div>
          <div className="wb-account-foot"><Badge tone={account.enabled ? 'success' : 'neutral'}>{account.enabled ? tr("已启用") : tr("已停用")}</Badge>{!account.models?.length && <Badge>{tr("仅额度")}</Badge>}
            <span>{account.quota?.error ? tr("额度暂不可用") : account.quota?.fetchedAt || account.quota?.checkedAt ? tr("更新于 {0}", dateLabel(account.quota.fetchedAt ?? account.quota.checkedAt)) : tr("额度尚未查询")}{account.quota?.state ? ` · ${account.quota.state}` : ''}</span></div>
          {removing === account.id && <div className="wb-remove"><span>{tr("移除订阅 ")}{account.label}？</span><Button variant="outline" disabled={!!busy} onClick={() => setRemoving('')}>{tr("取消")}</Button><Button variant="outline" className="wb-danger" disabled={!!busy} busy={busy === `remove:${account.id}`} onClick={() => void run('/subscriptions/remove', { id: account.id }, `remove:${account.id}`)}><Trash2 size={14} />{tr("确认移除")}</Button></div>}
        </div>
      })}
      {!rows.length && <div className="wb-empty"><KeyRound size={24} /><strong>{search ? tr("没有匹配的订阅") : subscriptions.loading ? tr("正在读取订阅") : tr("尚无订阅账号")}</strong>
        {search ? <Button variant="outline" onClick={() => setSearch('')}>{tr("清除搜索")}</Button> : <Button variant="outline" onClick={() => setImporting(true)}><Plus size={14} />{tr("导入订阅")}</Button>}</div>}
    </section>
    {importing && active && <ImportSubscription candidates={candidates} onClose={() => setImporting(false)} onSaved={async () => { await Promise.all([subscriptions.reload(), host.refresh()]); if (live.current) setStatus(tr("订阅已导入。")) }} />}
  </div>
}
