import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Read-only reconciliation of a versioned GitHub migration directory against
 * a supplied Supabase migration-ledger export. Never executes database SQL.
 * A same-name/different-version match is a candidate, not proof of SQL equality.
 */
export function parseRepoMigrations(filenames) {
  return filenames.filter(name => name.endsWith('.sql')).map(filename => {
    const match = /^(\d{14})_([A-Za-z0-9_-]+)\.sql$/.exec(filename)
    if (!match) throw new Error('Invalid migration filename: ' + filename)
    return { version: match[1], name: match[2], filename }
  })
}

export function reconcileMigrations(repoMigrations, deployedMigrations) {
  const repoVersions = new Map()
  const repoNames = new Map()
  for (const entry of repoMigrations) {
    if (repoVersions.has(entry.version)) {
      throw new Error('Duplicate repository migration version: ' + entry.version)
    }
    repoVersions.set(entry.version, entry)
    repoNames.set(entry.name, [...(repoNames.get(entry.name) || []), entry])
  }
  const productionVersions = new Set()
  const productionNames = new Map()
  for (const entry of deployedMigrations) {
    if (!/^\d{14}$/.test(entry.version) || !entry.name) throw new Error('Invalid deployed migration entry')
    if (productionVersions.has(entry.version)) throw new Error('Duplicate deployed version: ' + entry.version)
    productionVersions.add(entry.version)
    productionNames.set(entry.name, (productionNames.get(entry.name) || 0) + 1)
  }
  const mappedRepo = new Set()
  const result = { exact: [], renamedVersionCandidates: [], ambiguous: [], versionConflicts: [], productionOnly: [], repositoryOnly: [] }
  for (const entry of deployedMigrations) {
    const versionMatch = repoVersions.get(entry.version)
    if (versionMatch) {
      mappedRepo.add(versionMatch.version)
      if (versionMatch.name === entry.name) result.exact.push({ production: entry, repository: versionMatch })
      else result.versionConflicts.push({ production: entry, repository: versionMatch })
      continue
    }
    const nameMatches = repoNames.get(entry.name) || []
    if (nameMatches.length === 1 && productionNames.get(entry.name) === 1) {
      const file = nameMatches[0]
      mappedRepo.add(file.version)
      result.renamedVersionCandidates.push({ production: entry, repository: file })
    } else if (nameMatches.length > 0) {
      result.ambiguous.push({ production: entry, candidates: nameMatches })
    } else {
      result.productionOnly.push(entry)
    }
  }
  result.repositoryOnly = repoMigrations.filter(entry => !mappedRepo.has(entry.version))
  return { summary: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value.length])), ...result }
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (invoked) {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Usage: node scripts/audit-supabase-migration-ledger.mjs <migrations.json>')
    console.error('Input: { "migrations": [{ "version": "YYYYMMDDHHMMSS", "name": "slug" }] }')
    process.exitCode = 2
  } else {
    try {
      const payload = JSON.parse(readFileSync(inputPath, 'utf8'))
      const ledger = Array.isArray(payload) ? payload : payload.migrations
      if (!Array.isArray(ledger)) throw new Error('JSON must contain a migrations array')
      const directory = new URL('../supabase/migrations/', import.meta.url)
      const result = reconcileMigrations(parseRepoMigrations(readdirSync(directory)), ledger)
      console.log(JSON.stringify(result, null, 2))
      // Intentionally return nonzero on unresolved drift; never auto-mark migrations applied.
      if (result.summary.ambiguous || result.summary.versionConflicts ||
          result.summary.productionOnly || result.summary.repositoryOnly ||
          result.summary.renamedVersionCandidates) process.exitCode = 1
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 2
    }
  }
}
