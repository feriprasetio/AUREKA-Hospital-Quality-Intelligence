'use client'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import dynamic from 'next/dynamic'
import {useAccessibleSidebar} from '@/components/layout/useAccessibleSidebar'
import AsyncStatePanel from '@/components/AsyncStatePanel'
import {sanitizeNotificationText,toUserFacingError} from '@/lib/ui/error-feedback'
import {parseAuthCallbackError} from '@/lib/aureka/auth-callback'
import {type SupabaseClient} from '@supabase/supabase-js'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import type {RiskFocus,SafetyFocus} from '@/lib/aureka/focus'
import {LiquidGlass,LiquidGlassButton} from '@/components/LiquidGlass'
import PublicLandingPage from '@/components/PublicLandingPage'
import { AUREKA_PRIMARY_NAV, type AurekaRole } from '@/lib/aureka/module-registry'
const TanyaAureka=dynamic(()=>import('@/components/TanyaAureka'),{ssr:false})
const workspaceChunkLoading=(label:string)=><AsyncStatePanel state="loading" title={`Memuat ${label}`} description="Menyiapkan ruang kerja." compact/>
const QualityIndicatorWorkspace=dynamic(()=>import('@/components/QualityIndicatorWorkspace'),{ssr:false,loading:()=>workspaceChunkLoading('Audit Indikator Mutu')})
const QualityResultsWorkspace=dynamic(()=>import('@/components/QualityResultsWorkspace'),{ssr:false,loading:()=>workspaceChunkLoading('Hasil Capaian Mutu')})
const ClinicalPathwayWorkspace=dynamic(()=>import('@/components/ClinicalPathwayWorkspace'),{ssr:false,loading:()=>workspaceChunkLoading('Clinical Pathway')})
const PatientSafetyWorkspace=dynamic(()=>import('@/components/PatientSafetyWorkspace'),{ssr:false,loading:()=>workspaceChunkLoading('Keselamatan Pasien')})
const RiskManagementWorkspace=dynamic(()=>import('@/components/RiskManagementWorkspace'),{ssr:false,loading:()=>workspaceChunkLoading('Manajemen Risiko')})
const QualityHub=dynamic(()=>import('@/components/QualityHub'),{ssr:false,loading:()=>workspaceChunkLoading('Menu Mutu Klinis')})
const GeneralSettings=dynamic(()=>import('@/components/GeneralSettings'),{ssr:false,loading:()=>workspaceChunkLoading('Administrasi')})
const OverviewDashboard=dynamic(()=>import('@/components/OverviewDashboard'),{ssr:false,loading:()=>workspaceChunkLoading('Capaian Unit')})
const HomeLandingWorkspace=dynamic(()=>import('@/components/HomeLandingWorkspace'),{ssr:false,loading:()=>workspaceChunkLoading('Halaman Utama')})
const PatientRegistryWorkspace=dynamic(()=>import('@/components/PatientRegistryWorkspace'),{ssr:false,loading:()=>workspaceChunkLoading('Register Pasien')})
const MetadataStatisticsWorkspace=dynamic(()=>import('@/components/MetadataStatisticsWorkspace'),{ssr:false,loading:()=>workspaceChunkLoading('Metadata')})
const OppeAuditWorkspace=dynamic(()=>import('@/components/OppeAuditWorkspace'),{ssr:false,loading:()=>workspaceChunkLoading('OPPE / FPPE')})
const sb:SupabaseClient=aurekaSupabase
const sys=()=>sb.schema('aureka_system')
const BASE_PATH=process.env.NEXT_PUBLIC_BASE_PATH??'/AUREKA-Hospital-Quality-Intelligence'
const LOGO=`${BASE_PATH}/logo-aureka.jpg`
const PREVIEW_ONLY=process.env.NEXT_PUBLIC_SUPABASE_URL==='https://preview-disabled.invalid'
const FALLBACK=['Informasi dan Pengaduan','Informatika dan Teknologi','Instalasi Ambulance','Instalasi Bedah Sentral','Instalasi Farmasi','Instalasi Gawat Darurat','Instalasi Gizi','Instalasi Hemodialisis','Instalasi Laboratorium','Instalasi Radiologi','Instalasi Rawat Jalan','Instalasi Rehab Medik','Instalasi Rekam Medis','Intensive Care Unit & High Care Unit','Komite Medik','Komite Pencegahan dan Pengendalian Infeksi','Manajemen rumah Sakit','Neonatal Intensive Care Unit & Pediatrics High Dependency Unit','Nifas Obstetrics & Gynecology','Perinatology & Neonatology','Promosi Kesehatan Rumah Sakit','Rawat Inap Anak','Rawat Inap Bedah','Rawat Inap Isolasi','Rawat Inap Penyakit Dalam','Rawat Inap Saraf','Rawat Inap VIP','Satuan Pengawas Intern','Tim Investigasi','Tim Koordinasi Pendidikan','Tim Pelayanan Human Immunodeficiency Virus','Tim Pelayanan Keluarga Berencana Rumah Sakit','Tim Pelayanan Obstetri Neonatal Emergensi Komprehensif','Tim Pelayanan Onkologi','Tim Pencegahan Resistensi Antimikroba','Tim Peningkatan Kinerja Klinis','Verlos Kamer']
const MODS=AUREKA_PRIMARY_NAV.map(({id,label})=>[id,label] as const)
const MANAGER_ONLY_MODULES:string[]=AUREKA_PRIMARY_NAV.filter(({visibility})=>visibility==='management-only').map(({id})=>id)
// Role pengelola melihat seluruh rumah sakit; role unit (PIC) hanya modul input unitnya.
const MANAGER_ROLES=['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS']
const ROLE_LABEL:Record<string,string>={ADMIN:'Super Admin',PMKP:'Komite PMKP',MANAGEMENT:'Manajemen',PIC:'PIC Unit',VALIDATOR:'Validator Unit',KABID:'Kepala Bidang',DIREKTUR:'Direktur',DEWAN_PENGAWAS:'Dewan Pengawas'}
const initials=(name?:string|null)=>{const parts=String(name||'').split('@')[0].replace(/[^A-Za-z0-9\u00C0-\u024F ]/g,' ').trim().split(/\s+/).filter(Boolean);return ((parts[0]?.[0]||'A')+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase()}
function NavIcon({id}:{id:string}){
 if(id==='home')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.5v10h13v-10M9 19.5v-6h6v6"/></svg>
 if(id==='patients')return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-3.2 2.2-5 5.5-5 1.5 0 2.8.4 3.8 1.2M16 8v6m-3-3h6M15 19h5"/></svg>
 if(id==='quality')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-7"/><path d="M3.5 19.5h17"/></svg>
 if(id==='safety')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.2c0 4.4-2.7 7.9-7 9.3-4.3-1.4-7-4.9-7-9.3V6l7-2.5Z"/><path d="m8.8 12.1 2.1 2.1 4.5-4.7"/></svg>
 if(id==='risk')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 4v7.9l-7 4-7-4V7l7-4Z"/><path d="M5 7 12 11l7-4M12 11v8.7"/></svg>
 if(id==='staff')return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c.6-3.4 3-5.2 7-5.2s6.4 1.8 7 5.2"/></svg>
 if(id==='analytics')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-8"/><path d="M3 19.5h18"/></svg>
 return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.7 5l2.3-.2.9 2.1 2 1.2-.7 2.2 1.1 2-1.5 1.8.2 2.3-2.1.9-1.2 2-2.2-.7-2 1.1-1.8-1.5-2.3.2-.9-2.1-2-1.2.7-2.2-1.1-2 1.5-1.8-.2-2.3 2.1-.9 1.2-2 2.2.7 2-1.1Z"/><circle cx="12" cy="12" r="3"/></svg>
}
type SafetyWorkspaceTab='overview'|'incidents'|'investigation'|'survey'|'responses'
type RiskWorkspaceTab='overview'|'register'|'mitigation'|'connections'|'fmea'
type AnalyticsWorkspaceTab='programs'|'profiles'|'directory'
type AnalyticsDirectoryTab='directory'|'team'
type WorkspaceSearchResult={node:HTMLElement;text:string;tag:string}
type WorkspaceNotification={id:number;message:string;kind:'success'|'error'|'info';createdAt:number;module?:string}
type SupportConversation={id:string;room_id:number;created_by:string;subject:string;status:'open'|'closed';created_at:string;updated_at:string}
type SupportMessage={id:string;conversation_id:string;sender_id:string;body:string;created_at:string}

type SidebarChild={id:string;label:string;children?:SidebarChild[]}
type Room={id:number;name:string};type Profile={user_id:string;full_name:string;email:string;username?:string|null;primary_room_id:number|null;role_id:string|null;is_active:boolean;must_change_password?:boolean;role_code?:string|null;role_name?:string|null}
const logo=(c='')=><span className={'brandLogoWrap '+c}><img className="brandLogoImage" src={LOGO} alt="Logo AUREKA Hospital Quality Intelligence" loading="eager" decoding="async" onError={e=>{e.currentTarget.style.display='none';const fallback=e.currentTarget.nextElementSibling as HTMLElement|null;if(fallback)fallback.style.display='grid'}}/><span className="brandLogoFallback" aria-hidden="true">A</span></span>
async function rooms(){const {data,error}=await sb.from('master_rooms').select('id,name').eq('is_active',true).order('sort_order');return !error&&data?.length?data as Room[]:FALLBACK.map((name,i)=>({id:i+1,name}))}
// RPC opsional: bila belum terpasang di database (404/PGRST202), jangan panggil lagi di perangkat ini.
function syncMyEmail(){try{if(localStorage.getItem('aureka-sync-email-missing')==='1')return}catch{}sb.rpc('aureka_sync_my_email').then(({error}:{error:any})=>{if(error&&(error.code==='PGRST202'||/not find|404/i.test(String(error.message||'')))){try{localStorage.setItem('aureka-sync-email-missing','1')}catch{}}},()=>{})}
async function prof(_uid:string){const {data,error}=await sb.rpc('aureka_get_my_profile');if(error)throw error;const row=(Array.isArray(data)?data[0]:data) as (Profile&{role_code?:string|null;role_name?:string|null})|null;return row}
async function roleCode(profile:Profile|null){return profile?.role_code||null}
export default function HomeClient(){
 const [view,setView]=useState<'public'|'login'|'signup'|'workspace'|'force-password'>('public'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[fullName,setFullName]=useState(''),[signupRoom,setSignupRoom]=useState(''),[roomsList,setRoomsList]=useState<Room[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[user,setUser]=useState<any>(null),[profile,setProfile]=useState<Profile|null>(null),[room,setRoom]=useState<Room|null>(null),[role,setRole]=useState<string|null>(null),[active,setActive]=useState('home'),[qualityOpen,setQualityOpen]=useState(false),[qualityOppeOpen,setQualityOppeOpen]=useState(false),[qualityInitialContainer,setQualityInitialContainer]=useState<'Audit Indikator Mutu'|'Audit Clinical Pathway'|'Audit Klinis dan Kematian'>('Audit Indikator Mutu'),[clinicalPathwayOpen,setClinicalPathwayOpen]=useState(false),[qualityResultsView,setQualityResultsView]=useState<'indicators'|'pathway'|'clinical-death'|null>(null),[selectedQualityRoomId,setSelectedQualityRoomId]=useState<number|null>(null),[signupDone,setSignupDone]=useState(false),[riskFocus,setRiskFocus]=useState<RiskFocus|null>(null),[safetyFocus,setSafetyFocus]=useState<SafetyFocus|null>(null),[showPw,setShowPw]=useState(false),[profileFocus,setProfileFocus]=useState(0),[username,setUsername]=useState(''),[needVerify,setNeedVerify]=useState(''),[authInfo,setAuthInfo]=useState(''),[authMode,setAuthMode]=useState<'normal'|'forgot'|'recovery'>('normal'),[resetSent,setResetSent]=useState(false),[password2,setPassword2]=useState(''),[routeReady,setRouteReady]=useState(false),[safetyTab,setSafetyTab]=useState<SafetyWorkspaceTab>('incidents'),[riskTab,setRiskTab]=useState<RiskWorkspaceTab>('register'),[analyticsTab,setAnalyticsTab]=useState<AnalyticsWorkspaceTab>('programs'),[analyticsDirectoryTab,setAnalyticsDirectoryTab]=useState<AnalyticsDirectoryTab>('directory'),[globalSearch,setGlobalSearch]=useState(''),[searchResults,setSearchResults]=useState<WorkspaceSearchResult[]>([]),[searchResultsQuery,setSearchResultsQuery]=useState(''),[sidebarCollapsed,setSidebarCollapsed]=useState(false),[notifications,setNotifications]=useState<WorkspaceNotification[]>([]),[activeToast,setActiveToast]=useState<WorkspaceNotification|null>(null),[notificationHistoryOpen,setNotificationHistoryOpen]=useState(false),[supportOpen,setSupportOpen]=useState(false),[supportTab,setSupportTab]=useState<'admin'|'ai'|'broadcast'>('admin'),[broadcastDraft,setBroadcastDraft]=useState(''),[broadcastSending,setBroadcastSending]=useState(false),[supportConversations,setSupportConversations]=useState<SupportConversation[]>([]),[supportConversationId,setSupportConversationId]=useState(''),[supportMessages,setSupportMessages]=useState<SupportMessage[]>([]),[supportDraft,setSupportDraft]=useState(''),[supportLoading,setSupportLoading]=useState(false),[supportSending,setSupportSending]=useState(false),[supportLoadError,setSupportLoadError]=useState(''),[supportMessagesLoading,setSupportMessagesLoading]=useState(false),[supportMessagesError,setSupportMessagesError]=useState('')
 const updateSelectedQualityRoom=useCallback((nextRoomId:number|null)=>{
  setSelectedQualityRoomId(nextRoomId)
  if(typeof window==='undefined'||!user?.id)return
  try{
   const storageKey='aureka-quality-room:'+String(user.id)
   if(nextRoomId==null)window.sessionStorage.removeItem(storageKey)
   else window.sessionStorage.setItem(storageKey,String(nextRoomId))
  }catch{}
 },[user?.id])
 useEffect(()=>{
  if(typeof window==='undefined'||!user?.id||selectedQualityRoomId!=null||!roomsList.length)return
  try{
   const stored=Number(window.sessionStorage.getItem('aureka-quality-room:'+String(user.id)))
   if(Number.isSafeInteger(stored)&&stored>0&&roomsList.some(item=>Number(item.id)===stored))setSelectedQualityRoomId(stored)
  }catch{}
 },[user?.id,roomsList,selectedQualityRoomId])
 const mobileSidebar=useAccessibleSidebar()
 const [closedNav,setClosedNav]=useState<string[]>([])
 const toggleNav=(key:string,open?:boolean)=>setClosedNav(c=>{const isClosed=c.includes(key);const shouldOpen=open??isClosed;return shouldOpen?c.filter(x=>x!==key):(isClosed?c:[...c,key])})
 useEffect(()=>{
  if(typeof document==='undefined')return
  window.localStorage.removeItem('aureka-theme-mode')
  window.localStorage.removeItem('aureka-tone')
  document.documentElement.dataset.theme='solid'
  document.documentElement.style.colorScheme='light'
 },[])
 const [uiMode,setUiMode]=useState<'terang'|'gelap'>('terang')
 useEffect(()=>{const h=(e:Event)=>{const d=(e as CustomEvent).detail;if(d==='gelap'||d==='terang')setUiMode(d)};window.addEventListener('aureka-mode-change',h);return()=>window.removeEventListener('aureka-mode-change',h)},[])
 useEffect(()=>{if(typeof document==='undefined')return;document.documentElement.setAttribute('data-skin','arktik');try{localStorage.removeItem('aureka-theme')}catch{}if(document.documentElement.getAttribute('data-mode')==='gelap')setUiMode('gelap')},[])
 const toggleUiMode=()=>{const next=uiMode==='terang'?'gelap':'terang';setUiMode(next);document.documentElement.setAttribute('data-mode',next);try{localStorage.setItem('aureka-mode',next)}catch{}}
 useEffect(()=>{rooms().then(setRoomsList);const isRecovery=typeof window!=='undefined'&&/type=recovery/.test(window.location.hash);const verified=typeof window!=='undefined'&&/type=(signup|email_change|email)/.test(window.location.hash);if(verified)history.replaceState(null,'',window.location.pathname+window.location.search);sb.auth.getSession().then(async({data})=>{if(!data.session||isRecovery)return;let p:Profile|null=null;try{p=await prof(data.session.user.id)}catch{return}if(!p?.is_active){await sb.auth.signOut();if(verified){setView('login');setAuthInfo('Email berhasil diverifikasi ✓. Akun Anda sedang menunggu aktivasi oleh Komite PMKP.')}return}syncMyEmail();if(p?.is_active){setUser(data.session.user);setProfile(p);const currentRole=await roleCode(p);setRole(currentRole);if(p.primary_room_id){const {data:r}=await sb.from('master_rooms').select('id,name').eq('id',p.primary_room_id).maybeSingle();setRoom(r as Room|null)}setActive('home');setQualityOpen(false);setView(p.must_change_password?'force-password':'workspace')}})},[])
 useEffect(()=>{
  if(view!=='workspace'||typeof window==='undefined'){setRouteReady(false);return}
  const applyHash=(raw:string)=>{
   const path=raw.replace(/^#\/?/,'').toLowerCase()
    if(path==='mutu-klinis/oppe-fppe'||path==='tenaga-klinis/oppe'){
     if(!['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR'].includes(role||'')){setActive('home');return}
     setActive('quality');setQualityOppeOpen(true);setQualityResultsView(null);setQualityOpen(false);setClinicalPathwayOpen(false);return
    }
   const auditMatch=/^mutu-klinis\/(audit-indikator|clinical-pathway|audit-klinis-dan-kematian)(?:\/(hasil-capaian|form-logbook))?$/.exec(path)
   if(auditMatch){setQualityOppeOpen(false);
    const audit=auditMatch[1]
    const tab=auditMatch[2]||'form-logbook'
    setActive('quality')
    setQualityInitialContainer(audit==='audit-klinis-dan-kematian'?'Audit Klinis dan Kematian':'Audit Indikator Mutu')
    setClinicalPathwayOpen(audit==='clinical-pathway'&&tab==='form-logbook')
    setQualityOpen(audit!=='clinical-pathway'&&tab==='form-logbook')
    setQualityResultsView(tab==='hasil-capaian'?(audit==='audit-indikator'?'indicators':audit==='clinical-pathway'?'pathway':'clinical-death'):null)
    return
   }
   const routes:Record<string,string>={'ringkasan':'home','halaman-utama':'home','register-pasien':'patients','mutu-klinis':'quality','keselamatan-pasien':'safety','manajemen-risiko':'risk','tenaga-klinis':'analytics','analitik-laporan':'analytics','metadata':'analytics','administrasi':'settings'}
   const [modulePath,section]=path.split('/')
   let next=routes[modulePath]||'home'
   if(next!=='home'&&!AUREKA_PRIMARY_NAV.some(module=>module.id===next&&module.requiredRoles.includes((role||'') as AurekaRole)))next='home'
   if(next==='safety')setSafetyTab((['overview','incidents','investigation','survey',...(role==='ADMIN'?['responses']:[])].includes(section)?section:'overview') as SafetyWorkspaceTab)
   if(next==='risk')setRiskTab((['overview','register','mitigation','connections','fmea'].includes(section)?section:'overview') as RiskWorkspaceTab)
   if(next==='analytics'){
    const legacySection=section==='metadata'?'profiles':section==='staff'?'directory':section
    if(legacySection==='team'){setAnalyticsTab('directory');setAnalyticsDirectoryTab('team')}
    else if(legacySection==='directory'){setAnalyticsTab('directory');setAnalyticsDirectoryTab('directory')}
    else if(['programs','profiles'].includes(legacySection))setAnalyticsTab(legacySection as AnalyticsWorkspaceTab)
    else setAnalyticsTab('programs')
   }
   setActive(next)
   setQualityOppeOpen(false)
   setQualityOpen(false)
   setClinicalPathwayOpen(false)
   setQualityResultsView(null)
  }
  applyHash(window.location.hash)
  const onHashChange=()=>applyHash(window.location.hash)
  window.addEventListener('hashchange',onHashChange)
  setRouteReady(true)
  return ()=>window.removeEventListener('hashchange',onHashChange)
 },[view,role])
 useEffect(()=>{
  if(view!=='workspace'||!routeReady||typeof window==='undefined')return
  let hash='#halaman-utama'
  if(active==='quality'){
   if(qualityOppeOpen)hash='#mutu-klinis/oppe-fppe'
   else {
    const audit=qualityResultsView==='pathway'||clinicalPathwayOpen?'clinical-pathway':qualityInitialContainer==='Audit Klinis dan Kematian'?'audit-klinis-dan-kematian':'audit-indikator'
    const tab=qualityResultsView?'hasil-capaian':'form-logbook'
    hash='#mutu-klinis/'+audit+'/'+tab
   }
  }else{
   const routes:Record<string,string>={home:'#halaman-utama',patients:'#register-pasien',safety:'#keselamatan-pasien',risk:'#manajemen-risiko',analytics:'#metadata',settings:'#administrasi'}
   hash=routes[active]||'#ringkasan'
   const section=active==='safety'?safetyTab:active==='risk'?riskTab:active==='analytics'?(analyticsTab==='directory'?analyticsDirectoryTab:analyticsTab):null
   if(section)hash+='/'+section
  }
  if(window.location.hash!==hash)window.location.hash=hash
 },[view,routeReady,active,qualityOpen,qualityOppeOpen,clinicalPathwayOpen,qualityInitialContainer,qualityResultsView,safetyTab,riskTab,analyticsTab,analyticsDirectoryTab])

 const resolveLoginEmail=async(input:string)=>{const v=input.trim();if(!v)throw new Error('Isi username atau email.');if(v.includes('@'))return v;const {data,error}=await sb.rpc('aureka_login_email',{p_username:v});if(error){if(error.code==='PGRST202'||/Could not find the function|schema cache/i.test(error.message))throw new Error('Login dengan username belum aktif. Silakan masuk memakai email.');throw error}if(!data)throw new Error('Username tidak ditemukan. Periksa ejaan atau masuk memakai email.');return String(data)}
 const authError=(e:any,em?:string)=>{const m=e instanceof Error?e.message:String(e?.message||e||'');if(/email not confirmed/i.test(m)){if(em)setNeedVerify(em);return 'Email akun belum diverifikasi. Buka email Anda dan klik tautan verifikasi, atau kirim ulang di bawah.'}if(/invalid login credentials/i.test(m))return 'Username/email atau password salah.';if(/rate limit|too many/i.test(m))return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';if(/already registered|already been registered/i.test(m))return 'Email ini sudah terdaftar. Silakan masuk atau gunakan Lupa password.';return toUserFacingError(e,{fallback:'Autentikasi belum berhasil. Periksa informasi akun, lalu coba lagi.'})}
 const resendVerify=async()=>{if(busy||!needVerify)return;setBusy(true);const {error}=await sb.auth.resend({type:'signup',email:needVerify,options:{emailRedirectTo:`${window.location.origin}${BASE_PATH}/`}});setBusy(false);setAuthInfo('');setMessage(error?authError(error):`Email verifikasi dikirim ulang ke ${needVerify}. Cek juga folder Spam.`)}
 const login=async()=>{if(busy)return;if(!email.trim()||!password){setAuthInfo('');setMessage('Lengkapi username/email dan password untuk melanjutkan.');return}setBusy(true);setMessage('');setNeedVerify('');setAuthInfo('');let em='';try{em=await resolveLoginEmail(email);const {data,error}=await sb.auth.signInWithPassword({email:em,password});if(error)throw error;syncMyEmail();const p=await prof(data.user.id);if(!p){await sb.auth.signOut();throw new Error('Profil AUREKA belum tersedia.')}if(!p.is_active){await sb.auth.signOut();throw new Error('Akun belum aktif. Hubungi Super Admin/Komite PMKP untuk aktivasi.')}setUser(data.user);setProfile(p);const currentRole=await roleCode(p);setRole(currentRole);if(p.primary_room_id){const {data:r}=await sb.from('master_rooms').select('id,name').eq('id',p.primary_room_id).maybeSingle();setRoom(r as Room|null)}setActive('home');setQualityOpen(false);setClinicalPathwayOpen(false);if(typeof window!=='undefined')window.history.replaceState(null,'',window.location.pathname+window.location.search+'#halaman-utama');if(p.must_change_password){setPassword('');setPassword2('');setView('force-password')}else{setView('workspace')}}catch(e){setMessage(authError(e,em))}finally{setBusy(false)}}
 const signup=async()=>{if(busy)return;setBusy(true);setMessage('');try{const un=username.trim().toLowerCase();if(!fullName.trim()||!signupRoom||password.length<8)throw new Error('Nama, unit utama, dan password minimal 8 karakter wajib diisi.');if(!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(un))throw new Error('Username 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Contoh: pic.isolasi');if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))throw new Error('Email wajib diisi dengan benar (dipakai untuk verifikasi dan reset password).');const av=await sb.rpc('aureka_username_available',{p_username:un});if(!av.error&&av.data===false)throw new Error(`Username “${un}” sudah dipakai. Coba yang lain, misalnya ${un}2.`);const {data:su,error}=await sb.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${window.location.origin}${BASE_PATH}/`,data:{full_name:fullName.trim(),primary_room_id:signupRoom,username:un}}});if(error)throw error;if(su?.user&&Array.isArray((su.user as any).identities)&&(su.user as any).identities.length===0)throw new Error('Email ini sudah terdaftar. Silakan masuk atau gunakan Lupa password.');if(su?.session)await sb.auth.signOut();setUsername(un);setMessage('');setSignupDone(true)}catch(e){setMessage(authError(e))}finally{setBusy(false)}}
 const intentionalLogoutRef=useRef(false)
 // Sesi hilang tanpa logout (refresh token gagal/kedaluwarsa): jangan biarkan modul memuat data sebagai tamu.
 const viewRef=useRef(view)
 useEffect(()=>{viewRef.current=view},[view])
 useEffect(()=>{const {data:sub}=sb.auth.onAuthStateChange((event)=>{if(event!=='SIGNED_OUT')return;if(intentionalLogoutRef.current){intentionalLogoutRef.current=false;return}if(viewRef.current!=='workspace')return;setUser(null);setProfile(null);setRoom(null);setRole(null);setActive('home');setNotifications([]);setActiveToast(null);setAuthMode('normal');setMessage('');setAuthInfo('Sesi login Anda berakhir. Silakan masuk kembali, data Anda tetap aman.');setView('login')});return()=>{sub.subscription.unsubscribe()}},[])
 useEffect(()=>{if(typeof window==='undefined')return;const callbackError=parseAuthCallbackError(window.location.hash,window.location.search);if(!callbackError)return;history.replaceState(null,'',window.location.pathname);setAuthMode('normal');setAuthInfo('');setMessage(callbackError.message);setView('login')},[])
 useEffect(()=>{const {data:sub}=sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){setAuthMode('recovery');setMessage('');setPassword('');setPassword2('');setView('login')}});if(typeof window!=='undefined'&&/type=recovery/.test(window.location.hash)){setAuthMode('recovery');setView('login')}return()=>{sub.subscription.unsubscribe()}},[])
 const sendReset=async()=>{if(busy)return;setBusy(true);setMessage('');let em='';try{em=await resolveLoginEmail(email)}catch(e){setBusy(false);setMessage(authError(e));return}if(!/^\S+@\S+\.\S+$/.test(em)){setBusy(false);setMessage('Masukkan username atau email akun yang valid.');return}if(em.toLowerCase().endsWith('@aureka.invalid')){setBusy(false);setMessage('Akun unit ini tidak memakai email untuk pemulihan password. Hubungi Super Admin untuk menyetel password sementara; akun akan wajib menggantinya saat login berikutnya.');return}const {error}=await sb.auth.resetPasswordForEmail(em,{redirectTo:`${window.location.origin}${BASE_PATH}/`});setBusy(false);if(error){setMessage(/rate limit|too many/i.test(error.message)?'Terlalu banyak permintaan. Coba lagi beberapa menit lagi, atau minta Super Admin menyetel password sementara.':`Gagal mengirim email: ${toUserFacingError(error,{fallback:'Email pemulihan belum dapat dikirim. Coba kembali beberapa saat lagi.'})}`);return}setResetSent(true)}
 const saveNewPassword=async()=>{if(busy)return;if(password.length<8){setMessage('Password baru minimal 8 karakter.');return}if(password!==password2){setMessage('Konfirmasi password tidak sama.');return}setBusy(true);setMessage('');const {error}=await sb.auth.updateUser({password});if(error){setBusy(false);setMessage(`Gagal menyimpan password: ${toUserFacingError(error,{fallback:'Password belum dapat diperbarui. Periksa koneksi dan coba kembali.'})}`);return}await sb.auth.signOut();setBusy(false);if(typeof window!=='undefined'&&window.location.hash)history.replaceState(null,'',window.location.pathname+window.location.search);setPassword('');setPassword2('');setAuthMode('normal');setMessage('');setResetSent(false);setView('login');setMessage('Password baru tersimpan. Silakan masuk dengan password baru.')}
 const saveFirstPassword=async()=>{
  if(busy)return
  if(!user?.id||!profile?.must_change_password){setView('workspace');return}
  if(password.length<12){setMessage('Password baru minimal 12 karakter.');return}
  if(password!==password2){setMessage('Konfirmasi password tidak sama.');return}
  setBusy(true);setMessage('')
  const {error}=await sb.auth.updateUser({password})
  if(error){setBusy(false);setMessage(`Gagal mengganti password: ${toUserFacingError(error,{fallback:'Password belum dapat diperbarui. Periksa koneksi dan coba kembali.'})}`);return}
  const {error:flagError}=await sb.rpc('aureka_complete_first_login_password_change')
  if(flagError){setBusy(false);setMessage(`Password sudah diperbarui, tetapi status wajib ganti password belum dapat diselesaikan. ${toUserFacingError(flagError,{fallback:'Klik Simpan kembali untuk menyelesaikan proses.'})}`);return}
  try{
   const next=await prof(user.id)
   if(!next||next.must_change_password)throw new Error('Status wajib ganti password belum terkonfirmasi.')
   setProfile(next);setPassword('');setPassword2('');setBusy(false);setMessage('');if(typeof window!=='undefined')window.history.replaceState(null,'',window.location.pathname+window.location.search+'#halaman-utama');setView('workspace')
  }catch(e){
   setBusy(false);setMessage(toUserFacingError(e,{fallback:'Password berubah, tetapi profil belum dapat dimuat ulang. Muat ulang halaman dan masuk kembali.'}))
  }
 }
 const logout=async()=>{intentionalLogoutRef.current=true;try{Object.keys(localStorage).filter(k=>k.startsWith('aureka-tanya')).forEach(k=>localStorage.removeItem(k));Object.keys(sessionStorage).filter(k=>k.startsWith('aureka-tanya')).forEach(k=>sessionStorage.removeItem(k));if(user?.id)sessionStorage.removeItem('aureka-quality-room:'+String(user.id));Object.keys(sessionStorage).filter(k=>k.startsWith('aureka-ov:')).forEach(k=>sessionStorage.removeItem(k))}catch{};await sb.auth.signOut();setUser(null);setProfile(null);setRoom(null);setRole(null);setPassword('');setPassword2('');setView('public');setActive('home');setQualityOpen(false);setQualityOppeOpen(false);setClinicalPathwayOpen(false);setQualityResultsView(null);}
  const admin=role==='ADMIN'
 const manager=MANAGER_ROLES.includes(role||'')
 const validator=role==='VALIDATOR'
 const visibleMods=useMemo(()=>AUREKA_PRIMARY_NAV.filter(({id,requiredRoles})=>id!=='staff'&&requiredRoles.includes((role||'') as AurekaRole)&&(id!=='analytics'||['ADMIN','PMKP','PIC','VALIDATOR'].includes(role||''))).map(({id,label})=>[id,id==='analytics'?'Metadata':label] as const),[role])
 const sidebarChildGroups=useMemo<Record<string,SidebarChild[]>>(()=>{
  const groups:Record<string,SidebarChild[]> = {
   quality:[
    {id:'audit-indicators',label:'Audit Indikator Mutu'},
    {id:'audit-pathway',label:'Audit Clinical Pathway'},
    {id:'audit-clinical-death',label:'Audit Klinis dan Kematian'},
    ...(['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR'].includes(role||'')?[{id:'oppe-fppe',label:'OPPE / FPPE'}]:[]),
   ],
   safety:[
     {id:'incidents',label:'Laporan IKP'},
    {id:'investigation',label:'Investigasi / RCA'},
    {id:'survey',label:'Survei Budaya Keselamatan'},
    ...(admin?[{id:'responses',label:'Rekapan Survei'}]:[]),
   ],
   risk:[
     {id:'register',label:'Risk Register'},
    {id:'mitigation',label:'RTP Terintegrasi'},
    {id:'connections',label:'Konektor Risiko'},
    {id:'fmea',label:'FMEA / HFMEA'},
   ],
   analytics:[],
  }
  return groups
 },[admin,manager,role])
 const currentContainer=useMemo(()=>{
  if(active==='home')return 'Halaman Utama'
  if(active==='quality')return qualityOppeOpen?'OPPE / FPPE':qualityResultsView?({indicators:'Audit Indikator Mutu · Hasil Capaian',pathway:'Audit Clinical Pathway · Hasil Capaian','clinical-death':'Audit Klinis dan Kematian · Hasil Capaian'} as Record<NonNullable<typeof qualityResultsView>,string>)[qualityResultsView]:clinicalPathwayOpen?'Audit Clinical Pathway · Form Logbook':qualityInitialContainer+' · Form Logbook'
  if(active==='safety')return ({overview:'Ringkasan Keselamatan',incidents:'Laporan IKP',investigation:'Investigasi / RCA',survey:'Survei Budaya Keselamatan',responses:'Rekapan Survei'} as Record<SafetyWorkspaceTab,string>)[safetyTab]
  if(active==='risk')return ({overview:'Ikhtisar Risiko',register:'Risk Register',mitigation:'RTP Terintegrasi',connections:'Konektor Risiko',fmea:'FMEA / HFMEA'} as Record<RiskWorkspaceTab,string>)[riskTab]
  if(active==='analytics')return ({programs:'Metadata · Program Kerja',profiles:'Metadata · Profil Indikator',directory:'Metadata · Direktori Induk SDM'} as Record<AnalyticsWorkspaceTab,string>)[analyticsTab]
  if(active==='settings')return 'Administrasi'
  return MODS.find(([id])=>id===active)?.[1]||'Workspace'
 },[active,clinicalPathwayOpen,qualityOppeOpen,qualityInitialContainer,qualityResultsView,safetyTab,riskTab,analyticsTab])
 const selectedQualityMode=qualityResultsView??(clinicalPathwayOpen?'pathway':qualityInitialContainer==='Audit Klinis dan Kematian'?'clinical-death':'indicators')
 const effectiveQualityRoomId=selectedQualityRoomId??(admin?null:room?.id??null)
 const contextNavigation=sidebarChildGroups[active]??[]
 const moduleLabel=active==='home'?'Halaman Utama':visibleMods.find(([id])=>id===active)?.[1]||'Workspace'
 const openMainModule=(id:string,keepMenuOpen=false)=>{
  // On phones, tapping a module that has sub-menus keeps the drawer open so the sub-menu can be chosen.
  setProfileFocus(0);if(!keepMenuOpen)mobileSidebar.close();setGlobalSearch('');setActive(id)
  if(id==='quality'){setQualityOppeOpen(false);setQualityInitialContainer('Audit Indikator Mutu');setClinicalPathwayOpen(false);setQualityResultsView(null);setQualityOpen(true)}
  else {setQualityOppeOpen(false);setQualityOpen(false);setClinicalPathwayOpen(false);setQualityResultsView(null)}
  if(id==='safety')setSafetyTab('incidents')
  if(id==='risk')setRiskTab('register')
  if(id==='analytics'){setAnalyticsTab(admin?'programs':'directory');setAnalyticsDirectoryTab(admin?'directory':'team')}
 }
 const selectSidebarChild=(moduleId:string,childId:string)=>{
  setProfileFocus(0);mobileSidebar.close();setGlobalSearch('');setActive(moduleId)
  if(moduleId==='quality'){
   if(childId==='oppe-fppe'){setQualityOppeOpen(true);setQualityResultsView(null);setClinicalPathwayOpen(false);setQualityOpen(false);return}
   setQualityOppeOpen(false)
   const resultMatch=/^result-(indicators|pathway|clinical-death)$/.exec(childId)
   if(resultMatch){
    const selectedAudit=resultMatch[1] as 'indicators'|'pathway'|'clinical-death'
    setQualityResultsView(selectedAudit)
    setQualityOpen(false)
    setClinicalPathwayOpen(false)
    setQualityInitialContainer(selectedAudit==='clinical-death'?'Audit Klinis dan Kematian':'Audit Indikator Mutu')
    return
   }
   const selectedAudit=childId==='clinical-pathway'?'pathway':childId.replace(/^(audit-|logbook-)/,'')
   if(!['indicators','pathway','clinical-death'].includes(selectedAudit))return
   setQualityResultsView(null)
   setClinicalPathwayOpen(selectedAudit==='pathway')
   setQualityOpen(selectedAudit!=='pathway')
   setQualityInitialContainer(selectedAudit==='clinical-death'?'Audit Klinis dan Kematian':'Audit Indikator Mutu')
  }else if(moduleId==='safety')setSafetyTab(childId as SafetyWorkspaceTab)
  else if(moduleId==='risk')setRiskTab(childId as RiskWorkspaceTab)
  else if(moduleId==='analytics')setAnalyticsTab(childId as AnalyticsWorkspaceTab)
 }
 const selectedSidebarChild=(moduleId:string)=>{
  if(moduleId==='home')return ''
  if(moduleId==='quality')return qualityOppeOpen?'oppe-fppe':qualityResultsView==='pathway'||clinicalPathwayOpen?'audit-pathway':qualityResultsView==='clinical-death'||qualityInitialContainer==='Audit Klinis dan Kematian'?'audit-clinical-death':'audit-indicators'
  if(moduleId==='safety')return safetyTab
  if(moduleId==='risk')return riskTab
  if(moduleId==='analytics')return analyticsTab
  return ''
 }
 const dispatchWorkspaceSearch=(query:string)=>{
  setGlobalSearch(query)
 }
 useEffect(()=>{
  if(typeof window==='undefined'||view!=='workspace')return
  window.dispatchEvent(new CustomEvent('aureka:workspace-search',{detail:{query:globalSearch,module:active,container:currentContainer}}))
 },[globalSearch,active,currentContainer,view])
 useEffect(()=>{
  if(!notificationHistoryOpen&&!supportOpen)return
  const dismiss=(event:KeyboardEvent|PointerEvent)=>{
   if(event instanceof KeyboardEvent){
    if(event.key!=='Escape')return
   }else if(event.target instanceof Element&&event.target.closest('.workspaceNotificationPanel,.workspaceSupportPanel,[data-workspace-popover-trigger]'))return
   setNotificationHistoryOpen(false);setSupportOpen(false)
  }
  document.addEventListener('keydown',dismiss)
  document.addEventListener('pointerdown',dismiss)
  return()=>{document.removeEventListener('keydown',dismiss);document.removeEventListener('pointerdown',dismiss)}
 },[notificationHistoryOpen,supportOpen])

 useEffect(()=>{
  if(typeof window==='undefined'||view!=='workspace'||!globalSearch.trim()){
   setSearchResults([])
   setSearchResultsQuery('')
   return
  }
  const query=globalSearch.trim()
  const delay=window.setTimeout(()=>{
   const root=document.querySelector<HTMLElement>('.moduleEnter[data-workspace-container]')
   if(!root){setSearchResults([]);setSearchResultsQuery(query);return}
   const tokens=query.toLowerCase().split(/\s+/).filter(Boolean)
   if(!tokens.length){setSearchResults([]);setSearchResultsQuery(query);return}
   // Search only record-like content already rendered in the active, authorized workspace.
   // This intentionally does not issue a new cross-module/database query.
   const candidates=Array.from(root.querySelectorAll<HTMLElement>(
    'table tbody tr:not(.aqInlineEditorRow),[data-searchable="true"],.rmTable tbody tr,.psTable tbody tr,.cpTable tbody tr,.stTable tbody tr,.cwTable tbody tr'
   )).filter(node=>{
    if(node.closest('.workspaceSearchResults')||node.closest('[aria-hidden="true"]'))return false
    const style=window.getComputedStyle(node)
    if(style.display==='none'||style.visibility==='hidden')return false
    if(node.matches('tr')&&node.querySelector('th'))return false
    const text=(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim().toLowerCase()
    return !!text&&tokens.every(token=>text.includes(token))
   })
   const unique:WorkspaceSearchResult[]=[]
   for(const node of candidates){
    const text=(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim()
    if(!text||unique.some(result=>result.node===node||result.text===text))continue
    unique.push({node,text:text.length>190?text.slice(0,187)+'…':text,tag:node.tagName.toLowerCase()==='tr'?'Catatan':(node.dataset.searchType||'Data')})
    if(unique.length>=8)break
   }
   setSearchResults(unique)
   setSearchResultsQuery(query)
  },120)
  return ()=>window.clearTimeout(delay)
 },[globalSearch,view,active,currentContainer,qualityOpen,clinicalPathwayOpen,safetyTab,riskTab,analyticsTab])
 const jumpToSearchResult=(result:WorkspaceSearchResult)=>{
  result.node.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})
  dispatchWorkspaceSearch('')
 }


 const triggerWorkspaceExport=()=>{
  const root=document.querySelector<HTMLElement>('.moduleEnter[data-workspace-container]')
  const candidates=Array.from(root?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')??[]).filter(button=>{
   const style=window.getComputedStyle(button)
   if(!button.getClientRects().length||style.display==='none'||style.visibility==='hidden'||button.closest('[aria-hidden="true"]'))return false
   const label=[button.innerText,button.getAttribute('aria-label'),button.getAttribute('title')].filter(Boolean).join(' ')
   return /\b(export|ekspor|download|unduh)\b/i.test(label)
  })
  if(candidates.length===0){
   pushWorkspaceNotification('Belum ada tombol ekspor yang tersedia pada modul aktif. Buka Statistik & Laporan atau ekspor dari workspace terkait.','info',currentContainer)
   return
  }
  if(candidates.length>1){
   pushWorkspaceNotification('Terdapat beberapa pilihan ekspor pada modul ini. Gunakan kontrol ekspor yang sesuai pada workspace untuk memilih jenis dan cakupan data. Tidak ada ekspor yang dijalankan.','info',currentContainer)
   return
  }
  candidates[0].click()
 }
 const focusWorkspaceUnitSelector=()=>{
  const root=document.querySelector<HTMLElement>('.moduleEnter[data-workspace-container]')
  const candidates=Array.from(root?.querySelectorAll<HTMLSelectElement>('select:not([disabled])')??[]).filter(select=>{
   const style=window.getComputedStyle(select)
   if(!select.getClientRects().length||style.display==='none'||style.visibility==='hidden'||select.closest('[aria-hidden="true"]'))return false
   const labels=Array.from(select.labels??[]).map(label=>label.innerText)
   const text=[select.getAttribute('aria-label'),select.getAttribute('name'),select.id,select.closest('label')?.innerText,...labels].filter(Boolean).join(' ')
   return /\b(unit|ruang|ruangan|room)\b/i.test(text)
  })
  if(candidates.length===0){
   pushWorkspaceNotification('Modul aktif tidak menyediakan pemilih unit. Pilihan unit hanya muncul pada workspace yang mendukung filter unit.','info',currentContainer)
   return
  }
  if(candidates.length>1){
   pushWorkspaceNotification('Modul aktif memiliki beberapa pemilih unit. Gunakan kontrol unit yang sesuai pada workspace; palette tidak memilih secara otomatis.','info',currentContainer)
   return
  }
  const target=candidates[0]
  target.focus()
  pushWorkspaceNotification('Pemilih unit difokuskan. Gunakan daftar pilihan untuk mengganti cakupan tampilan modul ini. Unit utama akun dan hak akses tidak diubah.','info',currentContainer)
 }
 const lastNoticeRef=useRef<{key:string;at:number;auth:number}>({key:'',at:0,auth:0})
 const pushWorkspaceNotification=(message:string,kind:'success'|'error'|'info'='info',module?:string)=>{
  let text=String(message||'').trim()
  if(!text)return
  const now=Date.now()
  // Banyak modul gagal bersamaan karena sesi/izin: cukup satu notifikasi ringkas.
  if(kind==='error'&&/tidak memiliki izin|akses ditolak|sesi (login|akses)|masuk kembali/i.test(text)){
   if(now-lastNoticeRef.current.auth<20000)return
   lastNoticeRef.current.auth=now
   text='Sesi login berakhir atau akses ditolak, sehingga beberapa modul gagal memuat data. Muat ulang halaman atau masuk kembali.'
   module='Sesi'
  }
  const key=(module||'')+'|'+text
  if(key===lastNoticeRef.current.key&&now-lastNoticeRef.current.at<30000)return
  lastNoticeRef.current.key=key;lastNoticeRef.current.at=now
  const item:WorkspaceNotification={id:Date.now()+Math.floor(Math.random()*1000),message:text,kind,createdAt:Date.now(),module}
  setNotifications(current=>[item,...current].slice(0,40))
  setActiveToast(item)
 }
 useEffect(()=>{
  const receive=(event:Event)=>{
   const detail=(event as CustomEvent<{message?:string;type?:string;kind?:string;module?:string}>).detail
   const text=String(detail?.message??'').trim()
   if(!text)return
   const rawKind=String(detail?.kind??detail?.type??'').toLowerCase()
   const technicalFallback=`Operasi pada ${detail?.module||'AUREKA'} belum berhasil. Periksa koneksi dan hak akses, lalu coba kembali.`
   const sanitizedText=sanitizeNotificationText(text,technicalFallback)
   const containsTechnicalDetail=sanitizedText!==text
   const kind:WorkspaceNotification['kind']=rawKind==='error'||containsTechnicalDetail||/\b(gagal|belum tersimpan|tidak dapat|kesalahan|wajib diisi|tidak diizinkan|periksa koneksi|permission denied|failed to fetch|network error)\b/i.test(text)?'error':rawKind==='success'||/berhasil (disimpan|dihapus|diperbarui|dikirim)|tersimpan ke server/i.test(text)?'success':'info'
   const safeText=kind==='error'?sanitizedText:text
   pushWorkspaceNotification(safeText,kind,detail?.module)
  }
  window.addEventListener('aureka:notification',receive)
  return()=>window.removeEventListener('aureka:notification',receive)
 },[])
 useEffect(()=>{
  if(!activeToast)return
  const timer=window.setTimeout(()=>setActiveToast(current=>current?.id===activeToast.id?null:current),5000)
  return()=>window.clearTimeout(timer)
 },[activeToast])
 useEffect(()=>{
  if(view==='workspace'&&message.trim())pushWorkspaceNotification(message,/\b(gagal|belum|tidak dapat|kesalahan|wajib|periksa)\b/i.test(message)?'error':'info',currentContainer)
 },[message,view])
 const loadSupportConversations=async()=>{
  setSupportLoading(true)
  setSupportLoadError('')
  try{
   const {data:{user:authUser},error:authError}=await sb.auth.getUser()
   if(authError||!authUser)throw authError||new Error('Sesi login tidak tersedia.')
   let request:any=sys().from('support_conversations').select('id,room_id,created_by,subject,status,created_at,updated_at').order('created_at',{ascending:false}).limit(50)
   const {data,error}=await request
   if(error)throw error
   const list=(data??[]) as SupportConversation[]
   setSupportConversations(list)
   setSupportConversationId(current=>current&&list.some(item=>item.id===current)?current:(list[0]?.id??''))
  }catch(error){
   const message=toUserFacingError(error,{fallback:'Daftar percakapan belum dapat dimuat. Periksa koneksi, lalu coba kembali.'})
   setSupportLoadError(message)
   pushWorkspaceNotification(message,'error','Chat Super Admin')
  }finally{setSupportLoading(false)}
 }
 const loadSupportMessages=async(conversationId:string)=>{
  if(!conversationId){setSupportMessages([]);setSupportMessagesError('');setSupportMessagesLoading(false);return}
  setSupportMessagesLoading(true)
  setSupportMessagesError('')
  try{
   const {data,error}=await sys().from('support_messages').select('id,conversation_id,sender_id,body,created_at').eq('conversation_id',conversationId).order('created_at',{ascending:true}).limit(300)
   if(error)throw error
   setSupportMessages((data??[]) as SupportMessage[])
  }catch(error){
   const message=toUserFacingError(error,{fallback:'Pesan percakapan belum dapat dimuat. Coba muat ulang.'})
   setSupportMessagesError(message)
   pushWorkspaceNotification(message,'error','Chat Super Admin')
  }finally{setSupportMessagesLoading(false)}
 }
 const openSupportChat=(tab:'admin'|'ai'|'broadcast'='admin')=>{
  setNotificationHistoryOpen(false)
  setSupportTab(tab)
  setSupportOpen(true)
  if(tab==='admin')void loadSupportConversations()
 }
 const sendMassAnnouncement=async()=>{
  const body=broadcastDraft.trim()
  if(!admin){pushWorkspaceNotification('Pengumuman massal hanya dapat dikirim oleh Super Admin.','error','Pengumuman');return}
  if(!body||broadcastSending)return
  if(body.length>4000){pushWorkspaceNotification('Pengumuman maksimal 4.000 karakter.','error','Pengumuman');return}
  setBroadcastSending(true)
  try{
   const {data,error}=await sys().rpc('send_mass_room_announcement',{p_body:body})
   if(error)throw error
   const count=Number(data||0)
   setBroadcastDraft('')
   pushWorkspaceNotification('Pengumuman berhasil dikirim ke '+count+' ruangan.','success','Pengumuman Massal')
  }catch(error){pushWorkspaceNotification(toUserFacingError(error,{fallback:'Pengumuman massal belum terkirim. Periksa izin database dan coba kembali.'}),'error','Pengumuman Massal')}
  finally{setBroadcastSending(false)}
 }
 const sendSupportMessage=async()=>{
  const body=supportDraft.trim()
  if(!body||supportSending)return
  if(body.length>4000){pushWorkspaceNotification('Pesan maksimal 4.000 karakter.','error','Chat Super Admin');return}
  setSupportSending(true)
  try{
   const {data:{user:authUser},error:authError}=await sb.auth.getUser()
   if(authError||!authUser)throw authError||new Error('Sesi login tidak tersedia.')
   let conversationId=supportConversationId
   if(!admin&&!conversationId){
    if(!room?.id)throw new Error('Akun belum memiliki unit kerja yang dapat dihubungi.')
    const {data:conversation,error}=await sys().from('support_conversations').insert({room_id:room.id,created_by:authUser.id,subject:'Bantuan Super Admin'}).select('id,room_id,created_by,subject,status,created_at,updated_at').single()
    if(error)throw error
    conversationId=String(conversation.id)
    setSupportConversationId(conversationId)
    setSupportConversations(current=>[conversation as SupportConversation,...current.filter(item=>item.id!==conversationId)])
   }
   if(!conversationId)throw new Error('Pilih percakapan yang akan dibalas.')
   const {error}=await sys().from('support_messages').insert({conversation_id:conversationId,sender_id:authUser.id,body})
   if(error)throw error
   setSupportDraft('')
   await loadSupportMessages(conversationId)
   await loadSupportConversations()
   pushWorkspaceNotification('Pesan berhasil dikirim ke Chat Super Admin.','success','Chat Super Admin')
  }catch(error){
   pushWorkspaceNotification(toUserFacingError(error,{fallback:'Pesan belum terkirim. Periksa koneksi, lalu coba kembali.'}),'error','Chat Super Admin')
  }finally{setSupportSending(false)}
 }
 useEffect(()=>{
  if(supportOpen&&supportConversationId)void loadSupportMessages(supportConversationId)
  else setSupportMessages([])
 },[supportOpen,supportConversationId])

 useEffect(()=>{if(!manager&&MANAGER_ONLY_MODULES.includes(active))setActive('home')},[manager,active])
 const title=useMemo(()=>MODS.find(([id])=>id===active)?.[1]||(active==='home'?'Halaman Utama':'Workspace'),[active])
 if(view==='force-password')return <main className="authPage authRedesigned"><header className="authTopbar"><div className="brand">{logo()}<div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div></header><div className="landingAura" aria-hidden="true"><span/><span/><span/></div><div className="authShell authShellSingle"><LiquidGlass className="authCard"><div className="authLogo">{logo()}</div><div className="eyebrow authEyebrow">AUREKA · Keamanan akun</div><h1>Ganti password awal</h1><p>Akun ini wajib menggunakan password baru sebelum Anda dapat membuka workspace. Password awal hanya berlaku untuk masuk pertama kali.</p><div className="authAlert" role="note"><b>Username:</b> {profile?.username||username||'akun unit'}<br/><b>Unit:</b> {room?.name||'unit yang ditetapkan'}<br/>Gunakan password baru minimal 12 karakter dan jangan gunakan password yang sama dengan akun lain.</div><form onSubmit={e=>{e.preventDefault();saveFirstPassword()}} noValidate><div className="field"><label htmlFor="firstPassword">Password baru</label><div className="pwWrap"><input id="firstPassword" type={showPw?'text':'password'} autoComplete="new-password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimal 12 karakter" required/><button type="button" className="pwToggle" onClick={()=>setShowPw(v=>!v)}>{showPw?'Sembunyikan':'Lihat'}</button></div></div><div className="field"><label htmlFor="firstPassword2">Konfirmasi password baru</label><input id="firstPassword2" type={showPw?'text':'password'} autoComplete="new-password" minLength={12} value={password2} onChange={e=>setPassword2(e.target.value)} placeholder="Ketik ulang password baru" required/></div>{message&&<div className="authAlert" role="alert">{message}</div>}<button type="submit" className="landingCta big authWide" disabled={busy}>{busy?'Menyimpan password…':'Simpan password baru'} {!busy&&<span aria-hidden="true">→</span>}</button></form><button type="button" className="authBack" style={{position:'static',marginTop:16}} onClick={logout} disabled={busy}>Keluar dari akun</button></LiquidGlass></div></main>
 if(view==='login'&&authMode!=='normal'){const rec=authMode==='recovery';return <main className="authPage authRedesigned"><header className="authTopbar"><div className="brand">{logo()}<div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div></header>
  <div className="landingAura" aria-hidden="true"><span/><span/><span/></div>
  {!rec&&<button type="button" className="authBack" onClick={()=>{setMessage('');setResetSent(false);setAuthMode('normal')}}><span aria-hidden="true">←</span> Kembali ke login</button>}
  <div className="authShell authShellSingle">
   <LiquidGlass className="authCard">
    {!rec&&resetSent?<div className="authSuccess">
     <div className="authSuccessIcon" aria-hidden="true">✉</div>
     <h1>Cek email Anda</h1>
     <p>Jika akun <b>{email.trim()}</b> terdaftar di AUREKA, tautan untuk membuat password baru sudah dikirim.</p>
     <ol className="authSteps">
      <li><b>Buka email</b><span>Cari email dari AUREKA. Cek juga folder Spam/Promosi.</span></li>
      <li><b>Klik tautan reset</b><span>Anda akan dibawa kembali ke AUREKA untuk membuat password baru.</span></li>
      <li><b>Tidak menerima email?</b><span>Hubungi Super Admin/Komite PMKP untuk dibuatkan password sementara.</span></li>
     </ol>
     <button type="button" className="landingCta big authWide" onClick={()=>{setResetSent(false);setMessage('');setAuthMode('normal')}}>Kembali ke login <span aria-hidden="true">→</span></button>
    </div>:<form onSubmit={(e)=>{e.preventDefault();rec?saveNewPassword():sendReset()}} noValidate>
     <div className="authLogo">{logo()}</div>
     <div className="eyebrow authEyebrow">AUREKA WORKSPACE</div>
     <h1>{rec?'Buat password baru':'Lupa password'}</h1>
     <p>{rec?'Masukkan password baru untuk akun Anda.':'Masukkan username atau email akun. Jika akun memiliki email, tautan reset akan dikirim ke sana. Untuk akun unit tanpa email, hubungi Super Admin.'}</p>
     {rec?<>
      <div className="field"><label htmlFor="newPassword">Password baru</label><div className="pwWrap"><input id="newPassword" type={showPw?'text':'password'} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimal 8 karakter"/><button type="button" className="pwToggle" onClick={()=>setShowPw(v=>!v)} aria-label={showPw?'Sembunyikan password':'Tampilkan password'}>{showPw?'Sembunyikan':'Lihat'}</button></div></div>
      <div className="field"><label htmlFor="newPassword2">Ulangi password baru</label><input id="newPassword2" type={showPw?'text':'password'} autoComplete="new-password" value={password2} onChange={e=>setPassword2(e.target.value)} placeholder="Ketik ulang password baru"/></div>
     </>:<div className="field"><label htmlFor="forgotEmail">Username atau email</label><input id="forgotEmail" type="text" autoCapitalize="none" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="pic.isolasi atau nama@email.com"/></div>}
     {message&&<div className="authAlert" role="alert">{message}</div>}
     <button type="submit" className="landingCta big authWide" disabled={busy}>{busy?'Memproses…':rec?'Simpan password baru':'Kirim tautan reset'} {!busy&&<span aria-hidden="true">→</span>}</button>
     {!rec&&<div className="authSwitch">Ingat password? <button type="button" onClick={()=>{setMessage('');setAuthMode('normal')}}>Masuk di sini</button></div>}
    </form>}
   </LiquidGlass>
  </div>
 </main>}
 if(view==='login'||view==='signup'){
  const l=view==='login'
  const submit=(e:any)=>{e.preventDefault();l?login():signup()}
  return <main className="authPage authRedesigned authProfessional">
   <header className="authTopbar">
    <div className="brand">
     {logo()}
     <div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div>
    </div>
    <div className="authTopbarMeta">
     <span className="authSecureDot" aria-hidden="true"/>
     <span>PORTAL INTERNAL · RSUD SSMA</span>
    </div>
   </header>
   <div className="landingAura" aria-hidden="true"><span/><span/><span/></div>
   <button type="button" className="authBack" onClick={()=>{setMessage('');setSignupDone(false);setView('public')}}>
    <span aria-hidden="true">←</span> Kembali ke beranda
   </button>
   <div className={'authShell '+(!l?'authShellRegistration':'')}>
    <aside className="authAside">
     <span className="authAsideEyebrow">BERSAMA, MENINGKATKAN KUALITAS PELAYANAN</span>
     <h2>{l?'Setiap perbaikan dimulai dari Anda.':'Peran Anda. Dampak yang lebih besar.'}</h2>
     
     
     <div className="authAsideBottom">
      <span className="authAsideBottomMark" aria-hidden="true">A</span>
      <small>UPT RSUD Sultan Syarif Mohamad Alkadrie<br/>Komite Peningkatan Mutu dan Keselamatan Pasien</small>
     </div>
     <figure className="authArchitecture"><img src={`${BASE_PATH}/images/architecture-joel-filipe.jpg`} alt="Ilustrasi arsitektur bangunan modern, bukan foto RSUD" loading="lazy" /><figcaption>Ruang untuk tumbuh. Komitmen untuk terus membaik.<small>Ilustrasi arsitektur · Joel Filipe / Unsplash</small></figcaption></figure>
    </aside>
    <LiquidGlass className="authCard">
     {!l&&signupDone?<div className="authSuccess">
      <div className="authSuccessIcon" aria-hidden="true">✓</div>
      <span className="authFormEyebrow">REGISTRASI AKUN UNIT</span>
      <h1>Akun berhasil dibuat</h1>
      <p>Akun <b>{email.trim()}</b> untuk unit <b>{roomsList.find(r=>String(r.id)===String(signupRoom))?.name||'-'}</b> sudah terdaftar dan sedang <b>menunggu aktivasi</b>.</p>
      <ol className="authSteps">
       <li><b>Verifikasi email</b><span>Buka email <i className="authStrong">{email.trim()}</i> dan klik tautan verifikasi (cek juga folder Spam).</span></li>
       <li><b>Aktivasi oleh Komite PMKP</b><span>Super Admin akan memeriksa unit dan mengaktifkan akun Anda.</span></li>
       <li><b>Masuk ke workspace</b><span>Setelah aktif, login dengan username <i className="authStrong">{username||'-'}</i> (atau email) dan password Anda.</span></li>
      </ol>
      <button type="button" className="landingCta big authWide" onClick={()=>{setSignupDone(false);setMessage('');setPassword('');setView('login')}}>Ke halaman login <span aria-hidden="true">→</span></button>
     </div>:<form className="authForm" onSubmit={submit} noValidate>
      <div className="authFormIntro">
       <span className="authAccessMark" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></span>
       <span className="authFormEyebrow">{l?'AKSES WORKSPACE':'REGISTRASI PENGGUNA'}</span>
       <h1>{l?'Selamat datang kembali.':'Daftar Akun Unit'}</h1>
       <p>{l?'Masuk ke AUREKA dan lanjutkan langkah perbaikan Anda.':'Lengkapi identitas dan unit kerja. Pengajuan akun akan diperiksa sebelum aktivasi.'}</p>
      </div>
      
      {!l&&<>
       <div className="field">
        <label htmlFor="fullName">Nama lengkap</label>
        <input id="fullName" autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nama sesuai identitas pegawai"/>
       </div>
       <div className="field">
        <label htmlFor="signupRoom">Ruangan / unit</label>
        <select id="signupRoom" value={signupRoom} onChange={e=>setSignupRoom(e.target.value)}>
         <option value="">Pilih unit kerja</option>
         {roomsList.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
       </div>
       <div className="field">
        <label htmlFor="username">Username</label>
        <input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/\s+/g,'.'))} placeholder="contoh: pic.isolasi"/>
        <small className="fieldHint">Huruf kecil, angka, titik, garis bawah, atau strip.</small>
       </div>
      </>}
      <div className="field">
       <label htmlFor="email">{l?'Username atau email':'Email aktif'}</label>
       <input id="email" type={l?'text':'email'} autoComplete={l?'username':'email'} autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder={l?'Masukkan username atau email':'nama@email.com'}/>
       {!l&&<small className="fieldHint">Email digunakan untuk verifikasi akun dan pemulihan password.</small>}
      </div>
      <div className="field authPasswordField">
       <div className="authFieldLabelRow">
        <label htmlFor="password">Password</label>
        {l&&<button type="button" className="authForgot" onClick={()=>{setMessage('');setResetSent(false);setAuthMode('forgot')}}>Lupa password?</button>}
       </div>
       <div className="pwWrap">
        <input id="password" type={showPw?'text':'password'} autoComplete={l?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={l?'Masukkan password':'Minimal 8 karakter'}/>
        <button type="button" className="pwToggle" onClick={()=>setShowPw(v=>!v)} aria-label={showPw?'Sembunyikan password':'Tampilkan password'}>{showPw?'Sembunyikan':'Tampilkan'}</button>
       </div>
      </div>
      {authInfo&&<div className="authAlert ok" role="status">{authInfo}</div>}
      {message&&<div className={/tersimpan|dikirim ulang/.test(message)?'authAlert ok':'authAlert'} role="alert">{message}</div>}
      {l&&needVerify&&<button type="button" className="authResend" disabled={busy} onClick={resendVerify}>Kirim ulang email verifikasi</button>}
      <button type="submit" className="landingCta big authWide" disabled={busy}>
       {busy?(l?'Memeriksa akun…':'Mengirim pendaftaran…'):l?'Masuk ke Workspace':'Kirim Pendaftaran'}
       {!busy&&<span aria-hidden="true">→</span>}
      </button>
      <div className="authSwitch">
       {l?'Belum memiliki akun unit?':'Sudah memiliki akun?'}
       <button type="button" onClick={()=>{setMessage('');setView(l?'signup':'login')}}>{l?'Daftar akun unit':'Masuk di sini'}</button>
      </div>
      <div className="authFormFootnote">
       <span aria-hidden="true">⌑</span>
       <p>{l?'Akses hanya untuk pengguna yang telah memiliki akun dan kewenangan.':'Akun baru dapat digunakan setelah verifikasi dan aktivasi oleh Komite PMKP.'}</p>
      </div>
     </form>}
    </LiquidGlass>
   </div>
  </main>
 }
 if(view==='workspace')return <main data-aureka-theme="solid-white" data-density="comfortable" className={'workspaceRoot workspaceDesk '+(sidebarCollapsed?'sidebarIsCollapsed':'')}>
 <button type="button" className="workspaceSkipLink" onClick={()=>{const content=document.getElementById('workspace-main-content');content?.focus();content?.scrollIntoView({block:'start'})}}>Lewati navigasi ke area kerja</button>
 <button type="button" className="workspaceScrim" onClick={mobileSidebar.close} data-open={mobileSidebar.isOpen} aria-label="Tutup navigasi" aria-hidden="true" tabIndex={-1}/>
 <aside id="aureka-primary-sidebar" ref={mobileSidebar.panelRef} className={'sidebar glassPanel '+(mobileSidebar.isOpen?'mobileOpen':'')} aria-label="Navigasi utama AUREKA" role={mobileSidebar.isOpen?'dialog':undefined} aria-modal={mobileSidebar.isOpen?true:undefined} tabIndex={-1}>
  <div className="sideHeader">
   <div className="sideBrand">{logo('workspaceLogo')}<div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div>
   <button type="button" className="workspaceDrawerClose" aria-label="Tutup menu navigasi" onClick={mobileSidebar.close}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
  </div>
  <div className="navLabel">Menu utama</div>
  <nav className="sidebarNav" aria-label="Navigasi utama AUREKA">
   <div className={'sidebarNavGroup '+(active==='home'?'expanded':'')} key="home">
    <button type="button" title="Halaman Utama" className={active==='home'?'navActive':''} aria-current={active==='home'?'page':undefined} onClick={()=>openMainModule('home')}>
     <NavIcon id="home"/><span>Halaman Utama</span>
    </button>
   </div>
   {visibleMods.map(([id,n])=>{const hasKids=Boolean(sidebarChildGroups[id]?.length);const groupOpen=active===id&&!closedNav.includes(id);return <div className={'sidebarNavGroup '+(active===id?'isCurrent ':'')+(groupOpen?'expanded':'')} key={id}>
    <button type="button" title={n} className={active===id?'navActive':''} aria-expanded={hasKids?groupOpen:undefined} aria-controls={hasKids?`sidebar-children-${id}`:undefined} aria-current={active===id?'page':undefined} onClick={()=>{if(hasKids&&active===id){toggleNav(id);return}toggleNav(id,true);openMainModule(id,hasKids)}}>
     <NavIcon id={id}/><span>{n}</span>{sidebarChildGroups[id]?.length?<span className="sidebarChevron" aria-hidden="true">⌄</span>:null}
    </button>
    {hasKids?<div className="sidebarTreeChildren" id={`sidebar-children-${id}`} hidden={!groupOpen}>
     {sidebarChildGroups[id].map(child=>child.children?.length
      ? (()=>{const pActive=Boolean(qualityResultsView===child.id.replace('audit-','')||(clinicalPathwayOpen&&child.id==='audit-pathway')||(!qualityResultsView&&!clinicalPathwayOpen&&qualityInitialContainer==='Audit Klinis dan Kematian'&&child.id==='audit-clinical-death')||(!qualityResultsView&&!clinicalPathwayOpen&&qualityInitialContainer!=='Audit Klinis dan Kematian'&&child.id==='audit-indicators'));const nKey='n:'+child.id;const nOpen=!closedNav.includes(nKey);return <div className={'sidebarNestedGroup '+(nOpen?'open':'closed')} key={child.id}>
         <button type="button" className={'sidebarChild sidebarTreeParent '+(pActive?'active':'')} aria-expanded={nOpen} aria-controls={`sidebar-children-${id}-${child.id}`} aria-current={pActive?'page':undefined} onClick={()=>{if(pActive){toggleNav(nKey);return}toggleNav(nKey,true);selectSidebarChild(id,child.id)}}>
          <span className="sidebarChildMark" aria-hidden="true"/><span>{child.label}</span><span className="sidebarChevron" aria-hidden="true">⌄</span>
         </button>
         <div className="sidebarTreeChildren sidebarTreeNestedChildren" id={`sidebar-children-${id}-${child.id}`} hidden={!nOpen}>
          {child.children.map(nested=><button type="button" key={nested.id} className={selectedSidebarChild(id)===nested.id?'sidebarChild active':'sidebarChild'} aria-current={selectedSidebarChild(id)===nested.id?'page':undefined} onClick={()=>selectSidebarChild(id,nested.id)}>
           <span className="sidebarChildMark" aria-hidden="true"/><span>{nested.label}</span>
          </button>)}
         </div>
        </div>})()
      : <button type="button" key={child.id} className={selectedSidebarChild(id)===child.id?'sidebarChild active':'sidebarChild'} aria-current={selectedSidebarChild(id)===child.id?'page':undefined} onClick={()=>selectSidebarChild(id,child.id)}>
         <span className="sidebarChildMark" aria-hidden="true"/><span>{child.label}</span>
        </button>)}
    </div>:null}
   </div>})}
  </nav>
  <div className="sidebarFooter">
   <LiquidGlassButton onClick={logout}><span className="logoutIcon">↪</span><span className="logoutLabel">Logout</span></LiquidGlassButton>
  </div>
 </aside>
 <section className="workspaceContent">
  <header className="workspaceHeaderBar">
   <button type="button" ref={mobileSidebar.triggerRef} className="mobileMenuButton workspaceSidebarMenuButton" onClick={()=>{if(typeof window!=='undefined'&&window.matchMedia('(max-width: 720px)').matches){mobileSidebar.open()}else{setSidebarCollapsed(v=>!v)}}} aria-label={sidebarCollapsed?'Lebarkan sidebar':'Ciutkan sidebar'} title={sidebarCollapsed?'Lebarkan sidebar':'Ciutkan sidebar'} aria-controls="aureka-primary-sidebar" aria-expanded={mobileSidebar.isOpen||!sidebarCollapsed}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
   <div className="workspaceContext" title={(manager?'Seluruh rumah sakit':room?.name||'Unit belum dipetakan')+' · '+currentContainer}>
    <strong>{manager?"Seluruh rumah sakit":room?.name||"Unit belum dipetakan"}</strong>
    <span>{currentContainer}</span>
   </div>

   <div className="workspaceGlobalSearch" onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();dispatchWorkspaceSearch('');document.getElementById('workspaceGlobalSearchInput')?.focus();return}
    if(!['ArrowDown','ArrowUp'].includes(event.key))return
    const options=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    if(!options.length)return
    const index=options.indexOf(event.target as HTMLButtonElement)
    if(index<0&&!(event.target instanceof HTMLInputElement))return
    event.preventDefault()
    options[event.key==='ArrowDown'?(index+1)%options.length:index<0?options.length-1:(index+options.length-1)%options.length].focus()
   }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2"/><path d="m15.4 15.4 4.2 4.2"/></svg>
    <input id="workspaceGlobalSearchInput" type="search" role="combobox" aria-autocomplete="list" aria-expanded={Boolean(globalSearch.trim())} aria-controls={globalSearch.trim()?'workspace-search-results':undefined} value={globalSearch} onChange={e=>dispatchWorkspaceSearch(e.target.value)} placeholder="Cari data dalam modul ini…" aria-label="Cari catatan atau data yang sudah diinput"/>
    {globalSearch?<button type="button" className="workspaceSearchClear" onClick={()=>dispatchWorkspaceSearch('')} aria-label="Hapus pencarian">×</button>:null}
    {globalSearch.trim()&&<div id="workspace-search-results" className="workspaceSearchResults" role="listbox" aria-label="Hasil pencarian">
     <div className="workspaceSearchResultsHead"><b>Hasil dalam {currentContainer}</b><span>{searchResultsQuery===globalSearch.trim()?searchResults.length+' hasil':'Mencari…'}</span></div>
     {searchResults.length?searchResults.map((result,index)=><button type="button" role="option" aria-selected="false" key={index+'-'+result.text} onClick={()=>jumpToSearchResult(result)}>
      <span className="workspaceSearchResultTag">{result.tag}</span><span>{result.text}</span><span className="workspaceSearchResultArrow" aria-hidden="true">↗</span>
     </button>):<p>Tidak ditemukan kata kunci yang cocok pada kontainer ini.</p>}
    </div>}
   </div>
   <button type="button" className="workspaceHeaderIcon workspaceThemeButton" title={uiMode==='terang'?'Ganti ke tema gelap':'Ganti ke tema terang'} aria-label={uiMode==='terang'?'Ganti ke tema gelap':'Ganti ke tema terang'} aria-pressed={uiMode==='gelap'} onClick={toggleUiMode}>
    {uiMode==='terang'?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>:<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>}
   </button>
   <button type="button" className="workspaceHeaderIcon workspaceFullscreenButton" title="Layar penuh" aria-label="Aktifkan atau keluar dari layar penuh" onClick={()=>{if(typeof document==='undefined')return;if(document.fullscreenElement){void document.exitFullscreen().catch(()=>undefined)}else if(document.documentElement.requestFullscreen){void document.documentElement.requestFullscreen().catch(()=>undefined)}}}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/></svg>
   </button>
   <button type="button" className="workspaceHeaderIcon" data-workspace-popover-trigger="notifications" title="Riwayat notifikasi" aria-label="Riwayat notifikasi" aria-expanded={notificationHistoryOpen} onClick={()=>{setNotificationHistoryOpen(v=>!v);setSupportOpen(false)}}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>{notifications.length>0&&<span className="workspaceHeaderBadge">{notifications.length>9?'9+':notifications.length}</span>}
   </button>
    <button type="button" className="workspaceHeaderIcon workspaceCommunicationTrigger" data-workspace-popover-trigger="support" title="Tanya AUREKA · Komunikasi" aria-label="Buka pusat komunikasi AUREKA" aria-expanded={supportOpen} onClick={()=>openSupportChat('ai')}>
     <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 14.2 8l5.1 2-5.1 2L12 17.2 9.8 12 4.7 10l5.1-2z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
    </button>

   <button type="button" className="workspaceHeaderProfile" title="Buka profil dan pengaturan akun" aria-label="Buka profil dan pengaturan akun" onClick={()=>{setProfileFocus(Date.now());setActive('settings');setQualityOpen(false);setClinicalPathwayOpen(false);setGlobalSearch('');setNotificationHistoryOpen(false);setSupportOpen(false);mobileSidebar.close()}}>
    <span className="workspaceHeaderAvatar">{initials(profile?.full_name||user?.email)}</span>
    <span className="workspaceHeaderProfileText"><b>{profile?.full_name||user?.email||'Pengguna'}</b><small>{ROLE_LABEL[role||'']||role||'Pengguna'}</small></span>
   </button>
  </header>
  {/* Tombol mengambang Tanya AUREKA di pojok kanan bawah (selain tab AI di pusat komunikasi & panel di Halaman Utama) */}
  <TanyaAureka sb={sb} page={currentContainer}/>
  {activeToast&&<div className={'dynamicIslandToast '+activeToast.kind} role={activeToast.kind==='error'?'alert':'status'}>
   <span className="dynamicIslandIcon">{activeToast.kind==='error'?'!':activeToast.kind==='success'?'✓':'i'}</span>
   <div className="dynamicIslandText"><strong>{activeToast.kind==='error'?'Perlu perhatian':activeToast.kind==='success'?'Berhasil':'Informasi'}</strong><span>{activeToast.message}</span></div>
   <button type="button" aria-label="Tutup notifikasi" onClick={()=>setActiveToast(null)}>×</button>
  </div>}
  {notificationHistoryOpen&&<section className="workspaceNotificationPanel" aria-label="Riwayat notifikasi">
   <div className="workspacePopoverHead"><div><strong>Riwayat notifikasi</strong><span>{notifications.length} notifikasi sesi ini</span></div><button type="button" aria-label="Tutup riwayat" onClick={()=>setNotificationHistoryOpen(false)}>×</button></div>
   {notifications.length===0?<div className="workspacePopoverEmpty">Belum ada notifikasi.</div>:<div className="workspaceNotificationList">{notifications.map(item=><article key={item.id} className={'workspaceNotificationItem '+item.kind}><span className="workspaceNotificationDot"/><div><strong>{item.module||'AUREKA'}</strong><p>{item.message}</p><time>{new Date(item.createdAt).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</time></div></article>)}</div>}
   {notifications.length>0&&<button type="button" className="workspaceClearHistory" onClick={()=>setNotifications([])}>Hapus riwayat sesi</button>}
  </section>}
  {supportOpen&&<section className="workspaceSupportPanel workspaceCommunicationPanel" aria-label="Pusat komunikasi AUREKA">
   <div className="workspacePopoverHead"><div><strong>Pusat Komunikasi</strong><span>{admin?'Komunikasi seluruh rumah sakit':(room?.name||'Unit belum dipetakan')}</span></div><div className="workspacePopoverActions"><button type="button" aria-label="Tutup pusat komunikasi" onClick={()=>setSupportOpen(false)}>×</button></div></div>
   <nav className="workspaceCommunicationTabs" role="tablist" aria-label="Jenis komunikasi">
    <button type="button" role="tab" aria-selected={supportTab==='admin'} className={supportTab==='admin'?'selected':''} onClick={()=>{setSupportTab('admin');void loadSupportConversations()}}>Chat Admin</button>
    <button type="button" role="tab" aria-selected={supportTab==='ai'} className={supportTab==='ai'?'selected':''} onClick={()=>setSupportTab('ai')}>Chat AI</button>
    {admin&&<button type="button" role="tab" aria-selected={supportTab==='broadcast'} className={supportTab==='broadcast'?'selected':''} onClick={()=>setSupportTab('broadcast')}>Semua Ruangan</button>}
   </nav>
   {supportTab==='admin'&&<>
    {supportLoading&&<AsyncStatePanel state="loading" title="Memuat percakapan" description="Mengambil daftar percakapan Anda." compact/>}
    {supportLoadError&&<AsyncStatePanel state="error" title="Percakapan belum dapat dimuat" description={supportLoadError} retrying={supportLoading} onRetry={()=>void loadSupportConversations()} compact/>}
    {!supportLoading&&!supportLoadError&&<div className="workspaceSupportInbox">{supportConversations.map(item=><button type="button" key={item.id} className={supportConversationId===item.id?'selected':''} onClick={()=>setSupportConversationId(item.id)}><strong>{roomsList.find(r=>Number(r.id)===Number(item.room_id))?.name||'Unit '+item.room_id}</strong><span>{item.subject}</span></button>)}{supportConversations.length===0&&<AsyncStatePanel state="empty" title="Belum ada percakapan" description="Mulai percakapan dengan Super Admin atau tunggu pengumuman dari rumah sakit." compact/>}</div>}
    {!admin&&!supportConversationId&&!supportLoading&&!supportLoadError&&<AsyncStatePanel state="empty" title="Belum ada percakapan" description="Kirim pesan untuk memulai percakapan dengan Super Admin." compact/>}
    {!supportConversationId&&!supportLoading&&!supportLoadError&&supportConversations.length>0&&<div className="workspacePopoverEmpty">Pilih percakapan untuk membaca pesan. Anda juga dapat memulai percakapan baru melalui kotak pesan.</div>}
    {supportConversationId&&<div className="workspaceSupportMessages">{supportMessagesLoading?<AsyncStatePanel state="loading" title="Memuat pesan" description="Mengambil isi percakapan." compact/>:supportMessagesError?<AsyncStatePanel state="error" title="Pesan belum dapat dimuat" description={supportMessagesError} retrying={supportMessagesLoading} onRetry={()=>void loadSupportMessages(supportConversationId)} compact/>:supportMessages.length===0?<AsyncStatePanel state="empty" title="Belum ada pesan" description="Percakapan ini belum memiliki pesan." compact/>:supportMessages.map(item=><div key={item.id} className={'workspaceSupportMessage '+(item.sender_id===user?.id?'mine':'theirs')}><span>{item.sender_id===user?.id?(admin?'Super Admin':'Anda'):(admin?'PIC Unit':'Super Admin')}</span><p>{item.body}</p><time>{new Date(item.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</time></div>)}</div>}
    <form className="workspaceSupportComposer" onSubmit={event=>{event.preventDefault();void sendSupportMessage()}}><textarea value={supportDraft} onChange={event=>setSupportDraft(event.target.value)} rows={2} maxLength={4000} placeholder="Tulis pesan kepada Super Admin…" aria-label="Pesan ke Super Admin" disabled={supportSending||(admin&&!supportConversationId)}/><button type="submit" disabled={supportSending||!supportDraft.trim()||(admin&&!supportConversationId)}>{supportSending?'Mengirim…':'Kirim'}</button></form>
   </>}
   {supportTab==='ai'&&<div className="workspaceCommunicationAi"><TanyaAureka sb={sb} page={currentContainer} embedded/></div>}
   {supportTab==='broadcast'&&admin&&<div className="workspaceBroadcastPanel"><div className="workspaceBroadcastIntro"><strong>Pengumuman ke seluruh ruangan</strong><span>Pesan akan dikirim ke {roomsList.length} ruangan aktif melalui kanal komunikasi unit.</span></div><textarea value={broadcastDraft} onChange={event=>setBroadcastDraft(event.target.value)} rows={7} maxLength={4000} placeholder="Tulis pengumuman resmi untuk seluruh ruangan…" aria-label="Isi pengumuman massal"/><div className="workspaceBroadcastFooter"><span>{broadcastDraft.length}/4000 karakter</span><button type="button" disabled={broadcastSending||!broadcastDraft.trim()||!roomsList.length} onClick={()=>void sendMassAnnouncement()}>{broadcastSending?'Mengirim…':'Kirim ke seluruh ruangan'}</button></div></div>}
  </section>}
  <div className="workspacePageHead">
   <div className="workspacePageIntro">
   <nav className="workspaceCrumbs" aria-label="Breadcrumb">
    <button type="button" onClick={()=>openMainModule('home')} aria-label="Halaman Utama"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/></svg></button>
    {active!=='home'&&<><span aria-hidden="true">/</span><span>{active==='settings'?'Administrasi':(visibleMods.find(([id])=>id===active)?.[1]||'Workspace')}</span></>}
    {active!=='home'&&active!=='settings'&&<><span aria-hidden="true">/</span><b>{currentContainer.split(' · ')[0]}</b></>}
    {active==='home'&&<><span aria-hidden="true">/</span><b>Halaman Utama</b></>}
   </nav>
    <h1>{active==='home'?'Halaman Utama':currentContainer.split(' · ')[0]}</h1>
    
   </div>
  </div>
  {contextNavigation.length>0&&<div className="workspaceContextBar">
   <nav className="workspaceContextNav" aria-label={'Bagian '+moduleLabel}>
    {contextNavigation.map(child=><button type="button" key={child.id} aria-current={selectedSidebarChild(active)===child.id?'page':undefined} onClick={()=>selectSidebarChild(active,child.id)}>{child.label}</button>)}
   </nav>
   <label className="workspaceContextSelect"><span>Bagian {moduleLabel}</span><select aria-label={'Pilih bagian '+moduleLabel} value={selectedSidebarChild(active)} onChange={event=>selectSidebarChild(active,event.target.value)}>{contextNavigation.map(child=><option key={child.id} value={child.id}>{child.label}</option>)}</select></label>
   {active==='quality'&&!qualityOppeOpen&&<nav className="qualityWorkspaceTabs" aria-label="Tampilan audit mutu">
    <button type="button" className={!qualityResultsView?'active':''} aria-pressed={!qualityResultsView} onClick={()=>{
     const mode=selectedQualityMode
     setQualityResultsView(null)
     setClinicalPathwayOpen(mode==='pathway')
     setQualityOpen(mode!=='pathway')
     setQualityInitialContainer(mode==='clinical-death'?'Audit Klinis dan Kematian':'Audit Indikator Mutu')
    }}>Form Logbook</button>
    <button type="button" className={qualityResultsView?'active':''} aria-pressed={Boolean(qualityResultsView)} onClick={()=>{
     const mode=selectedQualityMode
     setQualityResultsView(mode)
     setQualityOpen(false)
     setClinicalPathwayOpen(false)
     setQualityInitialContainer(mode==='clinical-death'?'Audit Klinis dan Kematian':'Audit Indikator Mutu')
    }}>Hasil Capaian</button>
   </nav>}
  </div>}
  <div id="workspace-main-content" tabIndex={-1} key={active+'-'+qualityOpen+'-'+qualityOppeOpen+'-'+clinicalPathwayOpen+'-'+qualityResultsView} className="moduleEnter" data-workspace-container={active} data-workspace-subcontainer={currentContainer}>
   {active==='home'?<HomeLandingWorkspace supabase={sb} userName={profile?.full_name||user?.email||'Pengguna'} userId={user?.id||''} rooms={roomsList} role={role} isAdmin={admin} roomId={room?.id??(manager?roomsList[0]?.id??null:null)} roomName={room?.name??(manager?roomsList[0]?.name??null:null)} manager={manager} onNavigate={(id,f)=>{if(manager||!MANAGER_ONLY_MODULES.includes(id)){setRiskFocus(id==='risk'&&f?{...(f as any),nonce:Date.now()}:null);setSafetyFocus(id==='safety'&&f?{...(f as any),nonce:Date.now()}:null);if(id==='clinicalPathway')selectSidebarChild('quality','logbook-pathway');else openMainModule(id)}}}/>
   :active==='patients'?<PatientRegistryWorkspace rooms={roomsList} initialRoomId={room?.id??null} isAdmin={admin} isValidator={validator} canViewAllRooms={admin||role==='PMKP'}/>
   :active==='quality'&&qualityOppeOpen?<OppeAuditWorkspace key="quality-oppe-fppe" initialRoomId={effectiveQualityRoomId} rooms={roomsList} isSuperAdmin={admin} canManage={admin||role==='PMKP'}/>
   :active==='quality'&&qualityResultsView?<QualityResultsWorkspace key={qualityResultsView} mode={qualityResultsView} initialRoomId={effectiveQualityRoomId} rooms={roomsList} canViewAllRooms={admin||role==='PMKP'} onRoomChange={updateSelectedQualityRoom}/>
   :active==='quality'&&clinicalPathwayOpen?<ClinicalPathwayWorkspace initialRoomId={room?.id||null} rooms={roomsList} isAdmin={admin} userName={profile?.full_name||user?.email||'Pengguna AUREKA'} onBack={()=>openMainModule('quality')}/>
   :active==='quality'&&qualityOpen?<QualityIndicatorWorkspace key={qualityInitialContainer} initialRoomId={effectiveQualityRoomId} rooms={roomsList} isAdmin={admin} isValidator={validator} canViewAllRooms={admin||role==='PMKP'} onRoomChange={updateSelectedQualityRoom} initialContainer={qualityInitialContainer} showContainerTabs={false} hidePatientEpisodeEntry/>
   :active==='quality'?<QualityHub onOpen={()=>selectSidebarChild('quality','indicators')} onOpenClinicalPathway={()=>selectSidebarChild('quality','clinical-pathway')} onOpenClinicalDeathReview={()=>selectSidebarChild('quality','clinical-death')}/>
   :active==='safety'?<PatientSafetyWorkspace supabase={sb} rooms={roomsList} initialRoomId={room?.id||null} isSuperAdmin={admin} canManageWorkflow={admin||role==='PMKP'||role==='MANAGEMENT'} focus={safetyFocus} initialTab={safetyTab} showTabs={false} onTabChange={setSafetyTab}/>
   :active==='risk'?<RiskManagementWorkspace supabase={sb} rooms={roomsList} initialRoomId={room?.id||null} role={role} userId={user?.id||''} userName={profile?.full_name||user?.email||'Pengguna AUREKA'} focus={riskFocus} initialTab={riskTab} showTabs={false} onTabChange={setRiskTab}/>
   :active==='analytics'?<MetadataStatisticsWorkspace rooms={roomsList} isSuperAdmin={admin} role={role} initialRoomId={room?.id??null} initialContainer={analyticsTab} initialDirectoryTab={analyticsDirectoryTab}/>
   :active==='settings'?<GeneralSettings key={profileFocus} openProfile={profileFocus>0} profile={profile} role={role} rooms={roomsList} onNavigate={(id)=>openMainModule(id)} onRoomsChanged={()=>{rooms().then(setRoomsList)}}/>
   :<AsyncStatePanel state="error" title="Bagian workspace tidak tersedia" description="Kembali ke ringkasan untuk memilih modul sesuai hak akses Anda." onRetry={()=>openMainModule('home')} compact/>}
  </div>
 </section>
</main>
 return <PublicLandingPage
  logoSrc={LOGO}
  onLogin={()=>{setMessage('');setAuthMode('normal');setView('login')}}
 />
}
