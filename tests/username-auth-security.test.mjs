import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const home=readFileSync('components/HomeClient.tsx','utf8')
const edge=readFileSync('supabase/functions/aureka-username-auth/index.ts','utf8')
const helper=readFileSync('lib/aureka/username-auth.ts','utf8')
test('anonymous browser no longer resolves usernames into email addresses',()=>{
  assert.doesNotMatch(home,/rpc\(['"]aureka_login_email/)
  assert.match(home,/sb\.auth\.setSession\(await requestUsernameAuth/)
  assert.match(home,/requestUsernameAuth\('recover'/)
  assert.match(home,/requestUsernameAuth\('resend'/)
  assert.match(edge,/admin\.rpc\("aureka_login_email"/)
  assert.match(edge,/client\.auth\.signInWithPassword/)
  assert.match(edge,/aureka_consume_public_auth_limit/)
  assert.match(edge,/Cache-Control.*no-store/)
  assert.doesNotMatch(helper,/SERVICE_ROLE|sb_secret_/)
})
