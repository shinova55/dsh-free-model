import { tr, locale } from '../i18n.mjs'
import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, ArrowUpRight, Boxes, Check, CircleCheck, Copy, Handshake, Layers3, Network, RefreshCw, Terminal, Zap } from 'lucide-react'
import { Badge, Button, Card } from './ui'
import '../usage.css'
import type { Host, Snapshot } from '../types'

const number = (value: number) => new Intl.NumberFormat(locale).format(value)
const compact = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : number(value)

export function Overview({ summary, stats, host }: Snapshot & { host: Host }) {
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  const metricRows = [
    { name: tr("可接入模型"), value: number(summary.catalog.filter(model => model.routable).length), icon: Boxes, detail: tr("当前公开的模型清单") },
    { name: tr("用户回合"), value: number(stats.turns), icon: Layers3, detail: tr("{0} 次物理请求", number(stats.requests)) },
    { name: tr("累计 Token"), value: compact(stats.grand.input + stats.grand.output), icon: Zap, detail: tr("输入 {0} · 输出 {1}", compact(stats.grand.input), compact(stats.grand.output)) },
    { name: tr("已恢复回合"), value: number(stats.recoveredTurns), icon: Activity, detail: tr("最终未完成 {0} 回合", number(stats.failedTurns)) },
  ]
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, index) => {
    const at = new Date(today); at.setDate(at.getDate() - 6 + index)
    const id = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
    return { id, value: stats.days.find(row => row.day === id)?.total ?? 0 }
  })
  const total = days.reduce((sum, row) => sum + row.value, 0)
  const max = Math.max(1, ...days.map(row => row.value))
  const failures = [...stats.samples].reverse().filter(row => row.ok === false).slice(0, 4)
  const sources = [
    { name: tr("匿名与 Kilo"), sub: tr("无需账号的免费模型"), icon: Zap, count: summary.catalog.filter(row => row.channel === 'anonymous' || row.channel === 'kilo').length, page: 'models' as const },
    { name: tr("免费账号渠道"), sub: tr("13 个供应商，独立账号池"), icon: Network, count: summary.catalog.filter(row => !['anonymous', 'kilo', 'eac'].includes(row.channel)).length, page: 'channels' as const },
    { name: tr("EAC 协付渠道"), sub: summary.eacAuth?.local ? tr("已保存本机授权") : tr("尚未保存本机授权"), icon: Handshake, count: summary.catalog.filter(row => row.channel === 'eac').length, page: 'eac' as const },
  ]

  const copyEndpoint = () => {
    void host.copy(`${summary.baseUrl}/v1`).then(() => {
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    }).catch(host.error)
  }

  return <div className="dashboard" data-testid="overview-ready">
    <header className="dashboard-heading"><div><div className="heading-eyebrow">WORKSPACE / OVERVIEW</div><h1>{tr("工作空间概览")}</h1><p>{tr("查看你的模型连接与运行情况。")}</p></div>
      <Button variant="outline" disabled={refreshing} onClick={() => {
        setRefreshing(true); void host.refresh().catch(host.error).finally(() => setRefreshing(false))
      }}><RefreshCw size={15} className={refreshing ? 'spinning' : ''} />{refreshing ? tr("正在更新") : tr("更新状态")}</Button></header>

    <div className="dashboard-metrics">{metricRows.map(metric => <Card className="dashboard-metric ov-metric" key={metric.name}>
      <div><span>{metric.name}</span><div className="ov-metric-icon"><metric.icon size={17} /></div></div>
      <strong>{metric.value}</strong><p>{metric.detail}</p>
    </Card>)}</div>

    <div className="dashboard-main-grid">
      <Card className="usage-panel ov-chart-panel">
        <div className="card-heading"><div><h2>{tr("Token 用量")}</h2><p>{tr("最近 7 天的输入与输出")}</p></div><Badge>{tr("最近 7 天")}</Badge></div>
        <div className="usage-total ov-chart-total">{compact(total)} <span>Token</span></div>
        <div className="dashboard-chart ov-chart" role="img" aria-label={tr("最近七天 Token 用量：{0}", days.map(day => `${day.id} ${day.value}`).join('；'))}>
          <div className="chart-grid-lines"><span /><span /><span /><span /></div>
          {days.map(day => <div className="dashboard-chart-column ov-chart-col" key={day.id} title={`${day.id} · ${number(day.value)} Token`}>
            <div className={`dashboard-chart-bar ${day.value === 0 ? 'zero' : ''}`} style={{ height: `${Math.max(2, day.value / max * 80)}%` }} />
            <span>{day.id.slice(5).replace('-', '/')}</span>
          </div>)}
          {total === 0 && <div className="chart-empty ov-chart-empty"><Activity size={22} /><span>{tr("还没有调用记录")}</span><small>{tr("接入客户端后，用量会显示在这里")}</small></div>}
        </div>
        <div className="card-foot"><span>{tr("按实际请求记录统计")}</span><button onClick={() => host.navigate('usage')}>{tr("查看全部用量")}<ArrowRight size={14} /></button></div>
      </Card>

      <Card className="quick-connect ov-quick">
        <div className="quick-icon ov-quick-icon"><Terminal size={20} /></div>
        <h2>{tr("API 接入")}</h2><p>{tr("OpenAI 兼容 · Chat Completions / Responses")}</p>
        <label>API BASE URL</label>
        <div className="quick-endpoint ov-endpoint"><code>{summary.baseUrl}/v1</code>
          <Button variant="ghost" aria-label={tr("复制 API 地址")} onClick={copyEndpoint} title={tr("复制 API 地址")}
            className={copied ? 'ov-copied' : ''}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </Button>
        </div>
        {copied && <span className="copy-feedback" role="status">{tr("地址已复制")}</span>}
        <div className="connect-steps"><span>{tr("管理会话：本机独立会话")}</span><span>{tr("推理鉴权：Bearer API Key")}</span><span>{tr("监听范围：仅回环地址")}</span></div>
        <Button className="connect-button" onClick={() => host.navigate('connection')}>{tr("查看接入配置")}<ArrowUpRight size={16} /></Button>
        <div className="connection-footnote"><span className={`status-dot ${summary.settings.enabled ? '' : 'paused'}`} />{summary.settings.enabled ? tr("推理服务已启用") : tr("推理服务已暂停")}</div>
      </Card>
    </div>

    <div className="dashboard-bottom-grid">
      <Card className="ov-sources">
        <div className="card-heading"><div><h2>{tr("模型来源")}</h2><p>{tr("所有渠道，共用一个接入地址")}</p></div><Network size={18} /></div>
        <div className="source-list ov-source-list">{sources.map((source, index) => <button className="source-row ov-source-row" key={source.name} onClick={() => host.navigate(source.page)}
          style={{ animationDelay: `${index * 60}ms` }}>
          <span className="source-icon"><source.icon size={18} /></span>
          <span><strong>{source.name}</strong><small>{source.sub}</small></span>
          <Badge>{source.count} {tr("个模型")}</Badge><ArrowRight size={14} />
        </button>)}</div>
      </Card>

      <Card className="ov-failures">
        <div className="card-heading"><div><h2>{tr("运行检查")}</h2><p>{tr("服务与最近的失败请求")}</p></div>
          <Badge tone={failures.length ? 'warning' : 'success'}>{failures.length ? tr("有失败记录") : tr("暂无失败记录")}</Badge></div>
        <div className="runtime-check"><CircleCheck size={17} /><span>{tr("渠道模块")}</span><strong>{summary.channels.state === 'ready' ? tr("已就绪") : summary.channels.state === 'failed' ? tr("加载失败") : tr("初始化中")}</strong></div>
        <div className="runtime-check"><RefreshCw size={17} /><span>{tr("模型自动刷新")}</span><strong>{summary.automaticRefresh ? tr("每 {0} 分钟", summary.settings.probeIntervalMinutes) : tr("已暂停")}</strong></div>
        {failures.length ? <div className="failure-list ov-failure-list">{failures.map((row, index) =>
          <div key={`${row.at}-${index}`} className="ov-failure-row">
            <span>{row.model ?? tr("未知模型")}</span>
            <small>{row.at ? new Date(row.at).toLocaleTimeString(locale) : tr("时间未知")} {tr("· 请求未完成")}</small>
          </div>)}</div>
          : <div className="runtime-empty ov-runtime-empty"><CircleCheck size={18} /><span>{tr("最近的请求样本中没有失败记录")}</span></div>}
        <div className="card-foot"><span title={summary.dataDir}>{tr("数据仅保存在本机独立目录")}</span><button onClick={() => host.navigate('settings')}>{tr("服务设置")}<ArrowRight size={14} /></button></div>
      </Card>
    </div>
  </div>
}
