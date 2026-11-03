import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const preview = readFileSync('.github/workflows/preview-build.yml', 'utf8')
const production = readFileSync('.github/workflows/deploy-pages.yml', 'utf8')

test('preview workflow installs exactly from the committed lockfile', () => {
  assert.match(preview, /run: npm ci/)
  assert.doesNotMatch(preview, /run: npm install/)
})

test('preview workflow is isolated to the staging Supabase configuration', () => {
  assert.match(preview, /AUREKA_STAGING_SUPABASE_URL/)
  assert.match(preview, /AUREKA_STAGING_SUPABASE_PUBLISHABLE_KEY/)
  assert.doesNotMatch(preview, /AUREKA_PRODUCTION_SUPABASE_URL/)
  assert.doesNotMatch(preview, /AUREKA_PRODUCTION_SUPABASE_PUBLISHABLE_KEY/)
})

test('preview validates Supabase configuration before creating a static build', () => {
  const validation = preview.indexOf('Validate Supabase build configuration')
  const build = preview.indexOf('name: Build static export')
  assert.notEqual(validation, -1)
  assert.notEqual(build, -1)
  assert.ok(validation < build, 'configuration validation must precede the build')
  assert.match(preview, /Set AUREKA_STAGING_SUPABASE_URL/)
  assert.match(preview, /Set AUREKA_STAGING_SUPABASE_PUBLISHABLE_KEY/)
})

test('preview reports dependency findings and blocks high or critical severity', () => {
  assert.match(preview, /npm audit --json/)
  assert.match(preview, /item\.severity === 'critical' \|\| item\.severity === 'high'/)
  assert.match(preview, /Security gate failed/)
  assert.doesNotMatch(preview, /npm audit --json[^\n]*\|\| true/)
  assert.doesNotMatch(preview, /actions\/deploy-pages/)
})

test('production Pages workflow installs reproducibly and uses production Supabase values only', () => {
  assert.match(production, /run: npm ci/)
  assert.match(production, /AUREKA_PRODUCTION_SUPABASE_URL/)
  assert.match(production, /AUREKA_PRODUCTION_SUPABASE_PUBLISHABLE_KEY/)
  assert.doesNotMatch(production, /AUREKA_STAGING_SUPABASE_URL/)
  assert.doesNotMatch(production, /AUREKA_STAGING_SUPABASE_PUBLISHABLE_KEY/)
})

test('production deployment blocks moderate, high, and critical dependency findings', () => {
  assert.match(production, /\['moderate', 'high', 'critical'\]\.includes\(item\.severity\)/)
  assert.match(production, /Security gate failed:.*moderate-or-higher/)
})

test('production validates its Supabase configuration before build and deploy', () => {
  const validation = production.indexOf('Validate Supabase build configuration')
  const build = production.indexOf('name: Build static export')
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
