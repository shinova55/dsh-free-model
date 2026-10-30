import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
const directory = 'release-assets'
// Keep checksum filenames identical to GitHub's downloaded asset names.
for (const name of fs.readdirSync(directory)) {
  if (name.includes(' ')) fs.renameSync(path.join(directory, name), path.join(directory, name.replaceAll(' ', '.')))
}
const version = name => JSON.parse(fs.readFileSync(name, 'utf8')).version
const names = fs.readdirSync(directory).filter(name => /\.(exe|tgz|png)$/.test(name)).sort()
if (names.filter(name => name.endsWith('.exe')).length !== 1 || names.filter(name => name.endsWith('.tgz')).length !== 1 || !names.includes('english-settings.png')) throw new Error('Required release assets are missing')
const checksums = names.map(name => `${createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex')}  ${name}`).join('\n') + '\n'
fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), checksums)
const run = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
fs.writeFileSync(path.join(directory, 'RELEASE-VERIFICATION.md'), `# English UI update\n\nFixes English display on clients/subscriptions, providers, routing groups, library, desktop updates, workspace controls, disclaimer and sponsor text. The embedded model workbench now receives the selected console language.\n\n# Fork release verification\n\n- Source commit: ${process.env.GITHUB_SHA}\n- Build log: ${run}\n- Runtime: Node ${process.version}, ${process.platform}/${process.arch}\n- Plugin: ${version('package.json')}; desktop: ${version('packages/desktop/package.json')}; standalone: ${version('packages/standalone/package.json')} with fork localization\n\n## Passed before packaging\n\n- Standalone TypeScript check and UI build\n- Existing manifest integrity check\n- Contributor regression suite\n- Chinese React UI browser regression\n- English localization browser regression, including new workbench pages/dialogs, embedded-engine locale handoff, and persisted language selection\n- Windows NSIS build\n- Plugin archive packaging\n\n## Limitations\n\nThe installer is unsigned. Native installer GUI, real credentials, live providers and upgrade/rollback with user data were not manually tested. Browser screenshots use isolated fixture data. Native tray/startup dialogs, third-party plugin descriptions, provider messages, user-supplied text and text inside supplied images may retain their original language. The known upstream sponsor-animation test is not included. Existing upstream manifest verification does not certify this fork or the generated installer. No local user settings or credentials are included.\n\n## Asset hashes\n\n\`\`\`text\n${checksums}\`\`\`\n`)
