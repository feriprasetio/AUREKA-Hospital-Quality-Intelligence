// Cadangan data AUREKA dalam satu workbook Excel untuk arsip/akreditasi.
// Sengaja TANPA identitas pasien: isian formulir IKP (nama, No. RM, usia, kronologi) dan isi logbook per pasien tidak ikut.
import ExcelJS from 'exceljs-hardened'
import { aurekaSupabase } from '@/lib/aureka/supabase'

type Row = Record<string, unknown>
export type BackupSheet = { name: string; columns: Array<{ key: string; header: string; width?: number }>; rows: Row[]; note?: string }

async function pageAll<T = Row>(build: (from: number, to: number) => any, cap = 20000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw error
    out.push(...((data || []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

const safe = <T>(p: Promise<T>, fallback: T, problems: string[], label: string) => p.catch((e: any) => { problems.push(label + ': ' + (e?.message || 'gagal dimuat')); return fallback })

/** Kumpulkan data per lembar. Lembar yang gagal dimuat (mis. hak akses) dicatat di lembar "Info", bukan menggagalkan semuanya. */
export async function collectBackup(year: number, rooms: Array<{ id: number | string; name: string }>) {
  const problems: string[] = []
  const roomName = (id: unknown) => rooms.find((r) => Number(r.id) === Number(id))?.name ?? (id == null ? '' : 'Unit ' + id)
  const q = aurekaSupabase.schema('aureka_quality' as any) as any
  const ps = aurekaSupabase.schema('aureka_patient_safety' as any) as any
  const rk = aurekaSupabase.schema('aureka_risk' as any) as any

  const [profiles, reporting, incidents, risks, gov] = await Promise.all([
    safe(pageAll((a, b) => q.from('indicator_profiles').select('code,title,room_id,indicator_type,category,unit_of_measure,target_text,numerator_definition,denominator_definition,status,is_active,profile_year').eq('profile_year', year).order('code').range(a, b)), [] as Row[], problems, 'Profil indikator'),
    safe(Promise.resolve(aurekaSupabase.rpc('aureka_quality_room_reporting_status', { p_year: year })).then(({ data, error }: any) => { if (error) throw error; return (data || []) as Row[] }), [] as Row[], problems, 'Kepatuhan logbook'),
    safe(pageAll((a, b) => ps.from('incidents').select('incident_code,incident_date,unit_name,incident_type,status,created_at,submitted_at').gte('incident_date', year + '-01-01').lte('incident_date', year + '-12-31').order('incident_date').range(a, b)), [] as Row[], problems, 'Insiden (IKP)'),
    safe(pageAll((a, b) => rk.from('risk_register').select('*').order('id').range(a, b)), [] as Row[], problems, 'Register risiko'),
    safe(Promise.resolve(aurekaSupabase.rpc('aureka_gov_program_list', { p_year: year })).then(({ data, error }: any) => { if (error) throw error; return data as any }), null as any, problems, 'Rekomendasi & RTL'),
  ])

  // Rekap logbook: satu baris per ruangan, kolom bulan berisi ✓ bila sudah melapor.
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const reported = new Map<number, Set<number>>()
  for (const r of reporting) { const id = Number(r.room_id); if (!reported.has(id)) reported.set(id, new Set()); reported.get(id)!.add(Number(r.month)) }
  const logbookRows = rooms.map((room) => { const set = reported.get(Number(room.id)) || new Set<number>(); const row: Row = { unit: room.name, total: set.size }; MON.forEach((m, i) => { row[m] = set.has(i + 1) ? '✓' : '' }); return row })

  const riskCols = risks.length ? Object.keys(risks[0]).filter((k) => !/^(created_by|updated_by)$/.test(k)) : []
  const sheets: BackupSheet[] = [
    { name: 'Profil Indikator', columns: [
      { key: 'code', header: 'Kode', width: 10 }, { key: 'title', header: 'Indikator', width: 48 }, { key: 'unit', header: 'Unit', width: 32 }, { key: 'indicator_type', header: 'Jenis/program', width: 28 },
      { key: 'category', header: 'Kategori', width: 14 }, { key: 'unit_of_measure', header: 'Satuan', width: 16 }, { key: 'target_text', header: 'Target', width: 14 },
      { key: 'numerator_definition', header: 'Numerator', width: 40 }, { key: 'denominator_definition', header: 'Denumerator', width: 40 }, { key: 'state', header: 'Status', width: 14 }],
      rows: profiles.map((p) => ({ ...p, unit: roomName(p.room_id), state: p.is_active ? 'Aktif' : String(p.status ?? '') })) },
    { name: 'Kepatuhan Logbook', columns: [{ key: 'unit', header: 'Ruangan', width: 36 }, ...MON.map((m) => ({ key: m, header: m, width: 6 })), { key: 'total', header: 'Bulan terisi', width: 12 }], rows: logbookRows },
    { name: 'Insiden IKP', note: 'Tanpa identitas pasien dan pelapor.', columns: [
      { key: 'incident_code', header: 'Kode', width: 16 }, { key: 'incident_date', header: 'Tanggal', width: 12 }, { key: 'unit_name', header: 'Unit', width: 30 },
      { key: 'incident_type', header: 'Jenis', width: 40 }, { key: 'status', header: 'Status', width: 14 }, { key: 'submitted_at', header: 'Dikirim', width: 20 }], rows: incidents },
    { name: 'Register Risiko', columns: riskCols.map((k) => ({ key: k, header: k, width: Math.min(40, Math.max(10, k.length + 4)) })), rows: risks },
    { name: 'Rekomendasi', columns: [{ key: 'code', header: 'Kode', width: 12 }, { key: 'title', header: 'Rekomendasi', width: 50 }, { key: 'priority', header: 'Prioritas', width: 12 }, { key: 'source', header: 'Sumber', width: 20 }, { key: 'given_by_name', header: 'Pemberi', width: 22 }, { key: 'given_at', header: 'Tanggal', width: 12 }, { key: 'status', header: 'Status', width: 14 }], rows: Array.isArray(gov?.recommendations) ? gov.recommendations : [] },
    { name: 'RTL', columns: [
      { key: 'title', header: 'Rencana tindak lanjut', width: 50 }, { key: 'assigned_to_name', header: 'Penanggung jawab', width: 26 }, { key: 'room_name', header: 'Unit', width: 26 },
      { key: 'due_date', header: 'Tenggat', width: 12 }, { key: 'status', header: 'Status', width: 14 }, { key: 'progress_note', header: 'Catatan progres', width: 40 }], rows: Array.isArray(gov?.actions) ? gov.actions : [] },
  ]
  return { sheets, problems }
}

export async function buildBackupXlsx(year: number, sheets: BackupSheet[], problems: string[], preparedBy: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AUREKA Hospital Quality Intelligence'
  wb.created = new Date()
  const info = wb.addWorksheet('Info')
  info.columns = [{ header: 'Keterangan', key: 'k', width: 28 }, { header: 'Isi', key: 'v', width: 70 }]
  info.addRows([
    ['Cadangan data AUREKA', 'Tahun ' + year],
    ['Dibuat', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Pontianak' }) + ' oleh ' + preparedBy],
    ['Privasi', 'Tidak memuat identitas pasien maupun isi formulir IKP. Simpan sesuai kebijakan rahasia RS.'],
    ...sheets.map((s) => ['Lembar ' + s.name, s.rows.length + ' baris' + (s.note ? ' · ' + s.note : '')]),
    ...problems.map((p) => ['Tidak termuat', p]),
  ])
  info.getRow(1).font = { bold: true }
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31))
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }))
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const r of s.rows) {
      const out: Row = {}
      for (const c of s.columns) {
        const v = r[c.key]
        out[c.key] = v == null ? '' : typeof v === 'number' || typeof v === 'boolean' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)
      }
      ws.addRow(out)
    }
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
