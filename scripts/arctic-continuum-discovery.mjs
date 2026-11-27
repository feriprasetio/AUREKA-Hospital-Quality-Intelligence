// Gate 0 read-only source inventory. Candidate matches, not a permission or runtime proof.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function scanSource(source) {
  const patterns = {
    rpc: /\.rpc\s*\(\s*(['"`])([\w.:-]+)\1/g,
    schema: /\.schema\s*\(\s*(['"`])([\w.:-]+)\1/g,
    relation: /\.from\s*\(\s*(['"`])([\w.:-]+)\1/g,
    edgeFunction: /\.invoke\s*\(\s*(['"`])([\w.:-]+)\1/g,
    capability: /\b(?:hasPermission|canAccess|canPerform)\s*\(\s*(['"`])([\w.:-]+)\1/g,
    namedOperation: /\b(?:function|const)\s+()((?:handle|save|export|import|download|delete|remove|submit|validate|load|fetch|sign|approve|reject|review|publish|reset|update|create)[A-Z]\w*)/g,
    sqlObject: /\b(?:create\s+(?:or\s+replace\s+)?(?:table|view|function|policy|trigger)|alter\s+table)\s+(?:if\s+not\s+exists\s+)?()([\w."]+)/gi,
    cssImport: /@import\s+(['"])([\w./-]+)\1/g,
  }
  const matches = []
  for (const [kind, pattern] of Object.entries(patterns)) {
    for (const match of source.matchAll(pattern)) {
      matches.push({ kind, symbol: match[2], line: source.slice(0, match.index).split('\n').length })
    }
  }
  return matches.sort((a,b) => a.line-b.line || a.kind.localeCompare(b.kind))
}

export function inventory(root) {
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024})
  const commit = git('rev-parse', 'HEAD').trim()
  const tracked = git('ls-files', '-z').split('\0').filter(Boolean)
  const candidates = tracked.filter(p => /^(app|components|lib|supabase|scripts|tests|\.github\/workflows)\//.test(p) && /\.(tsx?|[cm]?js|sql|css|ya?ml|toml)$/.test(p))
  const entries = candidates.map(path => {
    try {
      const source = readFileSync(resolve(root, path), 'utf8')
      return {path, lines: source.split('\n').length, matches: scanSource(source)}
    } catch (error) {
      return {path, status: 'unreadable', error: error.code ?? 'READ_ERROR'}
    }
  })
  return {commit, trackedCount: tracked.length, candidates: entries.length, unreadable: entries.filter(x => x.status === 'unreadable').length, coverage: 'heuristic static candidates only; dynamic calls, guards, SQL semantics and runtime require review', entries}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inventory(process.cwd())
  console.log(JSON.stringify(result, null, 2))
  if (result.unreadable) process.exitCode = 1
}
