'use client'
import {useState} from 'react'
import AurekaModal from '@/components/ui/AurekaModal'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'
import {resolveProfileVersions,compareProfileVersions,type VersionRecord} from '@/lib/aureka/profile-version-compare'
export default function ProfileVersionReview({profiles,anchor,onClose}:{profiles:readonly VersionRecord[];anchor:VersionRecord;onClose:()=>void}){
 const history=resolveProfileVersions(profiles,anchor)
 const [beforeId,setBeforeId]=useState(()=>String(history.rows.find(row=>row.id!==anchor.id)?.id??''))
 const [afterId,setAfterId]=useState(String(anchor.id))
 const [changesOnly,setChangesOnly]=useState(true)
 const before=history.rows.find(r=>r.id===beforeId),after=history.rows.find(r=>r.id===afterId)
 const diff=before&&after?compareProfileVersions(before,after):null
 return <AurekaModal open title="Riwayat versi profil indikator" subtitle={String(anchor.code)+' · '+String(anchor.unit_name||'Unit')+' · '+String(anchor.profile_year)} onClose={onClose} size="xl" footer={<button type="button" className="akBtn akBtnGhost" onClick={onClose}>Tutup</button>}>
 <section className="continuumVersionReview" data-profile-version-review>
 <p>Sumber: aureka_quality.indicator_profiles. Hanya versi yang tersedia pada query resmi dengan kode, unit, dan tahun yang sama. Ini bukan bukti hubungan induk versi atau riwayat lengkap setiap edit. Tidak mengubah, memulihkan atau menerbitkan profil.</p>
 {history.ambiguous?<p role="alert">Nomor versi atau identitas tidak unik/valid. Perbandingan ditahan agar tidak memasangkan profil yang salah.</p>:history.rows.length<2?<p role="status">Belum ada dua versi sebanding dalam cakupan data yang tersedia.</p>:<>
 <div className="continuumReadGridTools"><label>Versi pembanding<select data-profile-before value={beforeId} onChange={e=>setBeforeId(e.target.value)}>{history.rows.map(row=><option key={String(row.id)} value={String(row.id)}>v{String(row.version)} · {String(row.status||'Belum tercatat')}</option>)}</select></label><label>Versi ditinjau<select data-profile-after value={afterId} onChange={e=>setAfterId(e.target.value)}>{history.rows.map(row=><option key={String(row.id)} value={String(row.id)}>v{String(row.version)} · {String(row.status||'Belum tercatat')}</option>)}</select></label><label><input type="checkbox" checked={changesOnly} onChange={e=>setChangesOnly(e.target.checked)}/> Hanya perbedaan</label></div>
 {diff?<><p role="status">{diff.filter(row=>row.changed).length} bidang berbeda. Status dan keaktifan merupakan nilai tersimpan saat ini, bukan status pada waktu publikasi.</p><WorkspaceTableViewport dataFirst label="Perbandingan metadata dua versi"><table className="rmTable" data-ak-sort="off" data-profile-version-diff><thead><tr><th>Bidang</th><th>v{String(before?.version)}</th><th>v{String(after?.version)}</th><th>Perbandingan</th></tr></thead><tbody>{diff.filter(row=>!changesOnly||row.changed).map(row=><tr key={row.label}><th scope="row">{row.label}</th><td>{row.before}</td><td>{row.after}</td><td>{row.changed?'Berbeda':'Sama'}</td></tr>)}</tbody></table></WorkspaceTableViewport></>:<p>Pilih dua nomor versi yang berbeda.</p>}
 </>}
 </section></AurekaModal>
}
