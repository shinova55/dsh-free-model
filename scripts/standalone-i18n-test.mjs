import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { DISCLAIMER } from '../src/disclaimer.js'
import { SPONSOR } from '../src/sponsor.js'
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

// Protect newer screens from silently bypassing English after an upstream sync.
const frontend = new URL('../packages/standalone/frontend/', import.meta.url)
for (const file of ['agents.tsx', 'providers.tsx', 'routing.tsx', 'library.tsx', 'workspace.tsx', 'desktop-update.tsx', 'management.ts', 'components/workbench-dialog.tsx', 'components/disclaimer-dialog.tsx']) {
  const source = fs.readFileSync(new URL(file, frontend), 'utf8')
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const walk = node => {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'tr' && ts.isStringLiteral(node.arguments[0])) {
      assert.ok(Object.hasOwn(english, node.arguments[0].text), `${file}: missing translation for ${node.arguments[0].text}`)
    }
    if ((ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[\u3400-\u9fff]/.test(node.text)) {
      assert.ok(ts.isCallExpression(node.parent) && node.parent.expression.getText(tree) === 'tr', `${file}: untranslated UI literal ${node.text}`)
    }
    ts.forEachChild(node, walk)
  }
  walk(tree)
}
for (const text of [DISCLAIMER.title, DISCLAIMER.subtitle, DISCLAIMER.intro, DISCLAIMER.accept,
  ...DISCLAIMER.sections.flatMap(section => [section.heading, section.body]), SPONSOR.title, SPONSOR.greeting, ...SPONSOR.paragraphs]) {
  assert.ok(Object.hasOwn(english, text), `Missing shared-copy translation: ${text}`)
}
console.log('i18n: new workbench screens and shared notices have complete translation coverage')
