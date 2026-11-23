/**
 * Confirm that both the CSS and the browser-delivered JavaScript contain the
 * contrast fix. Passing source-code unit tests alone does not guarantee the
 * static GitHub Pages artifact contains the patch.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = 'out'
const assets = join(root, '_next', 'static')
assert.ok(existsSync(assets), 'Production static export missing: ' + assets)

function collect(dir, extension, found = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) collect(path, extension, found)
    else if (name.endsWith(extension)) found.push(path)
  }
  return found
}

const cssFiles = collect(assets, '.css')
const jsFiles = collect(assets, '.js')
assert.ok(cssFiles.length, 'No generated CSS assets found')
assert.ok(jsFiles.length, 'No generated JavaScript assets found')

const css = cssFiles.map(path => readFileSync(path, 'utf8')).join('\n')
assert.ok(css.includes('aqImportChoicePrimary'), 'Missing component-specific contrast fallback in exported CSS')
assert.ok(css.includes('--aureka-action-fg'), 'Missing global Arktik contrast token in exported CSS')
assert.ok(css.includes('aqWorkbookChoices'), 'Missing import choice presentation styles in exported CSS')

const js = jsFiles.map(path => readFileSync(path, 'utf8')).join('\n')
assert.ok(js.includes('aqImportChoicePrimary'), 'Import choice control not found in shipped JavaScript')
assert.ok(js.includes('Workbook baku unit'), 'Workbook unit choice not found in shipped JavaScript')

console.log('Contrast export verified:', cssFiles.length, 'CSS assets and', jsFiles.length, 'JS assets')
