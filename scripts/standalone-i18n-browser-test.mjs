/** 使用真实构建资源和隔离接口，验证 React 应用的跨页面状态及会话边界。 */
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createManagement } from '../packages/standalone/management.mjs'
import { buildStats } from '../src/core/stats.js'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.OFM_PLAYWRIGHT_MODULE ?? 'playwright')
const management = createManagement({ stores: { settings: { get: () => ({ forwardKey: 'isolated' }) } }, info: () => ({}) })
const server = http.createServer((req, res) => { void management.handleRequest(req, res) })
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const baseUrl = `http://127.0.0.1:${server.address().port}`
management.setPort(server.address().port)
const browser = await chromium.launch({ headless: true })
const settings = { enabled: true, exposeRegionModels: true, streamRecovery: true, standaloneProbe: false, defaultMaxTokens: 32768, probeIntervalMinutes: 15 }
let loggedIn = false, key = 'ofm-ui-isolated-key', summaryReads = 0
const summary = () => ({ version: 'test', baseUrl, dataDir: 'isolated', networkMode: 'fixture', automaticRefresh: false,
  catalogSyncedAt: 0, settings: { ...settings }, channels: { state: 'ready' }, eacAuth: { local: false },
  catalog: [{ id: 'fixture/model', name: 'Fixture model', channel: 'anonymous', routable: true, availability: 'available' }] })
const errors = []
try {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  // The sponsor notice has its own UI suite; keep these page-flow tests deterministic.
  await context.addInitScript(() => { const now = new Date(); localStorage.setItem('ofm.sponsor.last-shown.v1', now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0')) })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/api/management/**', async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname.replace('/api/management', '')
    const body = request.postDataJSON()
    const answer = (value, status = 200) => route.fulfill({ status, json: value })
    if (endpoint === '/session') { loggedIn = body.key === key || body.bootstrapToken === 'test'; return answer(loggedIn ? { ok: true } : { error: '登录令牌无效' }, loggedIn ? 200 : 401) }
    if (!loggedIn) return answer({ error: '管理会话已失效，请重新登录' }, 401)
    if (endpoint === '/summary') { summaryReads++; return answer(summary()) }
    if (endpoint === '/stats') return answer(buildStats({}, []))
    if (endpoint === '/settings') { Object.assign(settings, body); return answer({ settings }) }
    if (endpoint === '/key') return answer({ key })
    if (endpoint === '/key/rotate') { key = 'ofm-ui-rotated-key'; return answer({ key }) }
    if (endpoint === '/logout') { loggedIn = false; return answer({ ok: true }) }
    if (endpoint === '/eac/status') return answer({ available: true, authorized: false, local: false, login: '' })
    if (endpoint === '/eac/pool') return answer({ inflight: 0, pool: 100, active24h: 0 })
    if (endpoint === '/channels/rpc') {
      const value = body.method === 'provider.status' ? { statuses: Object.fromEntries(body.payload.providers.map(id => [id, { accounts: { total: 0, enabled: 0 } }])) }
        : body.method === 'usage.autoCheckin' ? { autoCheckin: { enabled: false } }
          : body.method === 'usage.tokenLedger' ? { entries: [], channels: [], requests: [] }
          : body.method === 'usage.tokenLedgerHistory' ? { days: [] }
          : body.method === 'account.list' ? { accounts: [] }
          : body.method === 'model.list' ? { models: [] }
          : body.method === 'credits.balances' ? { balances: [] } : {}
      return answer({ ok: true, value })
    }
    return answer({ ok: true })
  })
  const nav = async name => { await page.locator('.console-nav-item').filter({ hasText: name }).click() }
  const assertEnglish = async () => {
    const text = await page.locator('body').innerText()
    assert.ok(!/[\u3400-\u9fff]/.test(text.replace('Language / 语言', '').replace('中文（简体）', '')), text)
  }
  await page.goto(baseUrl)
  await page.evaluate(() => localStorage.setItem('ofm-language','en'))
  await page.goto(baseUrl + '/?language-test=1#login=test')
  await page.getByTestId('overview-ready').waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'en-US')
  for (const [name, ready] of [['Overview','overview-ready'], ['Model list','models-ready'], ['Usage dashboard','usage-ready'], ['API connection','connection-ready'], ['Service settings','settings-ready']]) {
    await nav(name); await page.getByTestId(ready).waitFor(); await assertEnglish()
    for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
      await page.setViewportSize(viewport)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflow at ${viewport.width}`)
    }
  }
  await page.setViewportSize({width:1280,height:900})
  await nav('Free account channels'); await page.getByLabel('Search channels', {exact:true}).waitFor()
  await assertEnglish()
  for (const name of ['Channel usage','Request logs','Providers and backups']) {
    await page.getByRole('tab',{name,exact:true}).click(); await assertEnglish()
  }
  await nav('EAC shared-access channel'); await page.getByRole('heading',{name:'EAC shared-access channel',exact:true}).waitFor(); await assertEnglish()
  await nav('Service settings'); await page.getByTestId('settings-ready').waitFor()
  const screenshot = process.env.OFM_UI_SCREENSHOT_DIR
  if (screenshot) { fs.mkdirSync(screenshot,{recursive:true}); await page.screenshot({path:path.join(screenshot,'english-settings.png'),fullPage:true}) }
  await page.locator('#setting-defaultMaxTokens').fill('8192')
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('#interface-language').selectOption('zh')
  assert.equal(await page.locator('#setting-defaultMaxTokens').inputValue(),'8192')
  assert.equal(await page.locator('#interface-language').inputValue(),'en')
  await page.getByRole('button',{name:'Discard changes',exact:true}).click()
  await page.locator('#interface-language').selectOption('zh')
  await page.getByTestId('overview-ready').waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN')
  await nav('服务设置'); await page.locator('#interface-language').selectOption('en')
  await page.getByTestId('overview-ready').waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('ofm-language')),'en')
  // New page uses the saved preference without an initialization override.
  await context.clearCookies()
  const restarted = await context.newPage()
  await restarted.goto(baseUrl)
  await restarted.getByTestId('overview-ready').waitFor()
  assert.equal(await restarted.locator('html').getAttribute('lang'),'en-US')
  assert.equal(settings.defaultMaxTokens,32768,'Language changes must not save service settings')
  assert.equal(key,'ofm-ui-isolated-key','Language changes must not rotate credentials')
  assert.deepEqual(errors,[])
  console.log('English UI: all pages, channel tabs, viewport checks, bilingual switching, unsaved changes, persistence, credential isolation passed')
} finally {
  await browser.close(); management.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
}
