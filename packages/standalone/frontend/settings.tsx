import { tr, language } from './i18n.mjs'
import { saveLanguage } from './i18n.mjs'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CircleAlert, Check, LoaderCircle, RotateCcw, Save, Settings2, RefreshCw } from 'lucide-react'
import { Badge, Button, Card, Input } from './components/ui'
import { settingsDraft, settingsChanged, syncSettings, validateSettingsDraft } from './settings-data.mjs'
import { visibilityCopy } from './visibility-data.mjs'
import type { Host, Summary } from './types'
import './settings.css'

type Draft = ReturnType<typeof settingsDraft>
type NumberField = 'defaultMaxTokens' | 'probeIntervalMinutes'
const connectionError = (reason: unknown) => reason instanceof Error
  ? reason.name === 'TimeoutError' ? tr("保存请求超时，结果尚未确认。请重试或检查服务状态。")
    : reason instanceof TypeError && /fetch/i.test(tr(reason.message)) ? tr("无法连接本地服务，修改已保留，请确认服务正在运行后重试。")
    : tr(reason.message) : tr("保存失败，修改已保留，请重试。")

export function Settings({ summary, host, active }: { summary: Summary; host: Host; active: boolean }) {
  const visibility = visibilityCopy(document.documentElement.lang)
  const [state, setState] = useState(() => ({ saved: summary.settings, draft: settingsDraft(summary.settings) }))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<NumberField, string>>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const mounted = useRef(true)
  const activeRef = useRef(active)
  const generation = useRef(0)
  activeRef.current = active
  useEffect(() => () => { mounted.current = false; generation.current++ }, [])
  useEffect(() => {
    if (!active) { generation.current++; setMessage(''); setError('') }
  }, [active])
  useEffect(() => {
    setState(previous => syncSettings(previous, summary.settings, savingRef.current))
  }, [summary.settings])
  const dirty = settingsChanged(state.draft, state.saved)
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setState(previous => ({ ...previous, draft: { ...previous.draft, [key]: value } }))
    setErrors(previous => ({ ...previous, [key]: undefined }))
    setMessage(''); setError('')
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (savingRef.current || !activeRef.current) return
    const validation = validateSettingsDraft(state.draft)
    setErrors(validation.errors); setMessage(''); setError('')
    if (!validation.patch) return
    const started = ++generation.current
    const feedbackCurrent = () => mounted.current && activeRef.current && started === generation.current
    savingRef.current = true
    setSaving(true)
    try {
      const saved = await host.saveSettings(validation.patch)
      if (!mounted.current) return
      setState({ saved, draft: settingsDraft(saved) })
      if (feedbackCurrent()) setMessage(tr("设置已保存并生效"))
      // 保存结果已确认；后续读取失败不能误报为保存失败。
      try { await host.refresh() } catch {
        if (feedbackCurrent()) setMessage(tr("设置已保存；状态刷新失败，稍后会自动重试。"))
      }
    } catch (reason) {
      if (feedbackCurrent()) setError(connectionError(reason))
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }
  const toggle = (name: 'enabled' | 'exposeRegionModels' | 'streamRecovery' | 'standaloneProbe' | 'hideFreeModels' | 'hideEacModels', label: string, help: string) =>
    <label className="settings-field" key={name}>
      <span><strong>{label}</strong><small>{help}</small></span>
      <input type="checkbox" role="switch" name={name} className="settings-toggle"
        checked={state.draft[name]} onChange={event => update(name, event.target.checked)} />
    </label>
  const numeric = (name: NumberField, label: string, help: string, min: number, max: number) =>
    <div className="settings-field settings-number-field">
      <label htmlFor={`setting-${name}`}><strong>{label}</strong><small>{help}</small></label>
      <div className="settings-number"><Input id={`setting-${name}`} name={name} type="number" min={min} max={max} step={1}
        value={state.draft[name]} onChange={event => update(name, event.target.value)}
        aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `setting-error-${name}` : undefined} />
        {errors[name] ? <p id={`setting-error-${name}`} className="settings-field-error" role="alert"><CircleAlert size={12} />{errors[name]}</p>
          : <span className="settings-hint">{min}–{max}</span>}
      </div>
    </div>
  if (!active) return null
  const statusClass = saving ? 'settings-status-saving' : dirty ? 'settings-status-dirty' : message ? 'settings-status-saved' : ''
  return <div className="settings-browser" data-testid="settings-ready">
    <header className="dashboard-heading"><div><div className="heading-eyebrow">MANAGEMENT / SETTINGS</div>
      <h1>{tr("服务设置")}</h1><p>{tr("调整本机推理与模型刷新，保存后生效。")}</p></div>
      <Badge tone={summary.settings.enabled ? 'success' : 'warning'}>{summary.settings.enabled ? tr("推理服务已启用") : tr("推理服务已暂停")}</Badge>
    </header>
    <Card className="settings-card"><div className="settings-field">
      <label htmlFor="interface-language"><strong>Language / 语言</strong><small>{language === 'en' ? 'Saved on this device. Changing language reloads the console.' : '保存在此设备上。切换语言会重新加载控制台。'}</small></label>
      <select id="interface-language" value={language} disabled={saving} onChange={event => {
        if (dirty && !window.confirm(language === 'en' ? 'Changing language will discard unsaved form changes. Continue?' : '切换语言会丢弃尚未保存的表单修改。继续吗？')) return
        try { saveLanguage(event.target.value); window.location.reload() }
        catch { setError(language === 'en' ? 'Could not save language preference. Allow local storage and try again.' : '无法保存语言偏好。请允许本地存储后重试。') }
      }}><option value="en">English</option><option value="zh">中文（简体）</option></select>
    </div></Card>
    <form onSubmit={event => { void submit(event) }} noValidate>
      <fieldset disabled={saving} className="settings-fieldset">
        <Card className="settings-card"><div className="settings-card-heading"><Settings2 size={16} /><div><h2>{tr("推理与模型")}</h2><p>{tr("控制客户端调用与模型展示。")}</p></div></div>
          {toggle('enabled', tr("启用推理服务"), tr("关闭后暂停 API 推理，管理页面仍可访问。"))}
          {toggle('exposeRegionModels', tr("显示地区受限模型"), tr("保留受当前出口地区限制的模型供客户端选择。"))}
          {toggle('hideFreeModels', visibility.hideFree, tr("仅从选择器和 API 模型清单隐藏，保留历史模型调用。"))}
          {toggle('hideEacModels', visibility.hideEac, tr("保留授权和历史模型调用，可随时恢复显示。"))}
          {toggle('streamRecovery', tr("自动恢复断流"), tr("允许从已生成的检查点继续回答。"))}
          {numeric('defaultMaxTokens', tr("单次最大输出 Token"), tr("512–131072，实际输出还受模型能力限制。"), 512, 131072)}
        </Card>
        <Card className="settings-card"><div className="settings-card-heading"><RefreshCw size={16} /><div><h2>{tr("模型刷新")}</h2><p>{tr("管理模型清单的周期更新与探测。")}</p></div></div>
          {numeric('probeIntervalMinutes', tr("刷新间隔（分钟）"), tr("1–1440 分钟，保存后重新安排下一轮。"), 1, 1440)}
          {toggle('standaloneProbe', tr("自动探测可用性"), tr("周期刷新时发送探测请求，消耗上游额度；遇到限流会自动退避。"))}
          <p className="settings-note" role="note"><CircleAlert size={15} /><span>{summary.automaticRefresh
            ? tr("自动刷新已启用，保存间隔后会重新安排下一轮。")
            : tr("当前以 --no-refresh 启动。设置会保存，但自动任务保持暂停；手动刷新仍可用。")}</span></p>
        </Card>
        <div className="settings-footer"><span role="status" aria-live="polite" className={statusClass}><span className="settings-status-dot" aria-hidden="true" />{saving ? tr("正在保存，请稍候…") : dirty ? tr("有尚未保存的修改") : message || tr("当前设置已同步")}</span>
          <div className="settings-actions"><Button variant="outline" disabled={!dirty || saving} onClick={() => {
            setState(previous => ({ ...previous, draft: settingsDraft(previous.saved) }))
            setErrors({}); setError(''); setMessage('')
          }}><RotateCcw size={15} />{tr("撤销修改")}</Button>
            <Button type="submit" disabled={!dirty || saving}>{saving ? <LoaderCircle size={15} className="spinning" /> : message && !dirty ? <Check size={15} /> : <Save size={15} />}{saving ? tr("正在保存") : tr("保存设置")}</Button></div>
        </div>
      </fieldset>
      {error && <p className="settings-save-error" role="alert"><CircleAlert size={16} /><span>{error}</span></p>}
    </form>
    <p className="footnote">{tr("配置保存在当前独立服务的数据目录中。页面读取和保存设置不会直接发送模型推理请求。")}</p>
  </div>
}
