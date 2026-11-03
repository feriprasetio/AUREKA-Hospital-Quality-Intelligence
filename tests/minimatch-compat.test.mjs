import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Minimatch } from 'minimatch'
import { readdirGlob } from 'readdir-glob'

test('Minimatch 11 preserves the options used by readdir-glob', () => {
  const matcher = new Minimatch('**/*.xlsx', {
    dot: false,
    noglobstar: false,
    matchBase: false,
    nocase: false,
  })

  assert.equal(matcher.match('imports/indicator.xlsx'), true)
  assert.equal(matcher.match('imports/indicator.csv'), false)
  assert.equal(matcher.match('imports/.hidden.xlsx'), false)
})

test('readdir-glob enumerates workbook files with the overridden Minimatch version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aureka-minimatch-compat-'))

  try {
    await mkdir(join(root, 'imports'))
    await writeFile(join(root, 'imports', 'indicator.xlsx'), 'synthetic workbook')
    await writeFile(join(root, 'imports', 'notes.txt'), 'not a workbook')
    await mkdir(join(root, '.hidden'))
    await writeFile(join(root, '.hidden', 'ignored.xlsx'), 'hidden workbook')

    const matches = await new Promise((resolve, reject) => {
      const found = []
      const scanner = readdirGlob(root, {
        pattern: '**/*.xlsx',
        dot: false,
        nodir: true,
      })
      scanner.on('match', item => found.push(item.relative))
      scanner.on('error', reject)
      scanner.on('end', () => resolve(found))
    })

    assert.deepEqual(matches.sort(), ['imports/indicator.xlsx'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
