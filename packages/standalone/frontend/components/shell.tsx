import { tr } from '../i18n.mjs'
import { Coffee, Activity, Boxes, Cable, ChevronRight, Handshake, LayoutDashboard, LogOut, Moon, Network, Settings2, ShieldCheck, Sun, Monitor, PanelsTopLeft, LibraryBig, Route, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import brandMark from '../../../../icon.svg?inline'
import { Badge, Button } from './ui'
import type { Host, Page, Summary } from '../types'
import { hasDesktopBridge } from '../desktop-update'

const navigation = [
  { label: tr("工作空间"), items: [
    { id: 'overview', name: tr("概览"), icon: LayoutDashboard },
    { id: 'workspace', name: tr("模型工作台"), icon: PanelsTopLeft },
    { id: 'agents', name: tr("客户端与订阅"), icon: Monitor },
    { id: 'models', name: tr("模型清单"), icon: Boxes },
    { id: 'usage', name: tr("用量统计"), icon: Activity },
    { id: 'library', name: tr("资源库"), icon: LibraryBig },
  ] },
  { label: tr("渠道与连接"), items: [
    { id: 'providers', name: tr("聚合渠道"), icon: PanelsTopLeft },
    { id: 'routing', name: tr("路由组"), icon: Route },
    { id: 'channels', name: 'EAC router', icon: Network },
    { id: 'eac', name: tr("EAC 协付渠道"), icon: Handshake },
    { id: 'connection', name: tr("API 接入"), icon: Cable },
  ] },
  { label: tr("管理"), items: [{ id: 'settings', name: tr("服务设置"), icon: Settings2 }, { id: 'updates', name: tr("应用更新"), icon: RotateCw }] },
  { label: tr("项目支持"), items: [{ id: 'sponsor', name: tr("来自赞助商的广告"), icon: Coffee }] },
] as const

type Origin = { x: number; y: number }

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const apply = (next: 'light' | 'dark') => {
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('ofm-theme', next) } catch { /* 存储不可用时仅本次会话生效 */ }
    setTheme(next)
  }
  const toggle = (origin?: Origin) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    // 没有 View Transition、或用户要求减少动效时直接切换，不做扩散。
    if (!origin || typeof document.startViewTransition !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(next); return }
    const root = document.documentElement
    // 半径取按钮中心到视口最远角的距离，保证圆盘一定盖满整屏。
    const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))
    root.style.setProperty('--theme-reveal-x', `${origin.x}px`)
    root.style.setProperty('--theme-reveal-y', `${origin.y}px`)
    root.style.setProperty('--theme-reveal-r', `${radius}px`)
    // 扩散期间关掉 300ms 的底色过渡，否则"新主题"快照会抓到过渡中间色。
    root.classList.add('theme-transitioning')
    const transition = document.startViewTransition(() => { flushSync(() => apply(next)) })
    const finish = () => {
      root.classList.remove('theme-transitioning')
      root.style.removeProperty('--theme-reveal-x')
      root.style.removeProperty('--theme-reveal-y')
      root.style.removeProperty('--theme-reveal-r')
    }
    transition.finished.then(finish, finish)
  }
  return { theme, toggle }
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? tr("切换到浅色主题") : tr("切换到深色主题")
  return <Button variant="ghost" className="theme-toggle" aria-label={label} title={theme === 'dark' ? tr("浅色") : tr("深色")}
    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); toggle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) }}>
    <span className="theme-toggle-track" data-theme={theme}>
      <span className="theme-toggle-icon theme-toggle-sun" aria-hidden="true"><Sun size={16} /></span>
      <span className="theme-toggle-icon theme-toggle-moon" aria-hidden="true"><Moon size={16} /></span>
    </span>
  </Button>
}

export const pageNames: Record<Page, string> = {
  overview: tr("概览"), workspace: tr("模型工作台"), models: tr("模型清单"), usage: tr("用量统计"), channels: 'EAC router',
  agents: tr("客户端与订阅"), providers: tr("聚合渠道"), library: tr("资源库"), routing: tr("路由组"),
  eac: tr("EAC 协付渠道"), settings: tr("服务设置"), updates: tr("应用更新"), connection: tr("API 接入"), sponsor: tr("来自赞助商的广告"),
}

export function Sidebar({ page, summary, host, onDisclaimer }: { page: Page; summary?: Summary; host: Host; onDisclaimer(): void }) {
  return <>
    <a className="console-brand" href="/" aria-label={tr("Our Free Model 首页")}>
      <img className="console-mark" src={brandMark} alt="" width={34} height={36} />
      <span>Our Free Model<small>{tr("本地模型工作台")}</small></span>
    </a>
    <div className="workspace-switch"><span className="workspace-avatar"><ShieldCheck size={17} /></span>
      <span>{tr("个人工作空间")}<small>{tr("独立本地服务")}</small></span><Badge>{tr("本机")}</Badge>
    </div>
    <nav className="console-nav" aria-label={tr("管理导航")}>{navigation.map(group => <div className="nav-group" key={group.label}>
      <span className="nav-group-label">{group.label}</span>
      {group.items.filter(item => item.id !== 'updates' || hasDesktopBridge()).map(item => <button key={item.id} id={item.id === 'sponsor' ? 'ofm-sponsor-menu-desktop' : undefined} className={`console-nav-item ${item.id === 'sponsor' ? 'ofm-sponsor-nav' : ''} ${page === item.id ? 'selected' : ''}`}
        aria-current={page === item.id ? 'page' : undefined} onClick={() => host.navigate(item.id)}>
        <span className="console-nav-indicator" aria-hidden="true" />
        <item.icon size={18} strokeWidth={1.7} /><span>{item.name}</span>
        {item.id === 'models' && <span className="count-badge">{summary?.catalog.length ?? '—'}</span>}
      </button>)}
    </div>)}</nav>
    <div className="sidebar-support"><ShieldCheck size={17} /><div><strong>{tr("独立本地存储")}</strong><p>{tr("本机运行 / 仅监听回环地址")}</p></div></div>
    <div className="console-sidebar-footer"><div><span className="status-dot" />{tr("本地服务在线")}<small>v{summary?.version ?? '—'}</small></div>
      <ThemeToggle /><Button variant="ghost" aria-label={tr("退出管理")} title={tr("退出管理")} onClick={() => { void host.logout().catch(host.error) }}><LogOut size={16} /></Button></div>
    <button type="button" className="sidebar-disclaimer" onClick={onDisclaimer}>{tr("使用须知与免责声明")}</button>
  </>
}
export function Topbar({ page, summary }: { page: Page; summary?: Summary }) {
  return <><div className="console-breadcrumb"><span>{tr("工作空间")}</span><ChevronRight size={14} /><strong key={page} className="console-breadcrumb-current">{pageNames[page]}</strong></div>
    <div className="console-topbar-status"><span className="status-dot" /><span>{summary?.settings.enabled === false ? tr("推理已暂停") : tr("本地服务")}</span><span className="topbar-divider" /><span>LOCAL</span></div></>
}
