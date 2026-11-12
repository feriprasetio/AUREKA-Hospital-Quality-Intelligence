import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Penjaga: komponen/lib yang tidak dipakai di mana pun membuat UI lama gampang "hidup lagi".
// Setiap file di components/ dan lib/ harus terjangkau dari app/layout.tsx atau app/page.tsx.
const root = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'))
const ALLOWED_UNUSED = new Set(['lib/aureka/csv-export.ts', 'lib/aureka/navigation-search.ts'])
const exts = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']

function walk(dir) {
  const out = []
  for (const name of readdirSync(join(root, dir))) {
    const rel = dir + '/' + name
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel))
    else if (/\.(tsx?|mjs|js)$/.test(name)) out.push(rel)
  }
  return out
}
function resolve(from, spec) {
  let base
  if (spec.startsWith('@/')) base = spec.slice(2)
  else if (spec.startsWith('.')) base = relative(root, join(root, dirname(from), spec))
  else return null
  for (const e of exts) if (existsSync(join(root, base + e)) && statSync(join(root, base + e)).isFile()) return (base + e).replace(/\\/g, '/')
  return null
}

test('tidak ada komponen atau modul lib yang mati (tidak diimpor dari aplikasi)', () => {
  const all = [...walk('app'), ...walk('components'), ...walk('lib')]
  const used = new Set(['app/layout.tsx', 'app/page.tsx'])
  const queue = [...used]
  const re = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g
  while (queue.length) {
    const f = queue.pop()
    const src = readFileSync(join(root, f), 'utf8')
    for (const m of src.matchAll(re)) {
      const r = resolve(f, m[1])
      if (r && !used.has(r)) { used.add(r); queue.push(r) }
    }
  }
  const dead = all.filter((f) => (f.startsWith('components/') || f.startsWith('lib/')) && !used.has(f) && !ALLOWED_UNUSED.has(f))
  assert.deepEqual(dead, [], 'Hapus file yang tidak dipakai (atau impor bila memang dibutuhkan): ' + dead.join(', '))
})
