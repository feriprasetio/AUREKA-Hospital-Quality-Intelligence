import type { Worksheet } from 'exceljs-hardened'

export const PKRS_PROFESSIONS = [
  'Petugas Admisi', 'Dokter IGD', 'Perawat IGD', 'Dokter Rawat Inap',
  'Perawat / Bidan Rawat Inap', 'Farmasi', 'Nutrisionis', 'Rehabilitasi Medik',
] as const

type Topic = { column: number; address: string; label: string }
export type PkrsGroup = { profession: typeof PKRS_PROFESSIONS[number]; topics: Topic[] }

export function readPkrsWorkbookGroups(sheet: Worksheet, header: number): PkrsGroup[] {
  if (header < 2) return []
  const groups = PKRS_PROFESSIONS.map(profession => ({ profession, topics: [] as Topic[] }))
  const titles = sheet.getRow(header - 1)
  const topics = sheet.getRow(header)
  topics.eachCell((cell, column) => {
    const groupCell = titles.getCell(column)
    const label = String(cell.value ?? '').trim()
    const profession = String(groupCell.master.value ?? '').trim()
    const group = groups.find(item => item.profession === profession)
    if (group && label) group.topics.push({ column, address: cell.address.replace(/\d+$/, ''), label })
  })
  return groups.every(group => group.topics.length) ? groups : []
}

export function readPkrsEducation(
  groups: PkrsGroup[], read: (column: number) => unknown, layoutFields: readonly string[],
) {
  const formFields: Record<string, string> = {}
  const education = groups.map(({ profession, topics }) => {
    const responses = topics.map(({ column, address, label }) => {
      const value = read(column)
      return { column: address, topic: label, answer: value == null ? null : String(value).trim() || null }
    })
    const entries = responses.filter(topic => topic.answer !== null)
    if (entries.length) {
      const field = layoutFields.find(name => name.startsWith(profession + ' (')) ?? profession
      formFields[field] = entries.map(topic => topic.topic + ' – ' + topic.answer).join('\n')
    }
    return { profession, topics: responses }
  })
  return { education, formFields }
}
