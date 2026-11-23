'use client'

import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import dynamic from 'next/dynamic'

const QualityWorkbookImportPanel = dynamic(() => import('@/components/QualityWorkbookImportPanel'), {
  ssr: false,
  loading: () => <p role="status">Memuat impor profil…</p>,
})

type ProfileImportScope = Omit<ComponentProps<typeof QualityWorkbookImportPanel>, 'importerKey' | 'dataOnly' | 'profilesOnly' | 'initialFile'>
export const QualityWorkbookProfileImportScope = createContext<ProfileImportScope | null>(null)

const IMPORT_LAYOUT_CSS = `
.aq.aqPortal.aqAuditWorkspace .qiuBody{display:grid!important;grid-template-columns:minmax(260px,320px) minmax(0,1fr)!important;gap:12px 16px!important;align-content:start!important;align-items:start!important;min-width:0!important;overflow-x:clip}
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar{grid-column:1!important;grid-row:1!important;align-self:start!important;position:sticky;top:0;z-index:2;min-width:0;display:grid;gap:12px}
.aq.aqPortal.aqAuditWorkspace .qiuBody>:not(.qiuSidebar){grid-column:2!important;min-width:0!important;max-width:100%}
.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.ciTable,.oiTable,.iiTable,.niTable,.piTable,.giTable,.liTable,.paTable,.iqTable,.phTable,.rmTable,[class$="Table"]){max-width:100%;min-width:0;overflow-x:auto;scrollbar-gutter:stable}
.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.ciStats,.oiStats,.iiStats,.niStats,.piStats,.paStats,[class$="Stats"]){max-width:100%;min-width:0}
.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.ciStat,.oiStat,.iiStat,.niStat,.piStat,.paStat,[class$="Stat"]){min-width:0}
.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.ciStat,.oiStat,.iiStat,.niStat,.piStat,.paStat,[class$="Stat"]) strong{overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.aq.aqPortal.aqAuditWorkspace .qiuBody table{width:100%;border-collapse:separate;border-spacing:0}
.aq.aqPortal.aqAuditWorkspace .qiuBody table :is(th,td){vertical-align:top}
.aq.aqPortal.aqAuditWorkspace .qiuBody :is(input[type="file"],select){max-width:100%}
.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.qwpToolbar,.ciMessage,.ciPrivacy,.ciUpload,.ciFlowHint){max-width:100%;min-width:0}
@media(max-width:940px){
.aq.aqPortal.aqAuditWorkspace .qiuBody{grid-template-columns:minmax(0,1fr)!important;overflow-x:visible}
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar{grid-column:1!important;grid-row:auto!important;position:static;grid-template-columns:repeat(auto-fit,minmax(205px,1fr))}
.aq.aqPortal.aqAuditWorkspace .qiuBody>:not(.qiuSidebar){grid-column:1!important}
}
@media(max-width:540px){
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar{grid-template-columns:minmax(0,1fr)}
.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.ciStats,.oiStats,.iiStats,.niStats,.piStats,.paStats,[class$="Stats"]){grid-template-columns:repeat(2,minmax(0,1fr))}
}
.episodeWorkbook.qiuBody{display:grid!important;grid-template-columns:minmax(260px,320px) minmax(0,1fr)!important;gap:12px 16px!important;min-width:0!important;align-items:start}
.episodeWorkbook.qiuBody>.qiuSidebar{grid-column:1!important;grid-row:1!important;align-self:start;position:sticky;top:0;z-index:2;min-width:0;display:grid;gap:12px}
.episodeWorkbook.qiuBody>:not(.qiuSidebar){grid-column:2!important;min-width:0!important;max-width:100%}
@media(max-width:940px){
.episodeWorkbook.qiuBody{grid-template-columns:minmax(0,1fr)!important}
.episodeWorkbook.qiuBody>.qiuSidebar{grid-column:1!important;grid-row:auto!important;position:static;grid-template-columns:repeat(auto-fit,minmax(205px,1fr))}
.episodeWorkbook.qiuBody>:not(.qiuSidebar){grid-column:1!important}
}
@media(max-width:540px){.episodeWorkbook.qiuBody>.qiuSidebar{grid-template-columns:minmax(0,1fr)}}


/* Prevent the historic one-grid-row-per-child overlaps. All non-sidebar content
   is now a single normal-flow content column for EVERY specialized importer. */
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuMain,
.episodeWorkbook.qiuBody>.qiuMain{
  grid-column:2!important;grid-row:1!important;display:flex!important;
  flex-direction:column!important;align-items:stretch!important;
  align-self:start!important;gap:12px!important;min-width:0!important;
  max-width:100%!important;min-height:0!important;position:relative!important;
}
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuMain>*,
.episodeWorkbook.qiuBody>.qiuMain>*{
  flex:0 0 auto;min-width:0!important;max-width:100%;box-sizing:border-box;
}
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuMain>:is([class$="Muted"],[class$="Note"],[class$="Privacy"],[class$="Hint"]),
.episodeWorkbook.qiuBody>.qiuMain>:is([class$="Muted"],[class$="Note"],[class$="Privacy"],[class$="Hint"]){
  position:relative!important;z-index:auto!important;clear:both!important;
  line-height:1.55;overflow-wrap:anywhere;white-space:normal;
}
.aq.aqPortal.aqAuditWorkspace .qiuMain>:is(.ciTable,.riTable,.iiTable,.niTable,.piTable,.giTable,.liTable,.paTable,.iqTable,.phTable,.rmTable,[class$="Table"]),
.aq.aqPortal.aqAuditWorkspace .qiuMain :is(.qwiPreviewScroll,.qwpPreviewScroll){
  display:block;position:relative!important;isolation:isolate;
  flex:0 0 auto!important;min-height:0!important;max-height:min(48dvh,440px)!important;
  overflow:auto!important;overscroll-behavior:contain;
  width:100%;max-width:100%;scrollbar-gutter:stable;
}
.aq.aqPortal.aqAuditWorkspace .qiuMain>:is(.ciTable,.riTable,.iiTable,.niTable,.piTable,.giTable,.liTable,.paTable,.iqTable,.phTable,.rmTable,[class$="Table"]):has(.qwpToolbar){
  max-height:min(48dvh,440px)!important;overflow:auto!important;min-height:0!important;
}
.aq.aqPortal.aqAuditWorkspace .qiuMain>:is(.ciTable,.riTable,.iiTable,.niTable,.piTable,.giTable,.liTable,.paTable,.iqTable,.phTable,.rmTable,[class$="Table"]):has(.qwpToolbar)>table{
  display:table;min-width:100%;width:max-content;max-height:none;overflow:visible;
}
.aq.aqPortal.aqAuditWorkspace .qiuMain :is(th,td){box-sizing:border-box}
.aq.aqPortal.aqAuditWorkspace .qiuMain :is(.ciStats,.riStats,.iiStats,.niStats,.piStats,.giStats,.liStats,.paStats,[class$="Stats"]){
  min-width:0;max-width:100%;align-self:stretch;grid-auto-rows:minmax(0,auto);
}
.aq.aqPortal.aqAuditWorkspace .qiuMain :is(.ciError,.riError,.iiError,.niError,.piError,.oiError,.ciWarning,.riWarn,.iiWarn,.niWarn,.piWarn){
  max-width:100%;overflow-wrap:anywhere;white-space:pre-line;max-height:min(25dvh,220px);overflow-y:auto;
}
.aq.aqPortal.aqAuditWorkspace .qiuMain .qwpToolbar{position:relative;z-index:1}
.aq.aqPortal.aqAuditWorkspace .qiuMain>label{max-width:100%;min-width:0;overflow-wrap:anywhere}
.aq.aqPortal.aqAuditWorkspace .qiuMain .qiuInlineMapping{width:100%;min-width:0}
.qiuBody .qiuField{display:grid;gap:5px;min-width:0;font-size:11px;font-weight:700;color:var(--aureka-color-foreground-secondary)}
.qiuBody .qiuMappingFields .qiuField > select{width:100%;min-width:0;min-height:44px!important;padding:7px 8px;border:1px solid var(--aureka-dialog-edge);border-radius:9px;background:var(--aureka-dialog-surface);color:var(--aureka-color-foreground);font:inherit;font-size:12px;text-overflow:ellipsis}
.qiuBody .qiuField select:focus-visible{outline:2px solid #16639b;outline-offset:1px}
.qiuBody .qiuMappingFields{display:grid;gap:10px;min-width:0}
.qiuBody .qiuMappingActions{display:flex;gap:8px;flex-wrap:wrap}
.qiuBody .qiuMappingActions button{min-height:44px;min-width:0;flex:1 1 100px;background:#0b467a;color:#fff;border:1px solid #0b467a;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:750;cursor:pointer}
.qiuBody .qiuMappingActions button:disabled{opacity:.65;cursor:not-allowed}
.qiuBody .qiuMappingNotice{margin:0;font-size:11px;line-height:1.55;color:var(--aureka-color-foreground-secondary);overflow-wrap:anywhere}
.qiuBody .qiuMappingError{margin:0;padding:8px;background:var(--aureka-color-danger-soft);border-radius:7px;font-size:11px;line-height:1.5;color:var(--aureka-color-danger)}
@media(max-width:940px){
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuMain,
.episodeWorkbook.qiuBody>.qiuMain{grid-column:1!important;grid-row:auto!important}
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar,
.episodeWorkbook.qiuBody>.qiuSidebar{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
}
@media(max-width:540px){
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar,
.episodeWorkbook.qiuBody>.qiuSidebar{grid-template-columns:minmax(0,1fr)}
.aq.aqPortal.aqAuditWorkspace .qiuMain>:is(.ciTable,.riTable,.iiTable,.niTable,.piTable,[class$="Table"]){max-height:min(42dvh,340px)!important}
}

/* Keep tall in-dialog mapping forms usable without pushing the preview below
   an extremely long sidebar; mobile switches to ordinary document flow. */
@media(min-width:941px){
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar,
.episodeWorkbook.qiuBody>.qiuSidebar{
 max-height:calc(100dvh - 185px);overflow-y:auto;overscroll-behavior:contain;
 scrollbar-width:thin;padding:0 3px 3px 0;
}
}
@media(max-width:940px){
.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar,
.episodeWorkbook.qiuBody>.qiuSidebar{
 max-height:none!important;overflow:visible!important;position:relative!important;
}
}
.qiuSidebar details.qiuCard { padding-block: 0; }
.qiuSidebar details.qiuCard[open] { padding-bottom: 12px; }
.qiuSidebar details.qiuCard > summary { min-height: 44px; align-content: center; cursor: pointer; font-size: 12px; font-weight: 750; }
@media (max-width: 640px) {
  .qiuBody .qiuMappingFields .qiuField > select { font-size: 16px !important; }
}
`

export default function QualityWorkbookImportSidebar() {
  const scope = useContext(QualityWorkbookProfileImportScope)
  return <aside className="qiuSidebar" aria-label="Impor profil indikator">
    <style>{IMPORT_LAYOUT_CSS}</style>
    {scope?.role === 'ADMIN'
      ? <QualityWorkbookImportPanel key={scope.roomId + ':' + scope.year} {...scope} importerKey="unit-logbook" profilesOnly />
      : <section className="qwiImportPanel">
          <h3>Impor profil indikator</h3>
          <p className="qwiHint">Impor profil tersedia untuk Superadmin.</p>
        </section>}
  </aside>
}

export function QualityWorkbookLogbookHeading() {
  return <header className="qiuLogbookHeading">
    <h3>Impor logbook</h3>
    <p className="qwiHint">Pilih workbook untuk menampilkan pratinjau tabel sebelum mengimpor data.</p>
  </header>
}

export function QualityWorkbookLogbookMapping({ children }: { children: ReactNode }) {
  return <details className="qwiMapping">
    <summary>Tautkan kolom logbook</summary>
    {children}
  </details>
}
