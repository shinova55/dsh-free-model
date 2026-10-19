import assert from 'node:assert/strict'
import fs from 'node:fs'
import { readLanguage, saveLanguage, translate, LANGUAGE_KEY } from '../packages/standalone/frontend/i18n.mjs'
const english = JSON.parse(fs.readFileSync(new URL('../packages/standalone/frontend/en.json', import.meta.url)))
const placeholders = value => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort()
for (const [source, target] of Object.entries(english)) {
  assert.equal(typeof target, 'string')
  assert.deepEqual(placeholders(target), placeholders(source), source)
  assert.ok(!/[\u3400-\u9fff]/.test(target), source)
  assert.equal(translate(source, 'zh'), source)
}
const saved = new Map([['ofm-theme', 'dark'], ['unrelated', 'keep']])
const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }
assert.equal(readLanguage(storage), 'zh')
saveLanguage('en', storage)
assert.equal(readLanguage(storage), 'en')
assert.deepEqual([...saved], [['ofm-theme', 'dark'], ['unrelated', 'keep'], [LANGUAGE_KEY, 'en']])
assert.throws(() => saveLanguage('invalid', storage))
assert.equal(readLanguage({ getItem() { throw Error('blocked') } }), 'zh')
assert.throws(() => saveLanguage('en', { setItem() { throw Error('blocked') } }))
assert.equal(translate('复制 {0}', 'en', ['{1}<b>model</b>']), 'Copy {1}<b>model</b>')
assert.equal(translate('external error: model/123', 'en'), 'external error: model/123')
for (const message of ['constructor', 'toString', '__proto__']) assert.equal(translate(message, 'en'), message)
console.log(`i18n: ${Object.keys(english).length} translations, placeholder parity, fallback, persistence, storage isolation passed`)
