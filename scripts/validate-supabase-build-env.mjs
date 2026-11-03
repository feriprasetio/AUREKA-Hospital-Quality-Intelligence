import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)

function readProductionProjectId(config) {
  const match = config.match(/^project_id\s*=\s*["']([^"']+)["']\s*$/m)
  if (!match) throw new Error('Could not read project_id from supabase/config.toml.')
  return match[1]
}

function readLegacyJwtRole(key) {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

export function validateSupabaseBuildConfiguration({ target, url, key, config }) {
  if (target !== 'preview' && target !== 'production') {
    throw new Error('AUREKA_BUILD_TARGET must be either preview or production.')
  }

  const prefix = target === 'preview' ? 'AUREKA_STAGING' : 'AUREKA_PRODUCTION'
  if (!url || !url.trim()) {
    throw new Error('Set ' + prefix + '_SUPABASE_URL in GitHub Actions Variables or Secrets.')
  }
  if (!key || !key.trim()) {
    throw new Error('Set ' + prefix + '_SUPABASE_PUBLISHABLE_KEY in GitHub Actions Variables or Secrets.')
  }
  if (url !== url.trim() || key !== key.trim()) {
    throw new Error('Supabase build configuration contains leading or trailing whitespace.')
  }

  let endpoint
  try {
    endpoint = new URL(url)
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.')
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash || (endpoint.pathname !== '/' && endpoint.pathname !== '')) {
    throw new Error('Supabase build URL must be an HTTPS project URL without credentials, path, query, or fragment.')
  }

  const productionProjectId = readProductionProjectId(config)
  const productionOrigin = 'https://' + productionProjectId + '.supabase.co'
  if (target === 'preview' && endpoint.origin === productionOrigin) {
    throw new Error('Preview build must use an isolated non-production Supabase project, not the production AUREKA project.')
  }
  if (target === 'production' && endpoint.origin !== productionOrigin) {
    throw new Error('Production build URL must match the project_id in supabase/config.toml.')
  }

  const isModernPublishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
  const legacyRole = readLegacyJwtRole(key)
  if (!isModernPublishable && legacyRole !== 'anon') {
    throw new Error('Use only an sb_publishable_ key or a legacy anon JWT; never an sb_secret_, service_role, or other server key.')
  }

  return {
    target,
    endpointHost: endpoint.host,
    productionProjectId
  }
}

function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

  // GitHub Actions masks values from subsequent log output, including build output.
  for (const value of [url, key]) {
    if (value) process.stdout.write('::add-mask::' + value + '\n')
  }

  try {
    const configPath = resolve(process.cwd(), 'supabase/config.toml')
    const config = readFileSync(configPath, 'utf8')
    const result = validateSupabaseBuildConfiguration({
      target: process.env.AUREKA_BUILD_TARGET,
      url,
      key,
      config
    })
    console.log('Supabase ' + result.target + ' configuration validated for ' + result.endpointHost + '. Credential values are masked.')
  } catch (error) {
    console.error('::error::' + (error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main()
}
