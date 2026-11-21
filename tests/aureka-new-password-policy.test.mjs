import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const auth = source('components/HomeClient.tsx')
const settings = source('components/GeneralSettings.tsx')
const edge = source('supabase/functions/aureka-admin-reset-unit-password/index.ts')

test('signup, recovery and initial-password rotation consistently require 12–128 characters', () => {
  assert.match(auth, /password\.length<12\|\|password\.length>128/)
  assert.equal((auth.match(/password\.length<12\|\|password\.length>128/g) ?? []).length, 3)
  assert.doesNotMatch(auth, /password\.length<[68]/)
  assert.doesNotMatch(auth, /Password baru minimal 6 karakter/)
  assert.match(auth, /minLength=\{12\}/)
  assert.match(auth, /12–128 karakter/)
})

test('password changes in settings have the same constraints as admin resets', () => {
  assert.match(settings, /pw\.next\.length < 12 \|\| pw\.next\.length > 128/)
  assert.match(edge, /newPassword\.length < 12 \|\| newPassword\.length > 128/)
  assert.doesNotMatch(settings, /pw\.next\.length < 6/)
  assert.doesNotMatch(settings, /Password baru \(min\. 6 karakter\)/)
})

test('existing-account sign-in has no arbitrary new-password minimum', () => {
  assert.match(auth, /const login=async\(\)=>/)
  assert.match(auth, /sb\.auth\.signInWithPassword\(/)
})
