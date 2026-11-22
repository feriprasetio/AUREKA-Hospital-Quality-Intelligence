import type { Workbook } from 'exceljs-hardened'
import type { EpisodeProfile } from './patient-episode-workbook.ts'

const key = (value: unknown) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]/gu, '')
const label = (value: unknown) => String(value ?? '').trim()

// Five records in the reviewed 2026 snapshot omit a title. Their source rows
// and owners were verified against the annual master and neighboring codes.
const UNTITLED_2026: Readonly<Record<number, string>> = {
  23: '7.1', 24: '7.2', 130: '26.1', 132: '26.3', 140: '26.11',
}

export type AnnualCatalogPlan = {
  profiles: EpisodeProfile[]
  unresolved: Array<{ row: number; owner: string; title: string }>
}

export function prepareAnnualQualityCatalog(workbook: Workbook, reference: EpisodeProfile[]): AnnualCatalogPlan | null {
  const sheet = workbook.getWorksheet('Indikator')
  if (!sheet) return null
  const header = sheet.getRow(1)
  if (key(header.getCell(2).text) !== 'unitpenanggungjawab' || key(header.getCell(4).text) !== 'judulindikator') return null

  const profiles: EpisodeProfile[] = []
  const unresolved: AnnualCatalogPlan['unresolved'] = []
  const seen = new Set<string>()
  sheet.eachRow((row, rowNumber) => {
    const owner = label(row.getCell(2).text)
    const title = label(row.getCell(4).text)
    if (rowNumber === 1 || !title) return
    const candidates = reference.filter(profile => key(profile.unit_name) === key(owner) && (
      key(profile.title) === key(title) ||
      (!label(profile.title) && UNTITLED_2026[rowNumber] === profile.code)
    ))
    const profile = candidates.length === 1 ? candidates[0] : null
    if (!profile || seen.has(profile.code)) {
      unresolved.push({ row: rowNumber, owner, title })
      return
    }
    seen.add(profile.code)
    profiles.push({
      ...profile, title,
      schema_json: { ...profile.schema_json, source_excel_row: rowNumber, conversion_source: 'Indikator Mutu Tahunan 2026.xlsx' },
    })
  })
  return { profiles, unresolved }
}
