export type InvitationTask={id:string;invited_user_id:string|null;delivery_status:string;response_status:string;created_at:string;meeting?:{meeting_date:string;start_time:string|null}|null}
export type InvitationFilter='all'|'pending'|'responded'|'other'
export function invitationGroup(row:InvitationTask):Exclude<InvitationFilter,'all'>{
 if(row.response_status==='accepted'||row.response_status==='declined')return 'responded'
 if(row.response_status==='pending'&&row.delivery_status==='sent')return 'pending'
 return 'other'
}
export function ownInvitationTasks<T extends InvitationTask>(rows:readonly T[],userId:string,filter:InvitationFilter='all'):T[]{
 if(!userId)return []
 const groups={pending:0,responded:1,other:2}
 const date=(row:T)=>{
  const value=row.meeting?.meeting_date
  return value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T'+(row.meeting?.start_time||'23:59:59'):'9999-12-31T23:59:59'
 }
 return rows.filter(row=>row.invited_user_id===userId&&(filter==='all'||invitationGroup(row)===filter)).sort((a,b)=>{
  const ga=invitationGroup(a),gb=invitationGroup(b)
  return groups[ga]-groups[gb]||(ga==='pending'?date(a).localeCompare(date(b)):b.created_at.localeCompare(a.created_at))||a.id.localeCompare(b.id)
 })
}
