import test from 'node:test'
import assert from 'node:assert/strict'
import {ownInvitationTasks,invitationGroup} from '../lib/aureka/invitation-action-inbox.ts'
const row=(id,extra={})=>({id,invited_user_id:'u',delivery_status:'sent',response_status:'pending',created_at:'2026-11-01',...extra})
test('only own tasks are included and pending tasks sort by real meeting dates',()=>{
 const rows=[row('late',{meeting:{meeting_date:'2026-12-10',start_time:'09:00'}}),row('early',{meeting:{meeting_date:'2026-12-01',start_time:'10:00'}}),row('hidden',{invited_user_id:'other'}),row('done',{response_status:'accepted'}),row('unsent',{delivery_status:'draft'})]
 assert.deepEqual(ownInvitationTasks(rows,'u').map(r=>r.id),['early','late','done','unsent'])
 assert.deepEqual(ownInvitationTasks(rows,'u','pending').map(r=>r.id),['early','late'])
 assert.deepEqual(ownInvitationTasks(rows,'u','responded').map(r=>r.id),['done'])
 assert.deepEqual(ownInvitationTasks(rows,'u','other').map(r=>r.id),['unsent'])
 assert.deepEqual(ownInvitationTasks(rows,''),[])
 assert.equal(invitationGroup(row('x',{delivery_status:'failed'})),'other')
 assert.equal(rows.length,5)
})
