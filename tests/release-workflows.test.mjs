import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateSupabaseBuildConfiguration } from '../scripts/validate-supabase-build-env.mjs'

const preview = readFileSync('.github/workflows/preview-build.yml', 'utf8')
const production = readFileSync('.github/workflows/deploy-pages.yml', 'utf8')
const supabaseValidator = readFileSync('scripts/validate-supabase-build-env.mjs', 'utf8')

test('preview workflow installs exactly from the committed lockfile', () => {
  assert.match(preview, /run: npm ci/)
  assert.doesNotMatch(preview, /run: npm install/)
})

test('preview workflow uses a non-routable placeholder and does not depend on Supabase staging', () => {
  assert.match(preview, /AUREKA_BUILD_TARGET: preview/)
  assert.match(preview, /NEXT_PUBLIC_SUPABASE_URL: https:\/\/preview-disabled\.invalid/)
  assert.match(preview, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_preview_disabled/)
  assert.doesNotMatch(preview, /AUREKA_STAGING_SUPABASE_URL|AUREKA_STAGING_SUPABASE_PUBLISHABLE_KEY|ypsbvxnqdbjjhlhjerad|sb_publishable_tTgp/)
  assert.doesNotMatch(preview, /AUREKA_PRODUCTION_SUPABASE_URL|AUREKA_PRODUCTION_SUPABASE_PUBLISHABLE_KEY/)
})

test('preview validates its unavailable backend placeholder before creating a static build', () => {
  const validation = preview.indexOf('Validate Supabase build configuration')
  const build = preview.indexOf('name: Build static export')
  assert.notEqual(validation, -1)
  assert.notEqual(build, -1)
  assert.ok(validation < build, 'configuration validation must precede the build')
  assert.match(preview, /AUREKA_BUILD_TARGET: preview/)
  assert.match(preview, /node scripts\/validate-supabase-build-env\.mjs/)
  assert.match(supabaseValidator, /PREVIEW_ONLY/)
})

test('preview reports dependency findings and blocks high or critical severity', () => {
  assert.match(preview, /npm audit --json/)
  assert.match(preview, /item\.severity === 'critical' \|\| item\.severity === 'high'/)
  assert.match(preview, /Security gate failed/)
  assert.doesNotMatch(preview, /npm audit --json[^\n]*\|\| true/)
  assert.doesNotMatch(preview, /actions\/deploy-pages/)
})

test('production Pages builds the current AUREKA application directly at the public root', () => {
  assert.match(production, /run: npm ci/)
  assert.match(production, /ref: main/)
  assert.match(production, /AUREKA_PRODUCTION_SUPABASE_URL/)
  assert.match(production, /AUREKA_PRODUCTION_SUPABASE_PUBLISHABLE_KEY/)
  assert.match(production, /AUREKA_BUILD_TARGET: production/)
  assert.match(production, /AUREKA_BASE_PATH: \/AUREKA-Hospital-Quality-Intelligence/)
  assert.match(production, /run: npm test/)
  assert.match(production, /run: npm run build/)
  assert.doesNotMatch(production, /aureka-pages-production|production-src|staging-src|AUREKA_STAGING|ypsbvxnqdbjjhlhjerad|sb_publishable_tTgp|\/staging\//)
  assert.ok(production.includes('node scripts/validate-supabase-build-env.mjs'))

  const checkout = production.indexOf('Checkout AUREKA application')
  const validation = production.indexOf('Validate production Supabase configuration')
  const build = production.indexOf('Build AUREKA directly for the public project root')
  const upload = production.indexOf('Upload Pages artifact')
  const deploy = production.indexOf('uses: actions/deploy-pages@v4')

  assert.ok(checkout >= 0 && validation > checkout)
  assert.ok(validation < build && build < upload && upload < deploy)
})

test('production deployment blocks moderate, high, and critical dependency findings', () => {
  assert.match(production, /\['moderate', 'high', 'critical'\]\.includes\(item\.severity\)/)
  assert.match(production, /Security gate failed:.*moderate-or-higher/)
})

test('production validates its Supabase configuration before build and deploy', () => {
  const validation = production.indexOf('Validate production Supabase configuration')
  const build = production.indexOf('Build AUREKA directly for the public project root')
  const deploy = production.indexOf('uses: actions/deploy-pages@v4')
  assert.notEqual(validation, -1)
  assert.notEqual(build, -1)
  assert.notEqual(deploy, -1)
  assert.ok(validation < build, 'configuration validation must precede the build')
  assert.ok(build < deploy, 'deployment must remain downstream of a successful build job')
  assert.match(production, /needs: build/)
})

test('production Pages refuses manual dispatch from non-main refs before checkout', () => {
  const guard = production.indexOf('name: Enforce production branch')
  const checkout = production.indexOf('uses: actions/checkout@v4')
  assert.notEqual(guard, -1)
  assert.notEqual(checkout, -1)
  assert.ok(guard < checkout, 'production ref guard must run before checkout and build steps')
  assert.ok(production.includes('if [ "$GITHUB_REF" != "refs/heads/main" ]'))
  assert.ok(production.includes('restricted to refs/heads/main'))
})

const dependencyLockValidation = readFileSync('.github/workflows/dependency-lock-validation.yml', 'utf8')

test('dependency lock automation is restricted to feature branches before checkout', () => {
  const guard = dependencyLockValidation.indexOf('name: Restrict dependency lock automation to feature branches')
  const checkout = dependencyLockValidation.indexOf('uses: actions/checkout@v4')
  assert.notEqual(guard, -1)
  assert.notEqual(checkout, -1)
  assert.ok(guard < checkout, 'feature-branch guard must run before checkout or lockfile mutation')
  assert.ok(dependencyLockValidation.includes('case "$GITHUB_REF" in'))
  assert.ok(dependencyLockValidation.includes('refs/heads/feat/*'))
  assert.ok(dependencyLockValidation.includes('Dependency lock automation may only run on refs/heads/feat/* branches.'))
})

test('Supabase build configuration accepts only isolated preview and production project URLs', () => {
  const config = 'project_id = "ktukmjscopggkzrkgnzp"'
  const modernKey = 'sb_publishable_test_key_1234567890'
  const previewResult = validateSupabaseBuildConfiguration({
    target: 'preview',
    url: 'https://aureka-preview-branch.supabase.co',
    key: modernKey,
    config
  })
  assert.equal(previewResult.target, 'preview')
  assert.equal(previewResult.endpointHost, 'aureka-preview-branch.supabase.co')

  assert.throws(() => validateSupabaseBuildConfiguration({
    target: 'preview',
    url: 'https://ktukmjscopggkzrkgnzp.supabase.co',
    key: modernKey,
    config
  }), /isolated non-production Supabase project/)

  const productionResult = validateSupabaseBuildConfiguration({
    target: 'production',
    url: 'https://ktukmjscopggkzrkgnzp.supabase.co',
    key: modernKey,
    config
  })
  assert.equal(productionResult.target, 'production')
  assert.throws(() => validateSupabaseBuildConfiguration({
    target: 'production',
    url: 'https://aureka-preview-branch.supabase.co',
    key: modernKey,
    config
  }), /must match the project_id/)
})

test('Supabase build configuration rejects secret and service-role keys but accepts legacy anon JWTs', () => {
  const config = 'project_id = "ktukmjscopggkzrkgnzp"'
  const legacy = role => 'e30.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature'

  assert.doesNotThrow(() => validateSupabaseBuildConfiguration({
    target: 'preview',
    url: 'https://aureka-preview-branch.supabase.co',
    key: legacy('anon'),
    config
  }))
  assert.throws(() => validateSupabaseBuildConfiguration({
    target: 'preview',
    url: 'https://aureka-preview-branch.supabase.co',
    key: 'sb_secret_never_for_browser',
    config
  }), /never an sb_secret_/)
  assert.throws(() => validateSupabaseBuildConfiguration({
    target: 'preview',
    url: 'https://aureka-preview-branch.supabase.co',
    key: legacy('service_role'),
    config
  }), /never an sb_secret_/)
})

test('Supabase build configuration rejects malformed and non-HTTPS endpoints', () => {
  const config = 'project_id = "ktukmjscopggkzrkgnzp"'
  const key = 'sb_publishable_test_key_1234567890'
  assert.throws(() => validateSupabaseBuildConfiguration({
    target: 'preview', url: 'http://aureka-preview-branch.supabase.co', key, config
  }), /HTTPS project URL/)
  assert.throws(() => validateSupabaseBuildConfiguration({
    target: 'preview', url: 'not-a-url', key, config
  }), /valid absolute URL/)
  assert.throws(() => validateSupabaseBuildConfiguration({
    target: 'preview', url: 'https://aureka-preview-branch.supabase.co', key: 'invalid-key', config
  }), /Use only an sb_publishable_/)
})
