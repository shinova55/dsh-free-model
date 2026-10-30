import { tr, locale } from './i18n.mjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, CircleAlert, Eye, Layers3, Pencil, Plus, RefreshCw, Route, Save, Search, Trash2, X } from 'lucide-react'
import { Badge, Button, Input, Switch } from './components/ui'
import { WorkbenchDialog } from './components/workbench-dialog'
import { failureMessage, management, useManagementResource } from './management'
import type { Host } from './types'
import './routing.css'

type Strategy = 'fallback' | 'round-robin' | 'smart' | 'usage' | 'pace'
interface Combo { id: string; name: string; models: string[]; strategy: Strategy; stickyLimit: number; enabled: boolean }
interface RoutingModel { id: string; name: string; channel: string }
interface RoutingData { combos: Combo[]; models: RoutingModel[]; strategies: string[] }
interface Preview {
  capacity: { contextWindow?: number | null; maxOutput?: number | null; vision?: boolean | null; reasoning?: boolean | null } | null
  order: { id: string; name: string; reason?: string }[]
}
const strategies: Record<Strategy, { name: string; detail: string }> = {
  fallback: { name: tr("顺序回退"), detail: tr("按成员顺序依次尝试") },
  'round-robin': { name: tr("轮询"), detail: tr("轮换起点，按粘性回合数保持当前成员") },
  smart: { name: tr("智能重置"), detail: tr("优先选择符合条件且下次额度重置最早的成员") },
  usage: { name: tr("最低用量"), detail: tr("优先选择本机已记录调用次数最少的成员") },
  pace: { name: tr("每周配速"), detail: tr("优先选择每周剩余额度 / 剩余小时最高的成员") },
}
const strategyName = (value: string) => strategies[value as Strategy]?.name ?? value
const capacityNumber = (value?: number | null) => typeof value === 'number' && Number.isFinite(value) && value > 0
  ? value.toLocaleString(locale) : tr("未知")
const capability = (value?: boolean | null) => value === true ? tr("支持") : value === false ? tr("不支持") : tr("未知")

function createsCycle(id: string, current: string | undefined, combos: Combo[]): boolean {
  if (!current) return false
  const byId = new Map(combos.map(combo => [combo.id, combo]))
  const visited = new Set<string>()
  const visit = (candidate: string): boolean => {
    if (candidate === current) return true
    if (visited.has(candidate)) return false
    visited.add(candidate)
    return byId.get(candidate)?.models.some(visit) ?? false
  }
  return visit(id)
}

function RoutingEditor({ combo, data, onClose, onSaved }: {
  combo?: Combo; data: RoutingData; onClose(): void; onSaved(): Promise<void>
}) {
  const [name, setName] = useState(combo?.name ?? '')
  const [models, setModels] = useState<string[]>(combo?.models ?? [])
  const [strategy, setStrategy] = useState(combo?.strategy ?? (data.strategies.includes('fallback') ? 'fallback' : data.strategies[0] ?? 'fallback'))
  const [stickyLimit, setStickyLimit] = useState(String(combo?.stickyLimit ?? 1))
  const [enabled, setEnabled] = useState(combo?.enabled ?? true)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState('')
  const [previewError, setPreviewError] = useState('')
  const live = useRef(true)
  const saveLock = useRef(false)
  const previewRequest = useRef<AbortController | undefined>(undefined)
  const choices = useMemo(() => {
    const rows = new Map(data.models.map(model => [model.id, model]))
    for (const group of data.combos) rows.set(group.id, { id: group.id, name: group.name, channel: 'combo' })
    return [...rows.values()]
  }, [data])
  const byId = useMemo(() => new Map(choices.map(model => [model.id, model])), [choices])
  const groupIds = useMemo(() => new Set(data.combos.map(group => group.id)), [data.combos])
  const allowedStrategies = [...new Set(data.strategies)]
  const invalidModels = models.filter(id => !byId.has(id) || createsCycle(id, combo?.id, data.combos))
  const available = choices.filter(model => !models.includes(model.id)
    && (kind === 'all' || (kind === 'groups' ? groupIds.has(model.id) : !groupIds.has(model.id)))
    && `${model.id} ${model.name} ${model.channel}`.toLowerCase().includes(query.trim().toLowerCase()))
  useEffect(() => {
    live.current = true
    return () => { live.current = false; previewRequest.current?.abort() }
  }, [])
  useEffect(() => {
    previewRequest.current?.abort()
    setPreview(undefined); setPreviewError(''); setPreviewing(false)
  }, [models, strategy])
  const validate = () => {
    if (!models.length || models.length > 100) throw new Error(tr("请选择 1 至 100 个模型或路由组。"))
    if (new Set(models).size !== models.length) throw new Error(tr("成员不能重复。"))
    if (invalidModels.length) throw new Error(tr("存在未知成员或循环引用，请移除标记的成员。"))
    if (!allowedStrategies.includes(strategy)) throw new Error(tr("当前策略不可用，请重新选择。"))
  }
  const editModels = (next: string[]) => { previewRequest.current?.abort(); setPreview(undefined); setModels(next); setError('') }
  const move = (index: number, direction: number) => {
    const target = index + direction
    if (target < 0 || target >= models.length) return
    const next = [...models]
    const previous = next[index]
    next[index] = next[target]
    next[target] = previous
    editModels(next)
  }
  const loadPreview = async () => {
    if (saving || previewing) return
    setPreviewError(''); setPreview(undefined)
    try { validate() } catch (reason) { setPreviewError(failureMessage(reason)); return }
    previewRequest.current?.abort()
    const request = new AbortController()
    previewRequest.current = request
    setPreviewing(true)
    try {
      const value = await management<Preview>('/routing/preview', { models, strategy }, request.signal)
      if (live.current && !request.signal.aborted) setPreview(value)
    } catch (reason) { if (live.current && !request.signal.aborted) setPreviewError(failureMessage(reason)) }
    finally { if (live.current && !request.signal.aborted) setPreviewing(false) }
  }
  const save = async () => {
    if (saveLock.current) return
    setError('')
    try {
      if (!name.trim() || name.length > 120 || /[\0\r\n]/.test(name)) throw new Error(tr("请输入有效的路由组名称（最多 120 字）。"))
      validate()
      const limit = Number(stickyLimit)
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error(tr("粘性回合数必须是 1 至 100 的整数。"))
      saveLock.current = true; setSaving(true)
      previewRequest.current?.abort(); setPreviewing(false)
      await management('/routing/save', { combo: {
        ...(combo ? { id: combo.id } : {}), name: name.trim(), models, strategy, stickyLimit: limit, enabled,
      } })
      if (!live.current) return
      await onSaved()
      if (live.current) onClose()
    } catch (reason) { if (live.current) setError(failureMessage(reason)) }
    finally { saveLock.current = false; if (live.current) setSaving(false) }
  }
  return <WorkbenchDialog title={combo ? tr("编辑路由组") : tr("新建路由组")} onClose={onClose} busy={saving}>
    <form className="wb-form rt-editor" onSubmit={event => { event.preventDefault(); void save() }}>
      <div className="rt-settings">
        <label>{tr("路由组名称")}<Input autoFocus required maxLength={120} value={name} disabled={saving} onChange={event => setName(event.target.value)} /></label>
        <label>{tr("选择策略")}<select aria-label={tr("选择策略")} value={strategy} disabled={saving} onChange={event => { previewRequest.current?.abort(); setPreview(undefined); setStrategy(event.target.value) }}>
          {!allowedStrategies.includes(strategy) && <option value={strategy} disabled>{strategyName(strategy)}{tr("（不可用）")}</option>}
          {allowedStrategies.map(value => <option key={value} value={value}>{strategyName(value)}</option>)}
        </select></label>
        <label>{tr("粘性回合数")}<Input type="number" inputMode="numeric" min={1} max={100} step={1} required value={stickyLimit} disabled={saving} onChange={event => setStickyLimit(event.target.value)} /></label>
        <div className="rt-enabled"><span>{tr("启用路由组")}</span><Switch checked={enabled} aria-label={tr("启用路由组")} disabled={saving} onCheckedChange={setEnabled} /></div>
      </div>
      <div className="rt-strategy-description"><Badge tone="blue">{strategyName(strategy)}</Badge><span>{strategies[strategy as Strategy]?.detail ?? tr("以服务返回的策略为准")}</span></div>
      <div className="rt-members-layout">
        <section className="rt-members" aria-label={tr("已选成员顺序")}>
          <div className="rt-section-heading"><h3>{tr("成员顺序")}</h3><span>{models.length}</span></div>
          <ol className="rt-selected">
            {models.map((id, index) => {
              const model = byId.get(id), invalid = invalidModels.includes(id)
              return <li className={invalid ? 'rt-member-invalid' : ''} key={id}>
                <span className="rt-position">{index + 1}</span>
                <div className="rt-model-name"><strong>{model?.name || id}</strong><small>{id}</small>
                  {invalid ? <span className="rt-member-error">{model ? tr("循环引用") : tr("未知成员")}</span> : groupIds.has(id) && <Badge>{tr("路由组")}</Badge>}</div>
                <div className="rt-member-actions">
                  <Button variant="ghost" disabled={saving || index === 0} aria-label={tr("上移成员 {0}", model?.name || id)} title={tr("上移")} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
                  <Button variant="ghost" disabled={saving || index === models.length - 1} aria-label={tr("下移成员 {0}", model?.name || id)} title={tr("下移")} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
                  <Button variant="ghost" disabled={saving} aria-label={tr("移除成员 {0}", model?.name || id)} title={tr("移除成员")} onClick={() => editModels(models.filter(member => member !== id))}><X size={14} /></Button>
                </div>
              </li>
            })}
          </ol>
          {!models.length && <div className="rt-section-empty">{tr("尚未选择成员")}</div>}
        </section>
        <section className="rt-picker" aria-label={tr("可选模型与路由组")}>
          <div className="rt-section-heading"><h3>{tr("添加成员")}</h3><span>{available.length}</span></div>
          <div className="rt-picker-filters"><label className="wb-search"><Search size={15} /><Input aria-label={tr("搜索成员")} placeholder={tr("搜索模型、渠道或路由组")} value={query} disabled={saving} onChange={event => setQuery(event.target.value)} /></label>
            <select aria-label={tr("成员类型")} value={kind} disabled={saving} onChange={event => setKind(event.target.value)}><option value="all">{tr("全部类型")}</option><option value="models">{tr("模型")}</option><option value="groups">{tr("路由组")}</option></select></div>
          <div className="rt-picker-list">{available.map(model => {
            const cycle = createsCycle(model.id, combo?.id, data.combos)
            return <div className="rt-picker-row" key={model.id}>
              <div className="rt-model-name"><strong>{model.name || model.id}</strong><small>{model.id}</small><span>{cycle ? tr("会形成循环引用") : groupIds.has(model.id) ? tr("路由组") : model.channel}</span></div>
              <Button variant="ghost" disabled={saving || cycle || models.length >= 100} title={cycle ? tr("会形成循环引用") : models.length >= 100 ? tr("最多 100 个成员") : tr("添加成员")} aria-label={tr("添加成员 {0}", model.name || model.id)} onClick={() => editModels([...models, model.id])}><Plus size={16} /></Button>
            </div>
          })}</div>
          {!available.length && <div className="rt-section-empty">{choices.length ? tr("没有匹配的可选成员") : tr("暂无可用模型或路由组")}</div>}
        </section>
      </div>
      <section className="rt-preview" aria-label={tr("路由预览")}>
        <div className="rt-section-heading"><h3>{tr("容量与候选顺序")}</h3><Button variant="outline" disabled={saving || previewing || !models.length} busy={previewing} onClick={() => void loadPreview()}><Eye size={14} />{tr("预览")}</Button></div>
        {previewError && <p className="wb-error" role="alert"><CircleAlert size={15} />{previewError}</p>}
        {preview && <>
          <dl className="rt-capacity"><div><dt>{tr("上下文窗口")}</dt><dd>{capacityNumber(preview.capacity?.contextWindow)}</dd></div><div><dt>{tr("最大输出")}</dt><dd>{capacityNumber(preview.capacity?.maxOutput)}</dd></div><div><dt>{tr("视觉")}</dt><dd>{capability(preview.capacity?.vision)}</dd></div><div><dt>{tr("推理")}</dt><dd>{capability(preview.capacity?.reasoning)}</dd></div></dl>
          <ol className="rt-preview-order">{preview.order.map((model, index) => <li key={`${model.id}:${index}`}><span className="rt-position">{index + 1}</span><div className="rt-model-name"><strong>{model.name || model.id}</strong><small>{model.id}</small>{model.reason && <p>{model.reason}</p>}</div></li>)}</ol>
          {!preview.order.length && <p className="rt-section-empty">{tr("暂无符合条件的候选模型")}</p>}
        </>}
      </section>
      {error && <p className="wb-error" role="alert"><CircleAlert size={15} />{error}</p>}
      <div className="wb-form-actions"><Button variant="outline" disabled={saving} onClick={onClose}>{tr("取消")}</Button><Button type="submit" disabled={saving || !models.length} busy={saving}><Save size={15} />{tr("保存路由组")}</Button></div>
    </form>
  </WorkbenchDialog>
}

export function Routing({ active, host }: { active: boolean; host: Host }) {
  const { data, error: loadError, loading, reload } = useManagementResource<RoutingData>('/routing', active)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editor, setEditor] = useState<Combo | 'new'>()
  const [removing, setRemoving] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const live = useRef(true)
  const lock = useRef(false)
  useEffect(() => {
    live.current = active
    return () => { live.current = false }
  }, [active])
  const combos = data?.combos ?? []
  const rows = combos.filter(combo => `${combo.name} ${combo.id} ${combo.models.join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())
    && (filter === 'all' || (filter === 'enabled' ? combo.enabled : !combo.enabled)))
  const names = new Map([...(data?.models ?? []).map(model => [model.id, model.name] as const), ...combos.map(combo => [combo.id, combo.name] as const)])
  const blocked = !!busy || loading || !!editor
  const afterWrite = async (message: string) => {
    if (!live.current) return
    setStatus(message); setError('')
    const results = await Promise.allSettled([reload(), host.refresh()])
    if (live.current && results[1].status === 'rejected') setError(tr("路由配置已保存，但工作台刷新失败：{0}", failureMessage(results[1].reason)))
  }
  const run = async (combo: Combo, remove = false) => {
    if (lock.current) return
    lock.current = true; setBusy(combo.id); setError(''); setStatus('')
    try {
      await management(remove ? '/routing/remove' : '/routing/save', remove ? { id: combo.id } : { combo: { ...combo, enabled: !combo.enabled } })
      if (!live.current) return
      setRemoving('')
      await afterWrite(remove ? tr("路由组已删除。") : combo.enabled ? tr("路由组已停用。") : tr("路由组已启用。"))
    } catch (reason) { if (live.current) setError(failureMessage(reason)) }
    finally { lock.current = false; if (live.current) setBusy('') }
  }
  return <div className="wb-page rt-page">
    <header className="wb-heading"><div><span className="wb-eyebrow">ROUTING</span><h1>{tr("模型路由")}</h1></div><Button variant="outline" aria-label={tr("刷新路由")} title={tr("刷新路由")} disabled={blocked} busy={loading} onClick={() => void reload()}><RefreshCw size={15} />{tr("刷新")}</Button></header>
    <div className="wb-summary"><span><strong>{data ? combos.length : '—'}</strong> {tr(" 路由组")}</span><span><i className="wb-dot" /><strong>{data ? combos.filter(combo => combo.enabled).length : '—'}</strong> {tr(" 已启用")}</span><span><strong>{data ? data.models.length : '—'}</strong> {tr(" 可选模型")}</span></div>
    <div className="wb-toolbar rt-toolbar"><label className="wb-search"><Search size={16} /><Input aria-label={tr("搜索路由组")} placeholder={tr("搜索路由组或成员")} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <select aria-label={tr("路由组状态")} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{tr("全部状态")}</option><option value="enabled">{tr("已启用")}</option><option value="disabled">{tr("已停用")}</option></select>
      <Button className="rt-create" disabled={blocked || !data} onClick={() => { setStatus(''); setError(''); setEditor('new') }}><Plus size={15} />{tr("新建路由组")}</Button></div>
    {(error || loadError) && <div className="wb-feedback wb-error" role="alert"><CircleAlert size={16} /><span>{error || loadError}</span>{loadError && <Button variant="outline" disabled={blocked} onClick={() => void reload()}>{tr("重试")}</Button>}</div>}
    {status && <div className="wb-feedback wb-status" role="status"><Check size={16} /><span>{status}</span></div>}
    <section className="rt-list" aria-label={tr("路由组列表")} aria-busy={loading}>
      {rows.map(combo => <div className="rt-group" key={combo.id}>
        <div className="rt-group-row"><span className="wb-app-icon is-green"><Route size={20} /></span><div className="rt-group-name"><strong>{combo.name}</strong><small>{combo.id}</small></div>
          <div className="rt-group-strategy"><Badge tone="blue">{strategyName(combo.strategy)}</Badge><small>{combo.models.length} {tr(" 个成员 · ")}{combo.stickyLimit} {tr(" 粘性回合")}</small></div>
          <Switch checked={combo.enabled} disabled={blocked} aria-label={tr("启用路由组 {0}", combo.name)} onCheckedChange={() => void run(combo)} />
          <div className="rt-group-actions"><Button variant="ghost" disabled={blocked} title={tr("编辑路由组")} aria-label={tr("编辑路由组 {0}", combo.name)} onClick={() => { setError(''); setStatus(''); setEditor(combo) }}><Pencil size={15} /></Button><Button variant="ghost" className="wb-danger" disabled={blocked} title={tr("删除路由组")} aria-label={tr("删除路由组 {0}", combo.name)} onClick={() => setRemoving(combo.id)}><Trash2 size={15} /></Button></div>
        </div>
        <ol className="rt-group-members">{combo.models.map((id, index) => <li key={`${id}:${index}`}><span>{index + 1}</span><span title={id}>{names.get(id) || id}</span></li>)}</ol>
        {removing === combo.id && <div className="wb-remove rt-remove"><span>{tr("删除路由组“")}{combo.name}”？</span><Button variant="outline" disabled={!!busy} onClick={() => setRemoving('')}>{tr("取消")}</Button><Button variant="outline" className="wb-danger" disabled={!!busy} busy={busy === combo.id} onClick={() => void run(combo, true)}><Trash2 size={14} />{tr("确认删除")}</Button></div>}
      </div>)}
      {!data && loading && <div className="wb-empty" role="status"><RefreshCw size={22} /><strong>{tr("正在读取路由配置")}</strong></div>}
      {data && !rows.length && <div className="wb-empty"><Layers3 size={24} /><strong>{combos.length ? tr("没有匹配的路由组") : tr("尚无路由组")}</strong>{combos.length
        ? <Button variant="outline" onClick={() => { setSearch(''); setFilter('all') }}>{tr("清除筛选")}</Button>
        : <Button variant="outline" disabled={blocked} onClick={() => setEditor('new')}><Plus size={15} />{tr("新建路由组")}</Button>}</div>}
    </section>
    {editor && data && active && <RoutingEditor key={editor === 'new' ? 'new' : editor.id} combo={editor === 'new' ? undefined : editor} data={data} onClose={() => setEditor(undefined)} onSaved={() => afterWrite(tr("路由组已保存。"))} />}
  </div>
}
