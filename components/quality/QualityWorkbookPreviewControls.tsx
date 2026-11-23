'use client'

import { useMemo, useState } from 'react'

export type WorkbookPreviewMode = 'all' | 'warnings'

function hasWarning(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false
  const value = item as Record<string, unknown>
  return (Array.isArray(value.warnings) && value.warnings.length > 0)
    || (Array.isArray(value.issues) && value.issues.length > 0)
    || value.needsReview === true
}

export function useQualityWorkbookPreview<T>(rows: readonly T[]) {
  const [previewMode, setPreviewMode] = useState<WorkbookPreviewMode>('all')
  const [previewSize, setPreviewSize] = useState(50)
  const warningCount = useMemo(() => rows.reduce((sum, row) => sum + (hasWarning(row) ? 1 : 0), 0), [rows])
  const filtered = useMemo(() => previewMode === 'warnings'
    ? rows.filter(hasWarning)
    : rows, [rows, previewMode])
  const preview = useMemo(() => filtered.slice(0, previewSize), [filtered, previewSize])

  return {
    preview,
    total: rows.length,
    filteredCount: filtered.length,
    warningCount,
    previewMode,
    setPreviewMode,
    previewSize,
    setPreviewSize,
  }
}

type PreviewConfiguration = ReturnType<typeof useQualityWorkbookPreview<unknown>>

export default function QualityWorkbookPreviewControls({
  config,
  title = 'Pratinjau data',
}: {
  config: PreviewConfiguration
  title?: string
}) {
  if (!config.total) return null

  return (
    <div className="qwpToolbar" role="group" aria-label="Pengaturan pratinjau workbook">
      <div className="qwpToolbarTitle">
        <strong>{title}</strong>
        <span>{config.preview.length.toLocaleString('id-ID')} dari {config.filteredCount.toLocaleString('id-ID')} baris ditampilkan</span>
      </div>
      <div className="qwpToolbarFilters">
        {config.warningCount > 0 && (
          <label>
            <span>Filter</span>
            <select aria-label="Filter pratinjau workbook" value={config.previewMode}
              onChange={event => config.setPreviewMode(event.target.value as WorkbookPreviewMode)}>
              <option value="all">Semua baris</option>
              <option value="warnings">Perlu ditinjau ({config.warningCount.toLocaleString('id-ID')})</option>
            </select>
          </label>
        )}
        <label>
          <span>Jumlah baris</span>
          <select aria-label="Jumlah baris pratinjau workbook" value={config.previewSize}
            onChange={event => config.setPreviewSize(Number(event.target.value))}>
            <option value={20}>20 baris</option>
            <option value={50}>50 baris</option>
            <option value={100}>100 baris</option>
            <option value={120}>120 baris</option>
          </select>
        </label>
      </div>
    </div>
  )
}
