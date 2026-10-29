'use client'
import {useEffect,useMemo,useState} from 'react'
import {type SupabaseClient} from '@supabase/supabase-js'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import type {RiskFocus,SafetyFocus} from '@/lib/aureka/focus'
import {LiquidGlass,LiquidGlassButton} from '@/components/LiquidGlass'
import QualityIndicatorWorkspace from '@/components/QualityIndicatorWorkspace'
import ClinicalPathwayWorkspace from '@/components/ClinicalPathwayWorkspace'
import PatientSafetyWorkspace from '@/components/PatientSafetyWorkspace'
import RiskManagementWorkspace from '@/components/RiskManagementWorkspace'
import QualitySettings from '@/components/QualitySettings'
import QualityHub from '@/components/QualityHub'
import GeneralSettings from '@/components/GeneralSettings'
import OverviewDashboard from '@/components/OverviewDashboard'
import MetadataStatisticsWorkspace from '@/components/MetadataStatisticsWorkspace'
import ClinicalWorkforceWorkspace from '@/components/ClinicalWorkforceWorkspace'
import { AUREKA_PRIMARY_NAV, type AurekaRole } from '@/lib/aureka/module-registry'
const sb:SupabaseClient=aurekaSupabase
const sys=()=>sb.schema('aureka_system')
const LOGO='https://rsudssma.pontianak.go.id/storage/settings/October2023/8ODy7bT72ice4vVuuC9d.png'
const FALLBACK=['Informasi dan Pengaduan','Informatika dan Teknologi','Instalasi Ambulance','Instalasi Bedah Sentral','Instalasi Farmasi','Instalasi Gawat Darurat','Instalasi Gizi','Instalasi Hemodialisis','Instalasi Laboratorium','Instalasi Radiologi','Instalasi Rawat Jalan','Instalasi Rehab Medik','Instalasi Rekam Medis','Intensive Care Unit & High Care Unit','Komite Medik','Komite Pencegahan dan Pengendalian Infeksi','Manajemen rumah Sakit','Neonatal Intensive Care Unit & Pediatrics High Dependency Unit','Nifas Obstetrics & Gynecology','Perinatology & Neonatology','Promosi Kesehatan Rumah Sakit','Rawat Inap Anak','Rawat Inap Bedah','Rawat Inap Isolasi','Rawat Inap Penyakit Dalam','Rawat Inap Saraf','Rawat Inap VIP','Satuan Pengawas Intern','Tim Investigasi','Tim Koordinasi Pendidikan','Tim Pelayanan Human Immunodeficiency Virus','Tim Pelayanan Keluarga Berencana Rumah Sakit','Tim Pelayanan Obstetri Neonatal Emergensi Komprehensif','Tim Pelayanan Onkologi','Tim Pencegahan Resistensi Antimikroba','Tim Peningkatan Kinerja Klinis','Verlos Kamer']
const MODS=AUREKA_PRIMARY_NAV.map(({id,label})=>[id,label] as const)
const MANAGER_ONLY_MODULES=AUREKA_PRIMARY_NAV.filter(({visibility})=>visibility==='management-only').map(({id})=>id)
// Role pengelola melihat seluruh rumah sakit; role unit (PIC) hanya modul input unitnya.
const MANAGER_ROLES=['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS']
const ROLE_LABEL:Record<string,string>={ADMIN:'Super Admin',PMKP:'Komite PMKP',MANAGEMENT:'Manajemen',PIC:'PIC Unit',VALIDATOR:'Validator Unit',KABID:'Kepala Bidang',DIREKTUR:'Direktur',DEWAN_PENGAWAS:'Dewan Pengawas'}
const initials=(name?:string|null)=>{const parts=String(name||'').split('@')[0].replace(/[^A-Za-z0-9\u00C0-\u024F ]/g,' ').trim().split(/\s+/).filter(Boolean);return ((parts[0]?.[0]||'A')+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase()}
const QUICK_MODULES=[
 {id:'quality',label:'Mutu Klinis',short:'Clinical quality',description:'Preview modul audit indikator, Clinical Pathway, dan audit klinis.'},
 {id:'safety',label:'Keselamatan Pasien',short:'Safety',description:'Preview insiden dan keselamatan pasien.'},
 {id:'risk',label:'Manajemen Risiko',short:'Risk',description:'Preview Risk Register dan pengendalian risiko.'},
] as const

type QuickModule=typeof QUICK_MODULES[number]
const MODULE_INFO:Record<QuickModule['id'],{tagline:string;features:[string,string][]}>={
 quality:{tagline:'Pengumpulan & pemantauan capaian indikator mutu unit dan rumah sakit.',features:[['Audit Indikator Mutu','Logbook episode pasien per unit dengan profil indikator 2026.'],['Clinical Pathway','Audit per episode, checklist PPA, dan penghitungan kepatuhan.'],['Audit Klinis & Kematian','Telaah klinis terstruktur, pembelajaran, rekomendasi, dan tindak lanjut.'],['OPPE','Penilaian praktik profesional berbasis logbook tervalidasi dan bukti indikator.']]},
 safety:{tagline:'Pelaporan insiden, investigasi RCA, dan budaya keselamatan pasien.',features:[['Laporan IKP','Formulir insiden sesuai format resmi, tersimpan aman di server.'],['Investigasi / RCA','Akar masalah, grading risiko, dan rekomendasi tindak lanjut.'],['Survey Budaya','Survei budaya keselamatan anonim untuk seluruh staf.'],['Rekap & Ekspor','Rekap respons dan ekspor Excel untuk Komite PMKP.']]},
 risk:{tagline:'Register risiko per unit dengan matriks 5×5 dan RTP berjenjang.',features:[['Risk Register','Identifikasi, penilaian baseline & residual, otomatis dari matriks Kepmenkes.'],['RTP Terintegrasi','Satu rencana pengendalian untuk beberapa risiko, persetujuan Kabid → Direktur → Dewas.'],['Konektor Risiko','Hubungan penyebab bersama, hulu-hilir, dan potensi duplikasi.'],['FMEA / HFMEA','Analisis modus kegagalan dengan RPN terpisah dari skor matriks.']]},
}
function ModuleIcon({id}:{id:QuickModule['id']}){
 if(id==='quality')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-7"/><path d="M3.5 19.5h17"/></svg>
 if(id==='safety')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.2c0 4.4-2.7 7.9-7 9.3-4.3-1.4-7-4.9-7-9.3V6l7-2.5Z"/><path d="m8.8 12.1 2.1 2.1 4.5-4.7"/></svg>
 return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 4v7.9l-7 4-7-4V7l7-4Z"/><path d="M5 7 12 11l7-4M12 11v8.7"/></svg>
}
function NavIcon({id}:{id:string}){
 if(id==='home')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.5v10h13v-10M9 19.5v-6h6v6"/></svg>
 if(id==='quality')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-7"/><path d="M3.5 19.5h17"/></svg>
 if(id==='safety')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.2c0 4.4-2.7 7.9-7 9.3-4.3-1.4-7-4.9-7-9.3V6l7-2.5Z"/><path d="m8.8 12.1 2.1 2.1 4.5-4.7"/></svg>
 if(id==='risk')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 4v7.9l-7 4-7-4V7l7-4Z"/><path d="M5 7 12 11l7-4M12 11v8.7"/></svg>
 if(id==='staff')return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c.6-3.4 3-5.2 7-5.2s6.4 1.8 7 5.2"/></svg>
 if(id==='analytics')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-8"/><path d="M3 19.5h18"/></svg>
 return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.7 5l2.3-.2.9 2.1 2 1.2-.7 2.2 1.1 2-1.5 1.8.2 2.3-2.1.9-1.2 2-2.2-.7-2 1.1-1.8-1.5-2.3.2-.9-2.1-2-1.2.7-2.2-1.1-2 1.5-1.8-.2-2.3 2.1-.9 1.2-2 2.2.7 2-1.1Z"/><circle cx="12" cy="12" r="3"/></svg>
}
const CHILD:any={quality:['Audit Indikator Mutu','Audit Clinical Pathway','Audit Klinis dan Kematian'],safety:['Insiden Keselamatan Pasien','Investigasi / Root Cause Analysis (RCA)','Survey Budaya Keselamatan Pasien'],risk:['Risk Register','RTP','FMEA / HFMEA'],staff:['Direktori Tenaga','Tim & Penugasan','OPPE / FPPE'],analytics:['Dashboard Statistik','Kelengkapan Data','Ekspor Agregat','Laporan Individu'],settings:['Pengguna & Role','Unit','Kamus Indikator / CP','Versi Aturan','Konfigurasi']}
type Room={id:number;name:string};type Profile={user_id:string;full_name:string;email:string;username?:string|null;primary_room_id:number|null;role_id:string|null;is_active:boolean;must_change_password?:boolean;role_code?:string|null;role_name?:string|null}
const logo=(c='')=><img className={c} src="/assets/logo_rsud.png" alt="RSUD Sultan Syarif Mohamad Alkadrie" onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src=LOGO}}/>
async function rooms(){const {data,error}=await sb.from('master_rooms').select('id,name').eq('is_active',true).order('sort_order');return !error&&data?.length?data as Room[]:FALLBACK.map((name,i)=>({id:i+1,name}))}
async function prof(_uid:string){const {data,error}=await sb.rpc('aureka_get_my_profile');if(error)throw error;const row=(Array.isArray(data)?data[0]:data) as (Profile&{role_code?:string|null;role_name?:string|null})|null;return row}
async function roleCode(profile:Profile|null){return profile?.role_code||null}
export default function HomeClient(){
 const [view,setView]=useState<'public'|'login'|'signup'|'workspace'|'force-password'>('public'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[fullName,setFullName]=useState(''),[signupRoom,setSignupRoom]=useState(''),[roomsList,setRoomsList]=useState<Room[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[user,setUser]=useState<any>(null),[profile,setProfile]=useState<Profile|null>(null),[room,setRoom]=useState<Room|null>(null),[role,setRole]=useState<string|null>(null),[active,setActive]=useState('home'),[qualityOpen,setQualityOpen]=useState(false),[qualityInitialContainer,setQualityInitialContainer]=useState<'Audit Indikator Mutu'|'Audit Clinical Pathway'|'Audit Klinis dan Kematian'>('Audit Indikator Mutu'),[clinicalPathwayOpen,setClinicalPathwayOpen]=useState(false),[mobile,setMobile]=useState(false),[overviewModule,setOverviewModule]=useState<QuickModule['id']|null>(null),[signupDone,setSignupDone]=useState(false),[riskFocus,setRiskFocus]=useState<RiskFocus|null>(null),[safetyFocus,setSafetyFocus]=useState<SafetyFocus|null>(null),[showPw,setShowPw]=useState(false),[profileFocus,setProfileFocus]=useState(0),[username,setUsername]=useState(''),[needVerify,setNeedVerify]=useState(''),[authInfo,setAuthInfo]=useState(''),[authMode,setAuthMode]=useState<'normal'|'forgot'|'recovery'>('normal'),[resetSent,setResetSent]=useState(false),[password2,setPassword2]=useState(''),[routeReady,setRouteReady]=useState(false)
 useEffect(()=>{const toneMap:any={emerald:['#0f7656','#084f3a','15,118,86','#e1f3eb'],ocean:['#1769aa','#0b3f70','23,105,170','#e1effb'],indigo:['#4f46b5','#29216f','79,70,181','#e9e7fb'],teal:['#087f8c','#07505a','8,127,140','#def4f5'],violet:['#7c4d9e','#4b2865','124,77,158','#f0e5f6'],amber:['#a96816','#68400e','169,104,22','#fbefd9']};const selected=toneMap[typeof window==='undefined'?'emerald':localStorage.getItem('aureka-tone')||'emerald']||toneMap.emerald;document.documentElement.style.setProperty('--accent',selected[0]);document.documentElement.style.setProperty('--accent2',selected[1]);document.documentElement.style.setProperty('--accent-rgb',selected[2]);document.documentElement.style.setProperty('--accent-soft',selected[3]);rooms().then(setRoomsList);const isRecovery=typeof window!=='undefined'&&/type=recovery/.test(window.location.hash);const verified=typeof window!=='undefined'&&/type=(signup|email_change|email)/.test(window.location.hash);if(verified)history.replaceState(null,'',window.location.pathname+window.location.search);sb.auth.getSession().then(async({data})=>{if(!data.session||isRecovery)return;let p:Profile|null=null;try{p=await prof(data.session.user.id)}catch{return}if(!p?.is_active){await sb.auth.signOut();if(verified){setView('login');setAuthInfo('Email berhasil diverifikasi ✓. Akun Anda sedang menunggu aktivasi oleh Komite PMKP.')}return}sb.rpc('aureka_sync_my_email').then(()=>{},()=>{});if(p?.is_active){setUser(data.session.user);setProfile(p);const currentRole=await roleCode(p);setRole(currentRole);if(p.primary_room_id){const {data:r}=await sb.from('master_rooms').select('id,name').eq('id',p.primary_room_id).maybeSingle();setRoom(r as Room|null)}if(currentRole==='VALIDATOR'){setActive('quality');setQualityOpen(true)}else{setActive('home');setQualityOpen(false)}setView(p.must_change_password?'force-password':'workspace')}})},[])
 useEffect(()=>{
  if(view!=='workspace'||typeof window==='undefined'){setRouteReady(false);return}
  const applyHash=(raw:string)=>{
   const path=raw.replace(/^#\/?/,'').toLowerCase()
   if(path.startsWith('mutu-klinis/clinical-pathway')){
    setActive('quality');setQualityOpen(false);setClinicalPathwayOpen(true);return
   }
   if(path.startsWith('mutu-klinis/audit-klinis-dan-kematian')){
    setActive('quality');setQualityOpen(true);setClinicalPathwayOpen(false);setQualityInitialContainer('Audit Klinis dan Kematian');return
   }
   if(path.startsWith('mutu-klinis/audit-indikator')){
    setActive('quality');setQualityOpen(true);setClinicalPathwayOpen(false);setQualityInitialContainer('Audit Indikator Mutu');return
   }
   const routes:Record<string,string>={'ringkasan':'home','mutu-klinis':'quality','keselamatan-pasien':'safety','manajemen-risiko':'risk','tenaga-klinis':'staff','analitik-laporan':'analytics','administrasi':'settings'}
   let next=routes[path]||'home'
   if(next==='analytics'&&!MANAGER_ROLES.includes(role||''))next='home'
   setActive(next)
   setQualityOpen(false)
   setClinicalPathwayOpen(false)
  }
  applyHash(window.location.hash)
  const onHashChange=()=>applyHash(window.location.hash)
  window.addEventListener('hashchange',onHashChange)
  setRouteReady(true)
  return ()=>window.removeEventListener('hashchange',onHashChange)
 },[view,role])
 useEffect(()=>{
  if(view!=='workspace'||!routeReady||typeof window==='undefined')return
  let hash='#ringkasan'
  if(active==='quality'){
   hash=clinicalPathwayOpen?'#mutu-klinis/clinical-pathway':qualityOpen&&qualityInitialContainer==='Audit Klinis dan Kematian'?'#mutu-klinis/audit-klinis-dan-kematian':qualityOpen?'#mutu-klinis/audit-indikator':'#mutu-klinis'
  }else{
   const routes:Record<string,string>={home:'#ringkasan',safety:'#keselamatan-pasien',risk:'#manajemen-risiko',staff:'#tenaga-klinis',analytics:'#analitik-laporan',settings:'#administrasi'}
   hash=routes[active]||'#ringkasan'
  }
  if(window.location.hash!==hash)window.location.hash=hash
 },[view,routeReady,active,qualityOpen,clinicalPathwayOpen,qualityInitialContainer])
 const resolveLoginEmail=async(input:string)=>{const v=input.trim();if(!v)throw new Error('Isi username atau email.');if(v.includes('@'))return v;const {data,error}=await sb.rpc('aureka_login_email',{p_username:v});if(error){if(error.code==='PGRST202'||/Could not find the function|schema cache/i.test(error.message))throw new Error('Login dengan username belum aktif. Silakan masuk memakai email.');throw error}if(!data)throw new Error('Username tidak ditemukan. Periksa ejaan atau masuk memakai email.');return String(data)}
 const authError=(e:any,em?:string)=>{const m=e instanceof Error?e.message:String(e?.message||e||'');if(/email not confirmed/i.test(m)){if(em)setNeedVerify(em);return 'Email akun belum diverifikasi. Buka email Anda dan klik tautan verifikasi, atau kirim ulang di bawah.'}if(/invalid login credentials/i.test(m))return 'Username/email atau password salah.';if(/rate limit|too many/i.test(m))return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';if(/already registered|already been registered/i.test(m))return 'Email ini sudah terdaftar. Silakan masuk atau gunakan Lupa password.';return m||'Terjadi kesalahan'}
 const resendVerify=async()=>{if(busy||!needVerify)return;setBusy(true);const {error}=await sb.auth.resend({type:'signup',email:needVerify,options:{emailRedirectTo:`${window.location.origin}/AUREKA-Hospital-Quality-Intelligence/`}});setBusy(false);setAuthInfo('');setMessage(error?authError(error):`Email verifikasi dikirim ulang ke ${needVerify}. Cek juga folder Spam.`)}
 const login=async()=>{if(busy)return;setBusy(true);setMessage('');setNeedVerify('');setAuthInfo('');let em='';try{em=await resolveLoginEmail(email);const {data,error}=await sb.auth.signInWithPassword({email:em,password});if(error)throw error;sb.rpc('aureka_sync_my_email').then(()=>{},()=>{});const p=await prof(data.user.id);if(!p){await sb.auth.signOut();throw new Error('Profil AUREKA belum tersedia.')}if(!p.is_active){await sb.auth.signOut();throw new Error('Akun belum aktif. Hubungi Super Admin/Komite PMKP untuk aktivasi.')}setUser(data.user);setProfile(p);const currentRole=await roleCode(p);setRole(currentRole);if(p.primary_room_id){const {data:r}=await sb.from('master_rooms').select('id,name').eq('id',p.primary_room_id).maybeSingle();setRoom(r as Room|null)}if(currentRole==='VALIDATOR'){setActive('quality');setQualityOpen(true)}else{setActive('home');setQualityOpen(false)}setClinicalPathwayOpen(false);if(p.must_change_password){setPassword('');setPassword2('');setView('force-password')}else{setView('workspace')}}catch(e){setMessage(authError(e,em))}finally{setBusy(false)}}
 const signup=async()=>{if(busy)return;setBusy(true);setMessage('');try{const un=username.trim().toLowerCase();if(!fullName.trim()||!signupRoom||password.length<8)throw new Error('Nama, unit utama, dan password minimal 8 karakter wajib diisi.');if(!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(un))throw new Error('Username 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Contoh: pic.isolasi');if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))throw new Error('Email wajib diisi dengan benar (dipakai untuk verifikasi dan reset password).');const av=await sb.rpc('aureka_username_available',{p_username:un});if(!av.error&&av.data===false)throw new Error(`Username “${un}” sudah dipakai. Coba yang lain, misalnya ${un}2.`);const {data:su,error}=await sb.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${window.location.origin}/AUREKA-Hospital-Quality-Intelligence/`,data:{full_name:fullName.trim(),primary_room_id:signupRoom,username:un}}});if(error)throw error;if(su?.user&&Array.isArray((su.user as any).identities)&&(su.user as any).identities.length===0)throw new Error('Email ini sudah terdaftar. Silakan masuk atau gunakan Lupa password.');if(su?.session)await sb.auth.signOut();setUsername(un);setMessage('');setSignupDone(true)}catch(e){setMessage(authError(e))}finally{setBusy(false)}}
 useEffect(()=>{const {data:sub}=sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){setAuthMode('recovery');setMessage('');setPassword('');setPassword2('');setView('login')}});if(typeof window!=='undefined'&&/type=recovery/.test(window.location.hash)){setAuthMode('recovery');setView('login')}return()=>{sub.subscription.unsubscribe()}},[])
 const sendReset=async()=>{if(busy)return;setBusy(true);setMessage('');let em='';try{em=await resolveLoginEmail(email)}catch(e){setBusy(false);setMessage(authError(e));return}if(!/^\S+@\S+\.\S+$/.test(em)){setBusy(false);setMessage('Masukkan username atau email akun yang valid.');return}if(em.toLowerCase().endsWith('@aureka.invalid')){setBusy(false);setMessage('Akun unit ini tidak memakai email untuk pemulihan password. Hubungi Super Admin untuk menyetel password sementara; akun akan wajib menggantinya saat login berikutnya.');return}const {error}=await sb.auth.resetPasswordForEmail(em,{redirectTo:`${window.location.origin}/AUREKA-Hospital-Quality-Intelligence/`});setBusy(false);if(error){setMessage(/rate limit|too many/i.test(error.message)?'Terlalu banyak permintaan. Coba lagi beberapa menit lagi, atau minta Super Admin menyetel password sementara.':`Gagal mengirim email: ${error.message}`);return}setResetSent(true)}
 const saveNewPassword=async()=>{if(busy)return;if(password.length<8){setMessage('Password baru minimal 8 karakter.');return}if(password!==password2){setMessage('Konfirmasi password tidak sama.');return}setBusy(true);setMessage('');const {error}=await sb.auth.updateUser({password});if(error){setBusy(false);setMessage(`Gagal menyimpan password: ${error.message}`);return}await sb.auth.signOut();setBusy(false);if(typeof window!=='undefined'&&window.location.hash)history.replaceState(null,'',window.location.pathname+window.location.search);setPassword('');setPassword2('');setAuthMode('normal');setMessage('');setResetSent(false);setView('login');setMessage('Password baru tersimpan. Silakan masuk dengan password baru.')}
 const saveFirstPassword=async()=>{
  if(busy)return
  if(!user?.id||!profile?.must_change_password){setView('workspace');return}
  if(password.length<12){setMessage('Password baru minimal 12 karakter.');return}
  if(password!==password2){setMessage('Konfirmasi password tidak sama.');return}
  setBusy(true);setMessage('')
  const {error}=await sb.auth.updateUser({password})
  if(error){setBusy(false);setMessage(`Gagal mengganti password: ${error.message}`);return}
  const {error:flagError}=await sb.rpc('aureka_complete_first_login_password_change')
  if(flagError){setBusy(false);setMessage(`Password sudah diperbarui, tetapi status wajib ganti password belum dapat diselesaikan. Klik Simpan kembali untuk menyelesaikan: ${flagError.message}`);return}
  try{
   const next=await prof(user.id)
   if(!next||next.must_change_password)throw new Error('Status wajib ganti password belum terkonfirmasi.')
   setProfile(next);setPassword('');setPassword2('');setBusy(false);setMessage('');setView('workspace')
  }catch(e){
   setBusy(false);setMessage(e instanceof Error?e.message:'Password berubah, tetapi profil belum dapat dimuat ulang. Muat ulang halaman dan masuk kembali.')
  }
 }
 const logout=async()=>{await sb.auth.signOut();setUser(null);setProfile(null);setRoom(null);setRole(null);setPassword('');setPassword2('');setView('public');setActive('home');setQualityOpen(false);setClinicalPathwayOpen(false);}
  const admin=role==='ADMIN'
 const manager=MANAGER_ROLES.includes(role||'')
 const validator=role==='VALIDATOR'
 const visibleMods=useMemo(()=>AUREKA_PRIMARY_NAV.filter(({requiredRoles})=>requiredRoles.includes((role||'') as AurekaRole)).map(({id,label})=>[id,label] as const),[role])
 useEffect(()=>{if(!manager&&MANAGER_ONLY_MODULES.includes(active))setActive('home')},[manager,active])
 const title=useMemo(()=>MODS.find(([id])=>id===active)?.[1]||(active==='home'?'Ringkasan':'Workspace'),[active])
 if(view==='force-password')return <main className="authPage"><div className="landingAura" aria-hidden="true"><span/><span/><span/></div><div className="authShell authShellSingle"><LiquidGlass className="authCard"><div className="authLogo">{logo()}</div><div className="eyebrow authEyebrow">AUREKA · Keamanan akun</div><h1>Ganti password awal</h1><p>Akun ini wajib menggunakan password baru sebelum Anda dapat membuka workspace. Password awal hanya berlaku untuk masuk pertama kali.</p><div className="authAlert" role="note"><b>Username:</b> {profile?.username||username||'akun unit'}<br/><b>Unit:</b> {room?.name||'unit yang ditetapkan'}<br/>Gunakan password baru minimal 12 karakter dan jangan gunakan password yang sama dengan akun lain.</div><form onSubmit={e=>{e.preventDefault();saveFirstPassword()}} noValidate><div className="field"><label htmlFor="firstPassword">Password baru</label><div className="pwWrap"><input id="firstPassword" type={showPw?'text':'password'} autoComplete="new-password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimal 12 karakter" required/><button type="button" className="pwToggle" onClick={()=>setShowPw(v=>!v)}>{showPw?'Sembunyikan':'Lihat'}</button></div></div><div className="field"><label htmlFor="firstPassword2">Konfirmasi password baru</label><input id="firstPassword2" type={showPw?'text':'password'} autoComplete="new-password" minLength={12} value={password2} onChange={e=>setPassword2(e.target.value)} placeholder="Ketik ulang password baru" required/></div>{message&&<div className="authAlert" role="alert">{message}</div>}<button type="submit" className="landingCta big authWide" disabled={busy}>{busy?'Menyimpan password…':'Simpan password baru'} {!busy&&<span aria-hidden="true">→</span>}</button></form><button type="button" className="authBack" style={{position:'static',marginTop:16}} onClick={logout} disabled={busy}>Keluar dari akun</button></LiquidGlass></div></main>
 if(view==='login'&&authMode!=='normal'){const rec=authMode==='recovery';return <main className="authPage">
  <div className="landingAura" aria-hidden="true"><span/><span/><span/></div>
  {!rec&&<button type="button" className="authBack" onClick={()=>{setMessage('');setResetSent(false);setAuthMode('normal')}}><span aria-hidden="true">←</span> Kembali ke login</button>}
  <div className="authShell authShellSingle">
   <LiquidGlass className="authCard">
    {!rec&&resetSent?<div className="authSuccess">
     <div className="authSuccessIcon" aria-hidden="true">✉</div>
     <h1>Cek email Anda</h1>
     <p>Jika akun <b>{email.trim()}</b> terdaftar di AUREKA, tautan untuk membuat password baru sudah dikirim.</p>
     <ol className="authSteps">
      <li><b>Buka email</b><span>Cari email dari AUREKA/Supabase. Cek juga folder Spam/Promosi.</span></li>
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
 if(view==='login'||view==='signup'){const l=view==='login';const submit=(e:any)=>{e.preventDefault();l?login():signup()};return <main className="authPage">
  <div className="landingAura" aria-hidden="true"><span/><span/><span/></div>
  <button type="button" className="authBack" onClick={()=>{setMessage('');setSignupDone(false);setView('public')}}><span aria-hidden="true">←</span> Kembali ke beranda</button>
  <div className="authShell">
   <aside className="authAside">
    <div className="authAsideBrand">{logo()}<div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div>
    <h2>{l?'Selamat datang kembali.':'Bergabung sebagai PIC unit.'}</h2>
    <p>{l?'Masuk untuk menginput dan memantau data mutu, keselamatan pasien, dan manajemen risiko sesuai unit kerja Anda.':'Daftarkan akun unit Anda. Setelah diaktifkan Komite PMKP, Anda dapat menginput data unit secara mandiri.'}</p>
    <ul>
     <li><span>✓</span>Data tersimpan aman di server, sesuai hak akses</li>
     <li><span>✓</span>PIC hanya melihat dan mengelola data unitnya</li>
     <li><span>✓</span>Rekap otomatis untuk Komite PMKP</li>
    </ul>
    <small className="authAsideFoot">UPT RSUD Sultan Syarif Mohamad Alkadrie · Komite PMKP</small>
   </aside>
   <LiquidGlass className="authCard">
    {!l&&signupDone?<div className="authSuccess">
     <div className="authSuccessIcon" aria-hidden="true">✓</div>
     <h1>Akun berhasil dibuat</h1>
     <p>Akun <b>{email.trim()}</b> untuk unit <b>{roomsList.find(r=>String(r.id)===String(signupRoom))?.name||'-'}</b> sudah terdaftar dan sedang <b>menunggu aktivasi</b>.</p>
     <ol className="authSteps">
      <li><b>Verifikasi email</b><span>Buka email <i className="authStrong">{email.trim()}</i> dan klik tautan verifikasi (cek juga folder Spam).</span></li>
      <li><b>Aktivasi oleh Komite PMKP</b><span>Super Admin akan memeriksa unit dan mengaktifkan akun Anda.</span></li>
      <li><b>Masuk ke workspace</b><span>Setelah aktif, login dengan username <i className="authStrong">{username||'-'}</i> (atau email) dan password Anda.</span></li>
     </ol>
     <button type="button" className="landingCta big authWide" onClick={()=>{setSignupDone(false);setMessage('');setPassword('');setView('login')}}>Ke halaman login <span aria-hidden="true">→</span></button>
    </div>:<form onSubmit={submit} noValidate>
     <div className="authLogo">{logo()}</div>
     <div className="eyebrow authEyebrow">AUREKA WORKSPACE</div>
     <h1>{l?'Masuk':'Daftar Akun Unit'}</h1>
     <p>{l?'Gunakan akun AUREKA sesuai role dan unit kerja.':'Registrasi untuk calon PIC pelaporan unit.'}</p>
     {!l&&<><div className="field"><label htmlFor="fullName">Nama lengkap</label><input id="fullName" autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nama sesuai identitas pegawai"/></div><div className="field"><label htmlFor="signupRoom">Ruangan / unit</label><select id="signupRoom" value={signupRoom} onChange={e=>setSignupRoom(e.target.value)}><option value="">Pilih unit kerja</option>{roomsList.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div></>}
     {!l&&<div className="field"><label htmlFor="username">Username</label><input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/\s+/g,'.'))} placeholder="contoh: pic.isolasi"/><small className="fieldHint">Dipakai untuk login. Huruf kecil, angka, titik, garis bawah, atau strip.</small></div>}
     <div className="field"><label htmlFor="email">{l?'Username atau email':'Email'}</label><input id="email" type={l?'text':'email'} autoComplete={l?'username':'email'} autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder={l?'pic.isolasi atau nama@email.com':'nama@email.com'}/>{!l&&<small className="fieldHint">Wajib email aktif: link verifikasi dan reset password dikirim ke sini. Bisa diubah nanti.</small>}</div>
     <div className="field"><label htmlFor="password">Password</label><div className="pwWrap"><input id="password" type={showPw?'text':'password'} autoComplete={l?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={l?'Password akun':'Minimal 8 karakter'}/><button type="button" className="pwToggle" onClick={()=>setShowPw(v=>!v)} aria-label={showPw?'Sembunyikan password':'Tampilkan password'}>{showPw?'Sembunyikan':'Lihat'}</button></div>{l&&<button type="button" className="authForgot" onClick={()=>{setMessage('');setResetSent(false);setAuthMode('forgot')}}>Lupa password?</button>}</div>
     {authInfo&&<div className="authAlert ok" role="status">{authInfo}</div>}{message&&<div className={/tersimpan|dikirim ulang/.test(message)?'authAlert ok':'authAlert'} role="alert">{message}</div>}{l&&needVerify&&<button type="button" className="authResend" disabled={busy} onClick={resendVerify}>✉️ Kirim ulang email verifikasi</button>}
     <button type="submit" className="landingCta big authWide" disabled={busy}>{busy?'Memproses…':l?'Masuk':'Buat akun'} {!busy&&<span aria-hidden="true">→</span>}</button>
     <div className="authSwitch">{l?'Belum punya akun?':'Sudah punya akun?'} <button type="button" onClick={()=>{setMessage('');setView(l?'signup':'login')}}>{l?'Daftar akun unit':'Masuk di sini'}</button></div>
    </form>}
   </LiquidGlass>
  </div>
 </main>}
 if(view==='workspace')return <main className="workspaceRoot"><button className="workspaceScrim" onClick={()=>setMobile(false)} data-open={mobile}/><aside className={`sidebar glassPanel ${mobile?'mobileOpen':''}`}><div className="sideHeader"><div className="sideBrand"><span className="workspaceBrandMark" aria-hidden="true">A</span><div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div></div><div className="navLabel">Workspace</div><nav className="sidebarNav"><button type="button" title="Ringkasan" className={active==='home'?'navActive':''} onClick={()=>{setActive('home');setQualityOpen(false);setClinicalPathwayOpen(false);setMobile(false)}}><NavIcon id="home"/><span>Ringkasan</span></button>{visibleMods.map(([id,n])=><button type="button" title={n} key={id} className={active===id?'navActive':''} onClick={()=>{setProfileFocus(0);setActive(id);if(id!=='quality')setQualityOpen(false);setClinicalPathwayOpen(false);setMobile(false)}}><NavIcon id={id}/><span>{n}</span></button>)}</nav><button type="button" className={`profileChip profileChipBtn ${active==='settings'&&profileFocus>0?'isActive':''}`} title="Profil saya: ubah nama, password, dan data akun" onClick={()=>{setProfileFocus(Date.now());setActive('settings');setQualityOpen(false);setClinicalPathwayOpen(false);setMobile(false)}}><div className="profileAvatar">{initials(profile?.full_name||user?.email)}</div><div className="profileText"><b>{profile?.full_name||user?.email}</b><span>{ROLE_LABEL[role||'']||role||'Pengguna'} · {room?.name||'Unit belum dipetakan'}</span><em className="profileChipHint">Lihat & ubah profil ›</em></div></button><LiquidGlassButton onClick={logout}><span className="logoutIcon">↪</span><span className="logoutLabel">Logout</span></LiquidGlassButton></aside><section className="workspaceContent"><div className="workspaceTop"><button className="mobileMenuButton" onClick={()=>setMobile(true)}>☰</button><div><div className="eyebrow">AUREKA / {title}</div><h2>{title}</h2><p>{active==='home'?'Pemantauan mutu, keselamatan pasien, dan risiko — satu tampilan kerja.':'Ruang kerja operasional sesuai peran dan unit penugasan.'}</p></div><div className="workspaceTopMeta"><span>Unit kerja</span><b>{manager?"Seluruh rumah sakit":room?.name||"Unit belum dipetakan"}</b><small>{ROLE_LABEL[role||""]||"Pengguna"}</small></div></div><div key={`${active}-${qualityOpen}-${clinicalPathwayOpen}`} className="moduleEnter">{active==='home'?<OverviewDashboard supabase={sb} role={role} roomId={room?.id??null} roomName={room?.name??null} manager={manager} userName={profile?.full_name||user?.email||'Pengguna'} onNavigate={(id,f)=>{if(manager||!MANAGER_ONLY_MODULES.includes(id)){setRiskFocus(id==='risk'&&f?{...(f as any),nonce:Date.now()}:null);setSafetyFocus(id==='safety'&&f?{...(f as any),nonce:Date.now()}:null);if(id==='clinicalPathway'){setActive('quality');setQualityOpen(false);setClinicalPathwayOpen(true);}else{setActive(id);setQualityOpen(id==='quality');setClinicalPathwayOpen(false);}}}}/>:active==='quality'&&clinicalPathwayOpen?<ClinicalPathwayWorkspace initialRoomId={room?.id||null} rooms={roomsList} isAdmin={admin} userName={profile?.full_name||user?.email||'Pengguna AUREKA'} onBack={()=>{setClinicalPathwayOpen(false);setQualityOpen(false);}}/>:active==='quality'&&!qualityOpen?<QualityHub onOpen={()=>{setQualityInitialContainer('Audit Indikator Mutu');setQualityOpen(true)}} onOpenClinicalPathway={()=>{setClinicalPathwayOpen(true);setQualityOpen(false)}} onOpenClinicalDeathReview={()=>{setQualityInitialContainer('Audit Klinis dan Kematian');setClinicalPathwayOpen(false);setQualityOpen(true)}}/>:active==='quality'&&qualityOpen?<div><button type="button" className="backBtn" style={{marginBottom:12}} onClick={()=>{setQualityOpen(false);setClinicalPathwayOpen(false);setQualityInitialContainer('Audit Indikator Mutu')}}><span aria-hidden="true">←</span> Kembali ke Indikator Mutu</button><QualityIndicatorWorkspace initialRoomId={room?.id||null} rooms={roomsList} isAdmin={admin} isValidator={validator} canViewAllRooms={admin||role==='PMKP'} initialContainer={qualityInitialContainer}/></div>:active==='safety'?<PatientSafetyWorkspace supabase={sb} rooms={roomsList} initialRoomId={room?.id||null} isSuperAdmin={admin} canManageWorkflow={admin||role==='PMKP'||role==='MANAGEMENT'} focus={safetyFocus}/>:active==='risk'?<RiskManagementWorkspace supabase={sb} rooms={roomsList} initialRoomId={room?.id||null} role={role} userId={user?.id||''} userName={profile?.full_name||user?.email||'Pengguna AUREKA'} focus={riskFocus}/>:active==='staff'?<ClinicalWorkforceWorkspace rooms={roomsList} initialRoomId={room?.id??null} role={role} isSuperAdmin={admin}/>:active==='analytics'&&manager?<MetadataStatisticsWorkspace supabase={sb} rooms={roomsList} isSuperAdmin={admin}/>:active==='settings'?<GeneralSettings key={profileFocus} openProfile={profileFocus>0} profile={profile} role={role} rooms={roomsList} onNavigate={(id)=>{setActive(id);setQualityOpen(id==='quality')}} onRoomsChanged={()=>{rooms().then(setRoomsList)}}/>:<div className="placeholderGrid">{(CHILD[active]||[]).map((x:string)=><LiquidGlass key={x} className="placeholderCard"><b>{x}</b><span>Container modul siap dikembangkan.</span></LiquidGlass>)}</div>}</div></section></main>
 return <main className="publicRoot landing">
  <div className="landingAura" aria-hidden="true"><span/><span/><span/></div>
  <header className="topbar glassPanel landingTopbar">
   <div className="brand">{logo()}<div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div>
   <div className="landingTopActions">
    <button type="button" className="landingGhost" onClick={()=>{setMessage('');setView('signup')}}>Daftar akun unit</button>
    <button type="button" className="landingCta" onClick={()=>{setMessage('');setView('login')}}>Masuk Workspace <span aria-hidden="true">→</span></button>
   </div>
  </header>

  <section className="heroPublic landingHero">
   <div className="heroCopy">
    <div className="landingBadge"><span className="landingPulse" aria-hidden="true"/>UPT RSUD Sultan Syarif Mohamad Alkadrie · Komite PMKP</div>
    <h1>AUREKA<br/><em>Alkadrie Unified Risk Evaluation, Quality, Assessment.</em></h1>
    <p>Satu workspace untuk indikator mutu, keselamatan pasien, dan manajemen risiko — setiap unit menginput datanya sendiri, Komite PMKP memantau seluruh rumah sakit secara langsung.</p>
    <div className="landingActions">
     <button type="button" className="landingCta big" onClick={()=>{setMessage('');setView('login')}}>Masuk Workspace <span aria-hidden="true">→</span></button>
     <button type="button" className="landingGhost big" onClick={()=>{setMessage('');setView('signup')}}>Daftar sebagai PIC unit</button>
    </div>
    <div className="landingStats">
     <div><b>{roomsList.length||37}</b><span>Unit kerja</span></div>
     <div><b>3</b><span>Modul inti PMKP</span></div>
     <div><b>5×5</b><span>Matriks risiko Kepmenkes</span></div>
    </div>
   </div>

   <div className="landingModules" aria-label="Modul utama AUREKA">
    {QUICK_MODULES.map((module,idx)=>
     <button key={module.id} type="button" className={`landingModule quickDock-${module.id}`} style={{animationDelay:`${140+idx*90}ms`}} onClick={()=>setOverviewModule(module.id)} aria-label={`Lihat modul ${module.label}`}>
      <span className="quickDockIcon"><ModuleIcon id={module.id}/></span>
      <span className="landingModuleText"><b>{module.label}</b><small>{MODULE_INFO[module.id].tagline}</small></span>
      <span className="landingModuleArrow" aria-hidden="true">↗</span>
     </button>
    )}
   </div>
  </section>

  {overviewModule&&(()=>{
   const selected=QUICK_MODULES.find(m=>m.id===overviewModule)
   if(!selected)return null
   const info=MODULE_INFO[selected.id]
   return <div className="overviewOverlay" role="presentation" onClick={()=>setOverviewModule(null)}>
    <section className={`overviewModal landingModal quickDock-${selected.id}`} role="dialog" aria-modal="true" aria-labelledby="overviewTitle" onClick={e=>e.stopPropagation()}>
     <div className="landingModalHead">
      <span className="quickDockIcon"><ModuleIcon id={selected.id}/></span>
      <div><div className="eyebrow">AUREKA · MODUL</div><h2 id="overviewTitle">{selected.label}</h2><p>{info.tagline}</p></div>
      <button type="button" className="landingClose" onClick={()=>setOverviewModule(null)} aria-label="Tutup">×</button>
     </div>
     <div className="landingFeatureGrid">
      {info.features.map(([t,d])=><div key={t} className="landingFeature"><b>{t}</b><span>{d}</span></div>)}
     </div>
     <div className="landingModalFoot">
      <span>Data operasional modul hanya dapat dilihat setelah login sesuai role dan unit kerja.</span>
      <button type="button" className="landingCta" onClick={()=>{setOverviewModule(null);setMessage('');setView('login')}}>Masuk untuk melihat data <span aria-hidden="true">→</span></button>
     </div>
    </section>
   </div>
  })()}
 </main>
}
