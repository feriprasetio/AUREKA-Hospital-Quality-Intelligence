import { resolveContinuumPin, WORKSPACE_PIN_LIMIT, type ContinuumWorkspace } from './continuum-workspace.ts'
export const CONTINUUM_SESSION_KEY='aureka:continuum:session:v1'
type CanOpen=(destination:ContinuumWorkspace)=>boolean
export async function continuumScopeDigest(scope:string):Promise<string|null>{
  try{
    const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope))
    return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')
  }catch{return null}
}
const validDigest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value)
export function allowedContinuumPins(input:unknown,canOpen:CanOpen):string[]{
  if(!Array.isArray(input))return []
  const result:string[]=[]
  for(const id of input.slice(0,WORKSPACE_PIN_LIMIT*2)){
    if(typeof id!=='string'||result.includes(id))continue
    const destination=resolveContinuumPin(id)
    if(destination&&canOpen(destination))result.push(id)
    if(result.length>=WORKSPACE_PIN_LIMIT)break
  }
  return result
}
export function encodeContinuumSession(scope:string,pins:readonly string[],canOpen:CanOpen):string|null{
  if(!validDigest(scope))return null
  return JSON.stringify({version:1,scope,pins:allowedContinuumPins(pins,canOpen)})
}
export function decodeContinuumSession(raw:string|null,scope:string,canOpen:CanOpen):string[]|null{
  if(!raw||raw.length>1024||!validDigest(scope))return null
  try{
    const value=JSON.parse(raw)
    if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['version','scope','pins'].includes(k))||
      value.version!==1||value.scope!==scope||!Array.isArray(value.pins))return null
    return allowedContinuumPins(value.pins,canOpen)
  }catch{return null}
}
export function clearContinuumSession(){
  try{window.sessionStorage.removeItem(CONTINUUM_SESSION_KEY)}catch{}
}
export function moveContinuumPin(pins:readonly string[],id:string,offset:-1|1):string[]{
  const next=allowedContinuumPins(pins,()=>true)
  const index=next.indexOf(id),target=index+offset
  if(index<0||target<0||target>=next.length)return next
  ;[next[index],next[target]]=[next[target],next[index]]
  return next
}
