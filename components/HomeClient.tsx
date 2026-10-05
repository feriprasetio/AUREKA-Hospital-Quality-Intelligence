'use client'
import {useEffect,useMemo,useState} from 'react'
import {createClient,type SupabaseClient} from '@supabase/supabase-js'
import {LiquidGlass,LiquidGlassButton} from '@/components/LiquidGlass'
import QualityIndicatorWorkspace from '@/components/QualityIndicatorWorkspace'
import QualitySettings from '@/components/QualitySettings'
import GeneralSettings from '@/components/GeneralSettings'
const sb:SupabaseClient=createClient('https://ktukmjscopggkzrkgnzp.supabase.co','sb_publishable_6NWrr2xGApSApIjQ0irtvA_U05ZQlFX',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
const sys=()=>sb.schema('aureka_system')
const LOGO='https://rsudssma.pontianak.go.id/storage/settings/October2023/8ODy7bT72ice4vVuuC9d.png'
const FALLBACK=['Informasi dan Pengaduan','Informatika dan Teknologi','Instalasi Ambulance','Instalasi Bedah Sentral','Instalasi Farmasi','Instalasi Gawat Darurat','Instalasi Gizi','Instalasi Hemodialisis','Instalasi Laboratorium','Instalasi Radiologi','Instalasi Rawat Jalan','Instalasi Rehab Medik','Instalasi Rekam Medis','Intensive Care Unit & High Care Unit','Komite Medik','Komite Pencegahan dan Pengendalian Infeksi','Manajemen rumah Sakit','Neonatal Intensive Care Unit & Pediatrics High Dependency Unit','Nifas Obstetrics & Gynecology','Perinatology & Neonatology','Promosi Kesehatan Rumah Sakit','Rawat Inap Anak','Rawat Inap Bedah','Rawat Inap Isolasi','Rawat Inap Penyakit Dalam','Rawat Inap Saraf','Rawat Inap VIP','Satuan Pengawas Intern','Tim Investigasi','Tim Koordinasi Pendidikan','Tim Pelayanan Human Immunodeficiency Virus','Tim Pelayanan Keluarga Berencana Rumah Sakit','Tim Pelayanan Obstetri Neonatal Emergensi Komprehensif','Tim Pelayanan Onkologi','Tim Pencegahan Resistensi Antimikroba','Tim Peningkatan Kinerja Klinis','Verlos Kamer']
const MODS=[['quality','Indikator Mutu'],['safety','Keselamatan Pasien'],['risk','Manajemen Risiko'],['analytics','Metadata dan Statistik'],['settings','Pengaturan']] as const
const QUICK_MODULES=[
 {id:'quality',label:'Indikator Mutu',short:'Quality',description:'Preview capaian indikator mutu rumah sakit.'},
 {id:'safety',label:'Keselamatan Pasien',short:'Safety',description:'Preview insiden dan keselamatan pasien.'},
 {id:'risk',label:'Manajemen Risiko',short:'Risk',description:'Preview Risk Register dan pengendalian risiko.'},
] as const

type QuickModule=typeof QUICK_MODULES[number]
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
 if(id==='analytics')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-8"/><path d="M3 19.5h18"/></svg>
 return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.7 5l2.3-.2.9 2.1 2 1.2-.7 2.2 1.1 2-1.5 1.8.2 2.3-2.1.9-1.2 2-2.2-.7-2 1.1-1.8-1.5-2.3.2-.9-2.1-2-1.2.7-2.2-1.1-2 1.5-1.8-.2-2.3 2.1-.9 1.2-2 2.2.7 2-1.1Z"/><circle cx="12" cy="12" r="3"/></svg>
}
const CHILD:any={quality:['Audit Indikator Mutu','Audit Clinical Pathway','Audit Klinis dan Kematian','Audit OPPE'],safety:['Insiden Keselamatan Pasien','Investigasi / Root Cause Analysis (RCA)','Survey Budaya Keselamatan Pasien'],risk:['Risk Register','FMEA'],analytics:['Statistical Analysis','Data Extraction → XLSX'],settings:['Pengaturan Umum','Manajemen User / PIC Pelaporan']}
type Room={id:number;name:string};type Profile={user_id:string;full_name:string;email:string;primary_room_id:number|null;role_id:string|null;is_active:boolean;role_code?:string|null;role_name?:string|null}
const logo=(c='')=><img className={c} src="/assets/logo_rsud.png" alt="RSUD Sultan Syarif Mohamad Alkadrie" onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src=LOGO}}/>
async function rooms(){const {data,error}=await sb.from('master_rooms').select('id,name').eq('is_active',true).order('sort_order');return !error&&data?.length?data as Room[]:FALLBACK.map((name,i)=>({id:i+1,name}))}
async function prof(_uid:string){const {data,error}=await sb.rpc('aureka_get_my_profile');if(error)throw error;const row=(Array.isArray(data)?data[0]:data) as (Profile&{role_code?:string|null;role_name?:string|null})|null;return row}
async function roleCode(profile:Profile|null){return profile?.role_code||null}
export default function HomeClient(){
 const [view,setView]=useState<'public'|'login'|'signup'|'workspace'>('public'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[fullName,setFullName]=useState(''),[signupRoom,setSignupRoom]=useState(''),[roomsList,setRoomsList]=useState<Room[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[user,setUser]=useState<any>(null),[profile,setProfile]=useState<Profile|null>(null),[room,setRoom]=useState<Room|null>(null),[role,setRole]=useState<string|null>(null),[active,setActive]=useState('home'),[qualityOpen,setQualityOpen]=useState(false),[mobile,setMobile]=useState(false),[overviewModule,setOverviewModule]=useState<QuickModule['id']|null>(null),[systemOpen,setSystemOpen]=useState(false),[sidebarCollapsed,setSidebarCollapsed]=useState(()=>typeof window==='undefined'?false:localStorage.getItem('aureka-sidebar-collapsed')==='1')
 useEffect(()=>{const toneMap:any={emerald:['#0f7656','#084f3a','15,118,86','#e1f3eb'],ocean:['#1769aa','#0b3f70','23,105,170','#e1effb'],indigo:['#4f46b5','#29216f','79,70,181','#e9e7fb'],teal:['#087f8c','#07505a','8,127,140','#def4f5'],violet:['#7c4d9e','#4b2865','124,77,158','#f0e5f6'],amber:['#a96816','#68400e','169,104,22','#fbefd9']};const selected=toneMap[typeof window==='undefined'?'emerald':localStorage.getItem('aureka-tone')||'emerald']||toneMap.emerald;document.documentElement.style.setProperty('--accent',selected[0]);document.documentElement.style.setProperty('--accent2',selected[1]);document.documentElement.style.setProperty('--accent-rgb',selected[2]);document.documentElement.style.setProperty('--accent-soft',selected[3]);rooms().then(setRoomsList);sb.auth.getSession().then(async({data})=>{if(!data.session)return;const p=await prof(data.session.user.id);if(p?.is_active){setUser(data.session.user);setProfile(p);setRole(await roleCode(p));if(p.primary_room_id){const {data:r}=await sb.from('master_rooms').select('id,name').eq('id',p.primary_room_id).maybeSingle();setRoom(r as Room|null)}setView('workspace')}})},[])
 const login=async()=>{if(busy)return;setBusy(true);setMessage('');try{const {data,error}=await sb.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;const p=await prof(data.user.id);if(!p)throw new Error('Profil AUREKA belum tersedia.');if(!p.is_active)throw new Error('Akun belum aktif.');setUser(data.user);setProfile(p);setRole(await roleCode(p));if(p.primary_room_id){const {data:r}=await sb.from('master_rooms').select('id,name').eq('id',p.primary_room_id).maybeSingle();setRoom(r as Room|null)}setActive('home');setQualityOpen(false);setView('workspace')}catch(e){setMessage(e instanceof Error?e.message:'Login gagal')}finally{setBusy(false)}}
 const signup=async()=>{if(busy)return;setBusy(true);setMessage('');try{if(!fullName.trim()||!signupRoom||password.length<8)throw new Error('Nama, unit utama, dan password minimal 8 karakter wajib diisi.');const {error}=await sb.auth.signUp({email:email.trim(),password,options:{data:{full_name:fullName.trim(),primary_room_id:signupRoom}}});if(error)throw error;setMessage('Akun dibuat. Menunggu aktivasi administrator.')}catch(e){setMessage(e instanceof Error?e.message:'Pendaftaran gagal')}finally{setBusy(false)}}
 const logout=async()=>{await sb.auth.signOut();setUser(null);setProfile(null);setRoom(null);setRole(null);setView('public');setActive('home');setQualityOpen(false)}
 useEffect(()=>{if(typeof window!=='undefined')localStorage.setItem('aureka-sidebar-collapsed',sidebarCollapsed?'1':'0')},[sidebarCollapsed])
 const admin=role==='ADMIN'
 const title=useMemo(()=>MODS.find(([id])=>id===active)?.[1]||'Overview',[active])
 if(view==='login'||view==='signup'){const l=view==='login';return <main className="authPage"><LiquidGlass className="authCard"><div className="authLogo">{logo()}</div><div className="eyebrow">AUREKA WORKSPACE</div><h1>{l?'Masuk':'Daftar Akun'}</h1><p>{l?'Gunakan akun AUREKA sesuai role dan unit.':'Registrasi awal untuk calon PIC pelaporan.'}</p>{!l&&<><div className="field"><label>Nama Lengkap</label><input value={fullName} onChange={e=>setFullName(e.target.value)}/></div><div className="field"><label>Ruangan / Unit</label><select value={signupRoom} onChange={e=>setSignupRoom(e.target.value)}><option value="">Pilih unit</option>{roomsList.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div></>}<div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="field"><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></div><LiquidGlassButton className="wide" onClick={l?login:signup} disabled={busy}>{busy?'Memproses…':l?'Masuk':'Buat Akun'}</LiquidGlassButton><div className={message?'msg visible':'msg'}>{message}</div><button className="textButton" onClick={()=>setView(l?'signup':'login')}>{l?'Daftar akun baru':'Kembali ke login'}</button><button className="textButton muted" onClick={()=>setView('public')}>← Dashboard publik</button></LiquidGlass></main>}
 if(view==='workspace')return <main className={`workspaceRoot ${sidebarCollapsed?'sidebarIsCollapsed':''}`}><button className="workspaceScrim" onClick={()=>setMobile(false)} data-open={mobile}/><aside className={`sidebar glassPanel ${mobile?'mobileOpen':''}`}><div className="sideHeader"><div className="sideBrand">{logo()}<div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div><button type="button" className="sidebarToggle" onClick={()=>setSidebarCollapsed(v=>!v)} aria-label={sidebarCollapsed?'Expand sidebar':'Collapse sidebar'} title={sidebarCollapsed?'Expand sidebar':'Collapse sidebar'}><span>{sidebarCollapsed?'›':'‹'}</span></button></div><div className="navLabel">Workspace</div><nav className="sidebarNav"><button type="button" title="Overview" className={active==='home'?'navActive':''} onClick={()=>{setActive('home');setQualityOpen(false);setMobile(false)}}><NavIcon id="home"/><span>Overview</span></button>{MODS.map(([id,n])=><button type="button" title={n} key={id} className={active===id?'navActive':''} onClick={()=>{setActive(id);if(id!=='quality')setQualityOpen(false);setMobile(false)}}><NavIcon id={id}/><span>{n}</span></button>)}</nav><div className="profileChip"><div className="profileAvatar">PF</div><div className="profileText"><b>{profile?.full_name||user?.email}</b><span>{room?.name||'Unit belum dipetakan'}</span></div></div><LiquidGlassButton onClick={logout}><span className="logoutIcon">↪</span><span className="logoutLabel">Logout</span></LiquidGlassButton></aside><section className="workspaceContent"><div className="workspaceTop"><button className="mobileMenuButton" onClick={()=>setMobile(true)}>☰</button><div><div className="eyebrow">AUREKA</div><h2>{title}</h2><p>{profile?.full_name||user?.email}</p></div></div>{active==='home'?<div className="workspaceCards"><LiquidGlass className="metricCard"><span>Unit</span><b>{room?.name||'Belum dipetakan'}</b></LiquidGlass><LiquidGlass className="metricCard"><span>Laporan terakhir</span><b>—</b></LiquidGlass><LiquidGlass className="metricCard"><span>Kepatuhan mutu</span><b>—</b></LiquidGlass><LiquidGlass className="metricCard"><span>Action Required</span><b>0</b></LiquidGlass></div>:active==='quality'&&!qualityOpen?<div className="placeholderGrid">{CHILD.quality.map((x:string,i:number)=>i===0?<button key={x} className="placeholderCard glassPanel" onClick={()=>setQualityOpen(true)}><b>{x}</b><span>Workspace pengumpulan data dinamis</span></button>:<LiquidGlass key={x} className="placeholderCard"><b>{x}</b><span>Container modul siap dikembangkan.</span></LiquidGlass>)}</div>:active==='quality'&&qualityOpen?<div><button className="textButton" onClick={()=>setQualityOpen(false)}>← Indikator Mutu</button><QualityIndicatorWorkspace initialRoomId={room?.id||null} rooms={roomsList} isAdmin={admin}/></div>:active==='settings'?<GeneralSettings profile={profile} role={role} rooms={roomsList}/>:<div className="placeholderGrid">{(CHILD[active]||[]).map((x:string)=><LiquidGlass key={x} className="placeholderCard"><b>{x}</b><span>Container modul siap dikembangkan.</span></LiquidGlass>)}</div>}</section></main>
 return <main className="publicRoot">
  <header className="topbar glassPanel">
   <div className="brand">{logo()}<div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div>
   <LiquidGlassButton onClick={()=>setView('login')}>Login Workspace</LiquidGlassButton>
  </header>

  <section className="heroPublic">
   <div className="heroCopy">
    <div className="eyebrow">UPT RSUD SULTAN SYARIF MOHAMAD ALKADRIE</div>
    <h1>AUREKA<br/><em>Alkadrie Unified Risk Evaluation, Quality, Assessment.</em></h1>
    <p>AUREKA mengintegrasikan mutu, keselamatan pasien, manajemen risiko, analitik, dan reporting dalam satu workspace.</p>
   </div>

   <div className="quickDockWrap" aria-label="Shortcut modul utama">
    <div className="quickDockCaption">Quick overview</div>
    <nav className="quickDock glassPanel" aria-label="Modul utama AUREKA">
     {QUICK_MODULES.map(module=>
      <button key={module.id} type="button" className={`quickDockItem quickDock-${module.id}`} onClick={()=>setOverviewModule(module.id)} aria-label={`Buka overview ${module.label}`}>
       <span className="quickDockIcon"><ModuleIcon id={module.id}/></span>
       <span className="quickDockText"><b>{module.label}</b><small>{module.short}</small></span>
      </button>
     )}
    </nav>
   </div>
  </section>

  <div className="systemReveal">
   <button type="button" onClick={()=>setSystemOpen(v=>!v)}>{systemOpen?'Sembunyikan status sistem':'Tampilkan status sistem'}</button>
  </div>

  {systemOpen&&<section className="systemPanel glassPanel">
   <div className="systemGrid">
    <LiquidGlass><strong>37</strong><span>Ruangan aktif</span></LiquidGlass>
    <LiquidGlass><strong>6</strong><span>Modul terintegrasi</span></LiquidGlass>
    <LiquidGlass><strong>Online</strong><span>Backend</span></LiquidGlass>
    <LiquidGlass><strong>Aktif</strong><span>Authentication</span></LiquidGlass>
   </div>
  </section>}

  {overviewModule&&(()=>{
   const selected=QUICK_MODULES.find(m=>m.id===overviewModule)
   if(!selected)return null
   return <div className="overviewOverlay" role="presentation" onClick={()=>setOverviewModule(null)}>
    <section className="overviewModal glassPanel" role="dialog" aria-modal="true" aria-labelledby="overviewTitle" onClick={e=>e.stopPropagation()}>
     <div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'flex-start'}}>
      <div><div className="eyebrow">AUREKA · PREVIEW</div><h2 id="overviewTitle" style={{margin:'6px 0',fontSize:28}}>{selected.label}</h2><p style={{margin:0,color:'var(--muted)',fontSize:12}}>{selected.description}</p></div>
      <button type="button" onClick={()=>setOverviewModule(null)} aria-label="Tutup preview" style={{border:0,background:'rgba(255,255,255,.45)',borderRadius:12,width:38,height:38,fontSize:22,cursor:'pointer'}}>×</button>
     </div>
     <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:12,marginTop:20}}>
      {['Total data','Met target','Belum met','Kelengkapan'].map(label=><LiquidGlass key={label} style={{padding:16}}><span style={{display:'block',fontSize:10,color:'var(--muted)'}}>{label}</span><b style={{display:'block',fontSize:24,marginTop:8}}>—</b><small style={{fontSize:9,color:'var(--muted)'}}>Preview modul</small></LiquidGlass>)}
     </div>
     <div style={{marginTop:16,padding:18,borderRadius:20,background:'rgba(255,255,255,.22)',border:'1px solid rgba(255,255,255,.52)',fontSize:11,color:'var(--muted)'}}>Preview ini menjadi pintu masuk visual sebelum data operasional modul tersedia.</div>
    </section>
   </div>
  })()}
 </main>
}
